// End-to-end check of the Expo web build on phone-sized viewports:
//   1. Daily Rack: first open -> rack -> result -> clip -> real MP4 export -> shared link.
//   2. A full hand against three computer players, Charleston to Mahjong.
//   3. Two guests become friends by code and chat.
//   4. The friends sit at the same live table and play a hand together, with table chat.
//   5. Game Night: plan, invite link, vote, RSVP, lock in, calendar file, play online instead.
// Usage: BASE_URL=http://localhost:8787 node scripts/e2e.mjs
//   (server running on a fresh DB with the web build: npm run build && BOT_DELAY_MS=120 npm start)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = resolve(process.env.E2E_OUT ?? join(import.meta.dirname, '../e2e-artifacts'));
const SKIP_CLIP = process.env.E2E_SKIP_CLIP === '1';
mkdirSync(OUT, { recursive: true });

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
const visible = (page, testId) => page.getByTestId(testId).isVisible().catch(() => false);
const enabled = async (page, testId) => (await visible(page, testId)) && (await page.getByTestId(testId).getAttribute('aria-disabled')) !== 'true';
const tap = (page, testId) => page.getByTestId(testId).click({ timeout: 3000 }).catch(() => undefined);

/**
 * Plays a seat at a table until the hand ends: passes the first three non-joker tiles in
 * the Charleston, stops at one round, offers no courtesy tiles, never calls, declares
 * Mahjong whenever it can, and otherwise discards the drawn (or last) tile.
 */
async function autoplay(page, { timeout = 300_000, shots = {} } = {}) {
  const until = Date.now() + timeout;
  const taken = new Set();
  const snap = async (key) => {
    if (shots[key] && !taken.has(key)) {
      taken.add(key);
      await shot(page, shots[key]);
    }
  };
  let discards = 0;
  while (Date.now() < until) {
    if (await visible(page, 'result-panel')) return { done: true, discards };
    if (await enabled(page, 'action-claim-mahjong')) await tap(page, 'action-claim-mahjong');
    else if (await enabled(page, 'action-mahjong')) await tap(page, 'action-mahjong');
    else if (await visible(page, 'action-pass')) {
      await snap('charleston');
      const tiles = page.locator('[data-testid^="rack-tile-"]');
      let picked = 0;
      for (let i = 0; i < (await tiles.count()) && picked < 3; i++) {
        const label = (await tiles.nth(i).getAttribute('aria-label')) ?? '';
        if (label.startsWith('Joker')) continue;
        await tiles.nth(i).click({ timeout: 2000 }).catch(() => undefined);
        picked += 1;
      }
      await tap(page, 'action-pass');
    } else if (await visible(page, 'action-vote-no')) await tap(page, 'action-vote-no');
    else if (await visible(page, 'action-courtesy-0')) await tap(page, 'action-courtesy-0');
    else if (await visible(page, 'action-claim-pass')) await tap(page, 'action-claim-pass');
    else if (await visible(page, 'action-discard')) {
      const tiles = page.locator('[data-testid^="rack-tile-"]');
      const n = await tiles.count();
      let target = n - 1;
      for (let i = n - 1; i >= 0; i--) {
        const label = (await tiles.nth(i).getAttribute('aria-label')) ?? '';
        if (label.includes('just drawn') && !label.startsWith('Joker')) {
          target = i;
          break;
        }
        if (!label.startsWith('Joker') && target === n - 1) target = i;
      }
      await tiles.nth(target).click({ timeout: 2000 }).catch(() => undefined);
      if (discards === 3) await snap('midgame');
      if (await enabled(page, 'action-discard')) {
        await tap(page, 'action-discard');
        discards += 1;
      }
    } else await page.waitForTimeout(150);
  }
  return { done: false, discards };
}

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const pageErrors = [];
const watch = (page, who) => page.on('pageerror', (e) => pageErrors.push(`${who}: ${e.message}`));

