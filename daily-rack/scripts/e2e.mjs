// End-to-end check of the guest loop on a phone-sized viewport:
// first open -> rack -> result -> clip -> real MP4 export, then a friend opening the shared link.
// Usage: BASE_URL=http://localhost:8787 node scripts/e2e.mjs   (server must be running with a fresh DB)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = resolve(process.env.E2E_OUT ?? join(import.meta.dirname, '../e2e-artifacts'));
mkdirSync(OUT, { recursive: true });

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// A fake microphone lets the voiceover path run headless.
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  // 1. First open lands on the rack, not a sign-up wall.
  const player = await browser.newContext({ ...phone, acceptDownloads: true, permissions: ['microphone'] });
  const page = await player.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto(BASE);
  await page.waitForURL('**/rack');
  check('first open goes straight to the rack', page.url().endsWith('/rack'));

  await page.getByRole('dialog', { name: 'Quick question' }).waitFor();
  await page.screenshot({ path: join(OUT, '01-first-open-preferences.png') });
  await page.getByRole('button', { name: "I'm learning" }).click();
  await page.getByRole('button', { name: 'Weekly' }).click();
  await page.getByRole('button', { name: 'Deal my rack' }).click();

  const submit = page.getByRole('button', { name: 'See the split' });
  check('submit is disabled before choosing', await submit.isDisabled());
  await page.screenshot({ path: join(OUT, '02-rack.png'), fullPage: true });

  // 2. Pick a section and pass three tiles by tapping (no dragging).
  await page.getByRole('button', { name: '2468' }).click();
  await page.getByRole('button', { name: 'Seven character', exact: true }).click();
  await page.getByRole('button', { name: 'Nine character', exact: true }).click();
  await page.getByRole('button', { name: 'Flower', exact: true }).click();
  // A fourth tile is refused with an explanation instead of silently replacing one.
  await page.getByRole('button', { name: 'Red dragon', exact: true }).click();
  check('a fourth tile is refused', (await page.locator('.felt-hint').textContent()).includes('Choose 3 tiles'));
  // Swap the flower back out for the red dragon.
  await page.getByRole('button', { name: /Flower, in pass slot 3/ }).click();
  await page.getByRole('button', { name: 'Red dragon', exact: true }).click();
  check('deal keeps 13 tiles across rack and tray', (await page.locator('.deal .tile-button').count()) + 3 === 13);
  await page.screenshot({ path: join(OUT, '03-rack-selected.png'), fullPage: true });

  // The draft survives a reload.
  await page.reload();
  await page.locator('.tray-slots .tile-button').nth(2).waitFor({ timeout: 5000 }).catch(() => undefined);
  check('draft survives reload', (await page.locator('.tray-slots .tile-button').count()) === 3);

  await submit.click();
  await page.waitForURL('**/result/**');
  await page.getByText('You found one strong pass.').waitFor();
  check('result compares with one strong pass', true);
  if (process.env.E2E_EXPECT_SPLIT) {
    check('split shows rates and labels demo answers', (await page.locator('.split-row').count()) >= 3 && (await page.getByText(/demo answers/).isVisible()));
  } else {
    check('small split is withheld honestly', await page.getByText('More players are weighing in.').isVisible());
  }
  await page.screenshot({ path: join(OUT, '04-result.png'), fullPage: true });
  const attemptId = page.url().split('/').pop();

  // 3. Clip preview and a real MP4 export.
  await page.getByRole('button', { name: 'Make my clip' }).click();
  await page.waitForURL('**/clip/**');
  await page.locator('.clip-frame canvas').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '05-clip-hook.png'), fullPage: true });
  await page.getByRole('slider', { name: 'Scrub preview' }).fill('9');
  await page.waitForTimeout(300);
  await page.locator('.clip-frame').screenshot({ path: join(OUT, '06-clip-preview-9s.png') });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    page.getByRole('button', { name: 'Save video' }).click(),
  ]);
  const videoPath = join(OUT, 'daily-rack-clip.mp4');
  await download.saveAs(videoPath);
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames:format=duration,size', '-count_frames', '-of', 'json', videoPath]).toString(),
  );
  const video = probe.streams.find((s) => s.codec_type === 'video');
  check('export is a 1080x1920 MP4', video?.width === 1080 && video?.height === 1920, `${video?.codec_name} ${video?.width}x${video?.height}`);
  check('export runs 32 s at 30 fps', Math.abs(Number(probe.format.duration) - 32) < 0.2 && video?.r_frame_rate === '30/1', `${probe.format.duration}s, ${video?.nb_frames} frames, ${video?.r_frame_rate}`);
  check('export is a real file', statSync(videoPath).size > 100_000, `${(statSync(videoPath).size / 1e6).toFixed(2)} MB`);
  for (const t of [1, 5, 9, 17, 22, 27, 30.5]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=540:-1', join(OUT, `frame-${String(t).replace('.', '_')}s.png`)]);
  }
  await page.screenshot({ path: join(OUT, '07-clip-exported.png'), fullPage: true });

  // Voiceover: record a few seconds with the fake microphone, export again, expect an audio track.
  await page.getByRole('button', { name: /Add voiceover/ }).click();
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /Stop/ }).click();
  await page.getByRole('button', { name: 'Delete voiceover' }).waitFor();
  await page.screenshot({ path: join(OUT, '07b-voiceover-recorded.png'), fullPage: true });
  const [voiceDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    page.getByRole('button', { name: 'Save video' }).click(),
  ]);
  const voicePath = join(OUT, 'daily-rack-clip-voice.mp4');
  await voiceDownload.saveAs(voicePath);
  const voiceProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,sample_rate,duration', '-of', 'json', voicePath]).toString());
  const audio = voiceProbe.streams.find((s) => s.codec_type === 'audio');
  check('voiceover export carries an audio track', Boolean(audio), audio ? `${audio.codec_name} ${audio.sample_rate} Hz, ${Number(audio.duration).toFixed(1)} s` : 'none');

  // 4. Share link: a friend plays the exact rack without seeing the pass first.
  const link = await page.evaluate(async (id) => {
    const res = await fetch('/v1/share-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: id, publishPass: true }) });
    return res.json();
  }, attemptId);
  const friend = await browser.newContext(phone);
  const friendPage = await friend.newPage();
  await friendPage.goto(`${BASE}${link.path}`);
  await friendPage.getByText('Someone shared this exact rack with you.').waitFor();
  check('shared link opens the exact rack', (await friendPage.locator('.deal .tile-button').count()) === 13);
  await friendPage.screenshot({ path: join(OUT, '08-shared-link.png'), fullPage: true });
  await friendPage.getByRole('button', { name: 'Consecutive Run' }).click();
  await friendPage.getByRole('button', { name: 'Two dot', exact: true }).first().click();
  await friendPage.getByRole('button', { name: 'Four dot', exact: true }).click();
  await friendPage.getByRole('button', { name: 'White dragon', exact: true }).click();
  await friendPage.getByRole('button', { name: 'See the split' }).click();
  await friendPage.waitForURL('**/result/**');
  const posterShown = await friendPage.getByText('The pass that was shared with you').waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('friend sees the poster pass after answering', posterShown);
  await friendPage.screenshot({ path: join(OUT, '09-friend-result.png'), fullPage: true });

  // 5. Returning player: Today and You.
  await page.goto(`${BASE}/`);
  await page.waitForURL('**/today');
  check('returning player lands on Today', await page.getByRole('button', { name: 'See your result' }).isVisible());
  await page.screenshot({ path: join(OUT, '10-today.png'), fullPage: true });
  await page.goto(`${BASE}/you`);
  await page.getByText('racks solved').waitFor();
  await page.screenshot({ path: join(OUT, '11-you.png'), fullPage: true });

  check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Artifacts in ${OUT}`);
process.exit(failed.length ? 1 : 0);