try {
  // ------------------------------------------------------------------ 1. Daily Rack
  const ann = await browser.newContext({ ...phone, acceptDownloads: true, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  const page = await ann.newPage();
  watch(page, 'ann');
  await page.goto(BASE);
  await page.waitForURL('**/rack');
  check('first open goes straight to the rack', page.url().endsWith('/rack'));
  await page.getByText('Quick question').waitFor();
  await shot(page, '01-first-open-preferences');
  await page.getByRole('button', { name: "I'm learning" }).click();
  await page.getByRole('button', { name: 'Weekly' }).click();
  await page.getByRole('button', { name: 'Deal my rack' }).click();
  await page.getByText('Quick question').waitFor({ state: 'hidden' });

  const submit = page.getByTestId('submit-pass');
  check('submit is disabled before choosing', (await submit.getAttribute('aria-disabled')) === 'true');
  await page.getByRole('radiogroup', { name: 'Section to aim for' }).getByRole('button').first().click();
  // Pass the first three tiles that can be passed (jokers and flowers-to-keep are refused).
  for (let picked = 0; picked < 3; picked++) {
    const buttons = page.getByLabel('Your deal').getByRole('button');
    for (let i = 0; i < (await buttons.count()); i++) {
      const label = (await buttons.nth(i).getAttribute('aria-label')) ?? '';
      if (/cannot be passed|pass slot|Sort by suit/.test(label)) continue;
      await buttons.nth(i).click();
      break;
    }
  }
  check('three tiles land in the pass tray', await page.getByText('3 of 3 selected').isVisible());
  // A fourth tile is refused with an explanation instead of silently replacing one.
  {
    const buttons = page.getByLabel('Your deal').getByRole('button');
    for (let i = 0; i < (await buttons.count()); i++) {
      const label = (await buttons.nth(i).getAttribute('aria-label')) ?? '';
      if (/cannot be passed|pass slot|Sort by suit/.test(label)) continue;
      await buttons.nth(i).click();
      break;
    }
    check('a fourth tile is refused', await page.getByText(/Choose 3 tiles\. Tap one in your pass to swap it out\./).isVisible());
    check('deal keeps 13 tiles across rack and tray', (await page.getByLabel('Your deal').getByRole('button', { name: /^(?!Sort)/ }).count()) === 13);
  }
  await shot(page, '02-rack-selected');
  await page.reload();
  await page.getByText('3 of 3 selected').waitFor({ timeout: 8000 }).catch(() => undefined);
  check('draft survives reload', await page.getByText('3 of 3 selected').isVisible());
  await submit.click();
  await page.waitForURL('**/result/**');
  await page.getByText('More players are weighing in.').or(page.getByText('The community split')).first().waitFor();
  check('result screen shows the comparison', await page.getByText('Your pass').first().isVisible());
  await shot(page, '03-result');
  const attemptId = page.url().split('/').pop();

  if (!SKIP_CLIP) {
    await page.getByTestId('make-clip').click();
    await page.waitForURL('**/clip/**');
    await page.locator('canvas').first().waitFor();
    await page.waitForTimeout(800);
    await shot(page, '04-clip-studio');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.getByTestId('save-video').click()]);
    const videoPath = join(OUT, 'daily-rack-clip.mp4');
    await download.saveAs(videoPath);
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', videoPath]).toString(),
    );
    const video = probe.streams.find((s) => s.codec_type === 'video');
    check('clip exports a 1080x1920 MP4', video?.width === 1080 && video?.height === 1920, `${video?.codec_name} ${video?.width}x${video?.height}, ${Number(probe.format.duration).toFixed(1)} s`);
    check('clip file is real', statSync(videoPath).size > 100_000, `${(statSync(videoPath).size / 1e6).toFixed(2)} MB`);

    // Voiceover: record a few seconds with the fake microphone, export again, expect an audio track.
    await page.getByRole('button', { name: /Add voiceover/ }).click();
    await page.getByRole('button', { name: 'Record' }).click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /^Stop/ }).click();
    await page.getByRole('button', { name: 'Delete voiceover' }).waitFor();
    const [voiceDownload] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.getByTestId('save-video').click()]);
    const voicePath = join(OUT, 'daily-rack-clip-voice.mp4');
    await voiceDownload.saveAs(voicePath);
    const voiceProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,sample_rate,duration', '-of', 'json', voicePath]).toString());
    const audio = voiceProbe.streams.find((s) => s.codec_type === 'audio');
    check('voiceover export carries an audio track', Boolean(audio), audio ? `${audio.codec_name} ${audio.sample_rate} Hz, ${Number(audio.duration).toFixed(1)} s` : 'none');
  }

  const link = await page.evaluate(async (id) => {
    const res = await fetch('/v1/share-links', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: id, publishPass: true }) });
    return res.json();
  }, attemptId);

  // ------------------------------------------------------------------ 2. A hand against the computer
  await page.goto(`${BASE}/play`);
  await page.getByTestId('quick-play').waitFor();
  await shot(page, '05-play-tab');
  await page.getByTestId('quick-play').click();
  await page.waitForURL('**/table/**');
  await page.getByTestId('table-status').waitFor();
  const solo = await autoplay(page, { shots: { charleston: '06-vs-computer-charleston', midgame: '07-vs-computer-midgame' } });
  check('a full hand against the computer reaches a result', solo.done, `${solo.discards} discards by the human seat`);
  await page.getByTestId('result-panel').scrollIntoViewIfNeeded();
  await shot(page, '08-vs-computer-result');
  check('the next hand can be dealt', await visible(page, 'next-hand'));
  await tap(page, 'next-hand');
  await page.getByTestId('result-panel').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  await page.getByText(/Hand 2: .+ is East\./).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  await page.getByTestId('table-status').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot(page, '08b-vs-computer-hand-2');
  check('hand 2 starts with the deal passed on', await page.getByText(/Hand 2: .+ is East\./).first().isVisible(), (await page.getByTestId('table-status').textContent().catch(() => '')) ?? '');

  // ------------------------------------------------------------------ 3. Friends and chat
  const bea = await browser.newContext({ ...phone, acceptDownloads: true });
  const beaPage = await bea.newPage();
  watch(beaPage, 'bea');
  await beaPage.goto(`${BASE}/friends`);
  const beaCode = (await beaPage.getByTestId('my-friend-code').textContent())?.trim();
  check('each guest gets a friend code', Boolean(beaCode && beaCode.length >= 6), beaCode);

  await page.goto(`${BASE}/you`);
  await page.getByTestId('profile-name').fill('Ann');
  await page.getByTestId('save-name').click();
  await page.getByRole('button', { name: 'Saved' }).waitFor();
  await beaPage.goto(`${BASE}/you`);
  await beaPage.getByTestId('profile-name').fill('Bea');
  await beaPage.getByTestId('save-name').click();
  await beaPage.getByRole('button', { name: 'Saved' }).waitFor();

  await page.goto(`${BASE}/friends`);
  await page.getByTestId('friend-code-input').fill(beaCode);
  await page.getByTestId('add-friend').click();
  await page.getByText(/Request sent to Bea/).waitFor();
  await beaPage.goto(`${BASE}/friends`);
  await beaPage.getByText('Requests').waitFor();
  await shot(beaPage, '09-friend-request');
  await beaPage.getByRole('button', { name: 'Accept' }).click();
  await beaPage.getByRole('button', { name: 'Chat with Ann' }).first().waitFor();
  await page.getByRole('button', { name: /Chat with Bea/ }).first().waitFor({ timeout: 10_000 });
  check('friend request accepted on both sides', true);
  await shot(page, '10-friends-list');

  await beaPage.getByRole('button', { name: 'Chat with Ann' }).first().click();
  await beaPage.waitForURL('**/chat/**');
  await beaPage.getByTestId('chat-input').fill('Game tonight?');
  await beaPage.getByTestId('chat-send').click();
  await beaPage.getByLabel('You: Game tonight?').waitFor();
  await page.getByText('1 new').waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('unread chat shows on the friends list', await page.getByText('1 new').isVisible());
  await page.getByRole('button', { name: /Chat with Bea/ }).first().click();
  await page.getByLabel('Bea: Game tonight?').waitFor();
  await page.getByTestId('chat-input').fill('Yes! Setting up a table.');
  await page.getByTestId('chat-send').click();
  await beaPage.getByLabel('Ann: Yes! Setting up a table.').waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('chat messages arrive live', await beaPage.getByLabel('Ann: Yes! Setting up a table.').isVisible());
  await shot(beaPage, '11-chat');

  // ------------------------------------------------------------------ 4. A live table with a friend
  await page.goBack();
  await page.getByRole('button', { name: 'Play with Bea' }).click();
  await page.waitForURL('**/table/new**');
  await page.getByRole('radio', { name: 'Live' }).click();
  await page.getByText('Held for Bea').waitFor();
  await shot(page, '12-new-table');
  await page.getByTestId('create-table').click();
  await page.waitForURL(/\/table\/[0-9a-f-]{36}/);
  await page.getByTestId('table-code').waitFor();
  await page.getByText('Held for Bea').waitFor({ timeout: 5000 }).catch(() => undefined);
  check('lobby holds a seat for the friend', await page.getByText('Held for Bea').isVisible());
  check('start waits for every seat', (await page.getByTestId('start-table').getAttribute('aria-disabled')) === 'true');

  await beaPage.goto(`${BASE}/play`);
  await beaPage.getByText('Invited').waitFor({ timeout: 10_000 });
  check('the friend sees the invite on Play', true);
  await beaPage.getByText('Invited').click();
  await beaPage.getByTestId('join-table').click();
  await beaPage.getByText('The host deals the first hand once every seat is filled.').waitFor();
  await page.getByRole('button', { name: 'Table chat' }).click();
  await page.getByTestId('chat-input').fill('Good luck!');
  await page.getByTestId('chat-send').click();
  await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
  await beaPage.getByRole('button', { name: /Table chat, 1 new/ }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('table chat reaches the other player', await beaPage.getByRole('button', { name: /Table chat, 1 new/ }).isVisible());
  await page.getByTestId('start-table').waitFor();
  await shot(page, '13-lobby-full');
  await page.locator('[data-testid="start-table"]:not([aria-disabled="true"])').waitFor({ timeout: 10_000 });
  await page.getByTestId('start-table').click();
  await page.getByTestId('table-status').waitFor();
  await beaPage.getByTestId('table-status').waitFor({ timeout: 10_000 });
  const [annHand, beaHand] = await Promise.all([
    autoplay(page, { shots: { charleston: '14-friends-charleston-ann', midgame: '15-friends-midgame-ann' } }),
    autoplay(beaPage, { shots: { midgame: '16-friends-midgame-bea' } }),
  ]);
  check('both friends play a live hand to the end', annHand.done && beaHand.done, `Ann ${annHand.discards} discards, Bea ${beaHand.discards}`);
  await page.getByTestId('result-panel').scrollIntoViewIfNeeded();
  await beaPage.getByTestId('result-panel').scrollIntoViewIfNeeded();
  await shot(page, '17-friends-result-ann');
  await shot(beaPage, '18-friends-result-bea');
  const annTotals = await page.getByText(/Table totals/).textContent();
  const beaTotals = await beaPage.getByText(/Table totals/).textContent();
  const numbers = (t) => (t?.match(/[+-]?\d+/g) ?? []).join(',');
  check('both players see the same scores', numbers(annTotals) === numbers(beaTotals), annTotals ?? '');

  // ------------------------------------------------------------------ 5. Game Night
  await page.goto(`${BASE}/nights`);
  await page.getByTestId('plan-night').click();
  await page.waitForURL('**/night/new');
  await page.getByTestId('night-title').fill('Thursday mahjong');
  await page.getByPlaceholder(/Where\?/).fill("Ann's place");
  await page.getByTestId('add-slot').click();
  await shot(page, '19-plan-night');
  await page.getByTestId('create-night').click();
  await page.waitForURL(/\/night\/[0-9a-f-]{36}/);
  await page.getByText('Thursday mahjong').first().waitFor();
  const nightId = page.url().split('/').pop().split('?')[0];
  const invitePath = await page.evaluate(async (id) => (await (await fetch(`/v1/nights/${id}`, { credentials: 'include' })).json()).invitePath, nightId);

  await beaPage.goto(`${BASE}${invitePath}`);
  await beaPage.getByText("Ann's place").first().waitFor();
  await shot(beaPage, '20-night-invite');
  await beaPage.getByTestId('join-night').click();
  await beaPage.waitForURL(/\/night\/[0-9a-f-]{36}/);
  await beaPage.getByRole('radio', { name: 'Going' }).click();
  await beaPage.getByTestId('vote-1').click();
  await beaPage.getByText('1 vote').first().waitFor();
  await page.getByText('1 vote').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('votes show up live for the host', await page.getByText('1 vote').first().isVisible());
  await page.getByRole('radio', { name: 'Going' }).click();
  await page.getByText('2 going', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('RSVPs are counted', await page.getByText('2 going', { exact: true }).isVisible());
  await shot(page, '21-night-voting');
  await page.getByTestId('confirm-1').click();
  await page.getByText('Confirmed').first().waitFor();
  await beaPage.getByText('Confirmed').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('locking in a time reaches everyone', await beaPage.getByText('Confirmed').first().isVisible());
  const [ics] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByTestId('add-calendar').click()]);
  const icsPath = join(OUT, 'game-night.ics');
  await ics.saveAs(icsPath);
  const icsText = readFileSync(icsPath, 'utf8');
  check('calendar file is a valid event', icsText.includes('BEGIN:VEVENT') && icsText.includes('Thursday mahjong'), icsText.match(/DTSTART[^\r\n]*/)?.[0] ?? '');
  await shot(page, '22-night-confirmed');
  await page.getByTestId('night-online').click();
  await page.waitForURL(/\/table\/[0-9a-f-]{36}/);
  await page.getByTestId('table-code').waitFor();
  await page.getByText('Held for Bea').waitFor({ timeout: 5000 }).catch(() => undefined);
  check('play online instead opens a table with a held seat', await page.getByText('Held for Bea').isVisible());
  await shot(page, '23-night-online-table');

  // Shared rack link still works for a brand-new guest.
  const carl = await browser.newContext(phone);
  const carlPage = await carl.newPage();
  watch(carlPage, 'carl');
  await carlPage.goto(`${BASE}${link.path}`);
  await carlPage.getByText('Someone shared this exact rack with you.').waitFor();
  check('shared rack link opens the exact rack', true);

  await page.goto(`${BASE}/`);
  await page.getByTestId('today-primary').waitFor();
  await shot(page, '24-today');
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
} catch (error) {
  check('run completed', false, String(error).slice(0, 500));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Artifacts in ${OUT}`);
process.exit(failed.length ? 1 : 0);
