// End-to-end check of the Expo web build on phone-sized viewports:
//   1. Daily Rack: first open -> rack -> result -> clip -> real MP4 export -> shared link.
//   2. Arranging the rack by dragging a tile, then a full hand against three computer
//      players, Charleston to Mahjong.
//   3. Two guests become friends by code and chat.
//   4. The friends sit at the same live table and play a hand together, with table chat.
//   5. Game Night: plan, invite link, vote, RSVP, lock in, calendar file, play online instead.
//   6. Safety: community rules, the word filter, reporting a message, blocking and unblocking.
//   7. Voice chat at a private table, a quick match together, the Learn tab and a lesson,
//      stats, the leaderboard and an offline game.
//   8. Report a problem, with a screenshot, from the You tab and from a table's help sheet.
//      (Start the server with MATCH_FILL_CASUAL_MS=3000 or the quick match waits 20 s.)
// Usage: BASE_URL=http://localhost:8787 node scripts/e2e.mjs
//   (server running on a fresh DB with the web build: npm run build && BOT_DELAY_MS=120 npm start)
//   Set E2E_ADMIN_TOKEN to the server's ADMIN_TOKEN to also check the moderator view.
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
  let why = null;
  while (Date.now() < until) {
    if (await visible(page, 'result-panel')) return { done: true, discards, why };
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
    } else if (why === null && (await visible(page, 'why-call'))) {
      // Ask once why we can't call someone else's discard.
      await tap(page, 'why-call');
      const text = (await page.getByTestId('why-call-text').textContent({ timeout: 1500 }).catch(() => '')) ?? '';
      if (text) {
        why = text;
        await snap('why');
      }
    } else await page.waitForTimeout(150);
  }
  return { done: false, discards, why };
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

  // Arrange the rack: drag one tile to a new spot with the mouse, then check a tap still chooses.
  await page.getByTestId('action-pass').waitFor({ timeout: 15_000 }).catch(() => undefined);
  {
    const rackLabels = async () =>
      (await page.locator('[data-testid^="rack-tile-"]').evaluateAll((els) => els.map((el) => [Number(el.getAttribute('data-testid').slice('rack-tile-'.length)), el.getAttribute('aria-label')])))
        .sort((a, b) => a[0] - b[0])
        .map(([, label]) => label);
    const passLabel = () => page.getByTestId('action-pass').textContent().catch(() => '');
    check('the drag hint shows the first time', await visible(page, 'arrange-hint'));
    const before = await rackLabels();
    // Move a tile three places right, choosing one where that changes how the rack reads.
    let from = 0;
    while (before[from] === before[from + 3] && from + 4 < before.length) from += 1;
    const to = from + 3;
    const expected = [...before];
    expected.splice(to, 0, ...expected.splice(from, 1));
    const a = await page.getByTestId(`rack-tile-${from}`).boundingBox();
    const b = await page.getByTestId(`rack-tile-${to}`).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) {
      await page.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * step) / 12, a.y + a.height / 2 + ((b.y - a.y) * step) / 12);
    }
    await page.waitForTimeout(250);
    await shot(page, '06a-rack-mid-drag');
    await page.mouse.up();
    await page.waitForTimeout(500);
    const after = await rackLabels();
    check('dragging a rack tile moves it to the new spot', JSON.stringify(after) === JSON.stringify(expected), `${before[from]}: place ${from + 1} -> ${to + 1}`);
    check('the sort control switches to Your order', ((await page.getByTestId('rack-order').textContent()) ?? '').includes('Your order'));
    check('letting go of a drag does not choose the tile', (await passLabel()).includes('Choose 3 more'));
    check('the drag hint goes once you have arranged', !(await visible(page, 'arrange-hint')));
    await shot(page, '06b-rack-arranged');
    await tap(page, `rack-tile-${to}`);
    const chosen = await passLabel();
    await tap(page, `rack-tile-${to}`);
    check('a tap still chooses and unchooses a tile', chosen.includes('Choose 2 more') && (await passLabel()).includes('Choose 3 more'), chosen);
    await page.reload();
    await page.getByTestId('rack-tile-0').waitFor();
    await page.waitForTimeout(500);
    check('your rack order survives a reload', JSON.stringify(await rackLabels()) === JSON.stringify(expected));
  }

  const solo = await autoplay(page, { shots: { charleston: '06-vs-computer-charleston', midgame: '07-vs-computer-midgame', why: '07b-why-cant-i-call' } });
  check('a full hand against the computer reaches a result', solo.done, `${solo.discards} discards by the human seat`);
  check('"Why can’t I call this?" explains a discard', (solo.why ?? '').length > 30, (solo.why ?? '').slice(0, 90));
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
  // The first social action asks the player to agree to the community rules.
  await page.getByTestId('agree-rules').waitFor();
  check('community rules come before the first friend request', true);
  await page.waitForTimeout(700); // let the sheet finish sliding in
  await shot(page, '09a-community-rules');
  await page.getByTestId('agree-rules').click();
  await page.getByText(/Request sent to Bea/).waitFor();
  await beaPage.goto(`${BASE}/friends`);
  await beaPage.getByText('Requests').waitFor();
  await shot(beaPage, '09-friend-request');
  await beaPage.getByRole('button', { name: 'Accept' }).click();
  await beaPage.getByTestId('agree-rules').click();
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
  await page.getByTestId('chat-input').fill('this shit is fun');
  await page.getByTestId('chat-send').click();
  await page.getByText(/includes words we don’t allow/).waitFor({ timeout: 5000 }).catch(() => undefined);
  check('the word filter stops profanity', await page.getByText(/includes words we don’t allow/).isVisible());
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
  await page.getByTestId('add-calendar').waitFor();
  await beaPage.getByTestId('add-calendar').waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('locking in a time reaches everyone', await beaPage.getByTestId('add-calendar').isVisible());
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

  // ------------------------------------------------------------------ 6. Report and block
  await beaPage.goto(`${BASE}/friends`);
  await beaPage.getByRole('button', { name: 'Chat with Ann' }).first().click();
  await beaPage.waitForURL('**/chat/**');
  await beaPage.getByRole('button', { name: 'Ann: Yes! Setting up a table.' }).click();
  await beaPage.getByTestId('safety-report').click();
  await beaPage.getByTestId('reason-harassment').click();
  await shot(beaPage, '25-report-message');
  await beaPage.getByTestId('submit-report').click();
  await beaPage.getByTestId('safety-done').waitFor();
  check('a chat message can be reported', (await beaPage.getByTestId('safety-done').textContent())?.includes('within 24 hours') ?? false);
  await beaPage.getByRole('button', { name: 'OK' }).click();
  await beaPage.getByLabel('Ann: Yes! Setting up a table.').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
  check('the reported message disappears for the reporter', (await beaPage.getByLabel('Ann: Yes! Setting up a table.').count()) === 0);
  if (process.env.E2E_ADMIN_TOKEN) {
    const reports = await (await fetch(`${BASE}/v1/admin/reports`, { headers: { 'x-admin-token': process.env.E2E_ADMIN_TOKEN } })).json();
    const filed = reports.reports?.find((r) => r.reported?.body === 'Yes! Setting up a table.');
    check('moderators see the report with the message text', Boolean(filed), filed ? `${filed.reason}, about ${filed.target.name}` : 'missing');
  }

  await beaPage.getByRole('button', { name: 'Report or block Ann' }).click();
  await beaPage.getByTestId('safety-block').click();
  await beaPage.getByTestId('confirm-block').click();
  await beaPage.getByTestId('safety-done').waitFor();
  await shot(beaPage, '26-blocked');
  await beaPage.getByRole('button', { name: 'OK' }).click();
  await beaPage.waitForURL('**/friends', { timeout: 10_000 }).catch(() => undefined);
  await page.goto(`${BASE}/friends`);
  await page.getByText('Friends', { exact: true }).first().waitFor();
  await page.waitForTimeout(500);
  check('blocking ends the friendship on both sides', (await page.getByRole('button', { name: /Chat with Bea/ }).count()) === 0);
  await beaPage.goto(`${BASE}/you`);
  await beaPage.getByRole('button', { name: 'Unblock' }).waitFor();
  await beaPage.getByRole('button', { name: 'Unblock' }).scrollIntoViewIfNeeded();
  await shot(beaPage, '27-blocked-list');
  await beaPage.getByRole('button', { name: 'Unblock' }).click();
  await beaPage.getByText('You haven’t blocked anyone.').waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('players can unblock from the You tab', await beaPage.getByText('You haven’t blocked anyone.').isVisible());

  // Shared rack link still works for a brand-new guest.
  const carl = await browser.newContext(phone);
  const carlPage = await carl.newPage();
  watch(carlPage, 'carl');
  await carlPage.goto(`${BASE}${link.path}`);
  await carlPage.getByText('Someone shared this exact rack with you.').waitFor();
  check('shared rack link opens the exact rack', true);

  // ------------------------------------------------------------------ 7. Online play and learning
  const api = (p, method, path, body) =>
    p.evaluate(
      async ([m, url, b]) => (await fetch(url, { method: m, credentials: 'include', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json(),
      [method, path, body],
    );
  const voiceTable = (await api(page, 'POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'open' }, { type: 'bot' }, { type: 'bot' }] })).table;
  await api(beaPage, 'POST', '/v1/tables/join', { code: voiceTable.code });
  await bea.grantPermissions(['microphone'], { origin: BASE });
  for (const p of [page, beaPage]) {
    await p.goto(`${BASE}/table/${voiceTable.id}`);
    await p.getByTestId('voice-join').click({ timeout: 15_000 });
  }
  let voiceUp = false;
  for (let i = 0; i < 60 && !voiceUp; i++) {
    voiceUp = (await page.getByTestId('voice-peer-connected').count()) > 0 && (await beaPage.getByTestId('voice-peer-connected').count()) > 0;
    if (!voiceUp) await page.waitForTimeout(250);
  }
  await shot(page, '28-voice-chat');
  check('voice chat connects two players at a private table', voiceUp);
  for (const p of [page, beaPage]) await tap(p, 'voice-leave');
  await api(page, 'POST', `/v1/tables/${voiceTable.id}/close`);

  for (const p of [page, beaPage]) await p.goto(`${BASE}/play`);
  await page.getByTestId('match-casual').click();
  await beaPage.getByTestId('match-casual').click();
  await page.waitForURL(/\/table\//, { timeout: 40_000 });
  await beaPage.waitForURL(/\/table\//, { timeout: 40_000 });
  check('a quick match seats both players at the same table', page.url() === beaPage.url());
  await page.getByLabel(/^Table chat/).click();
  await page.getByLabel('Send: Good luck!').click({ timeout: 10_000 });
  await beaPage.getByLabel(/^Table chat/).click();
  const phraseArrived = await beaPage.getByText('Good luck!').first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await shot(beaPage, '29-quick-match-chat');
  check('matched games chat in quick phrases', phraseArrived);
  const matchId = page.url().split('/').pop();
  for (const p of [page, beaPage]) await api(p, 'POST', `/v1/tables/${matchId}/leave`);

  await page.goto(`${BASE}/learn`);
  await page.locator('[data-testid^="lesson-row-"]').first().waitFor();
  check('the Learn tab greets with Pip and a path of units', await page.getByTestId('learn-greeting').isVisible().catch(() => false) && (await page.getByText('Unit 4').count()) > 0);
  await shot(page, '30a-learn');
  const lessonCount = await page.locator('[data-testid^="lesson-row-"]').count();
  await page.locator('[data-testid^="lesson-row-"]').first().click();
  await page.getByTestId('lesson-next').waitFor();
  await shot(page, '30-lesson');
  check('ten lessons, and one opens', lessonCount === 10, `${lessonCount} lessons`);

  await page.goto(`${BASE}/stats`);
  const statsShown = await page.getByTestId('stats-summary').waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await shot(page, '31-stats');
  check('stats show the hands played', statsShown);
  await page.goto(`${BASE}/leaderboard`);
  check('the leaderboard opens', await page.getByTestId('leaderboard-list').waitFor({ timeout: 10_000 }).then(() => true, () => false));

  await page.goto(`${BASE}/offline`);
  await page.getByTestId('offline-deal').click();
  const offlineDealt = await page.getByTestId('table-status').waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await shot(page, '32-offline-game');
  check('an offline game deals on the device', offlineDealt);

  // ------------------------------------------------------------------ 7b. Daily Rack Plus
  await page.goto(`${BASE}/play`);
  await page.getByTestId('match-ranked').waitFor();
  const rankedLabel = (await page.getByTestId('match-ranked').textContent()) ?? '';
  await page.getByTestId('match-ranked').click();
  const plusOpened = await page.getByTestId('plus-features').waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await shot(page, '32b-plus');
  check('ranked games open the Plus screen for free players', rankedLabel.includes('Plus') && plusOpened && (await page.getByText('Ranked games, ratings and the leaderboard come with Plus').count()) > 0);
  check('the Plus screen lists what stays free and says where to subscribe', (await page.getByText('Always free').count()) > 0 && (await page.getByText('Plus is available in the Daily Rack app for iPhone and Android.').count()) > 0);
  await page.getByTestId('plus-later').click();
  if (process.env.E2E_ADMIN_TOKEN) {
    const me = await api(page, 'GET', '/v1/me/profile');
    await fetch(`${BASE}/v1/admin/players/${me.id}/plus`, { method: 'POST', headers: { 'x-admin-token': process.env.E2E_ADMIN_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ days: 7 }) });
    await page.goto(`${BASE}/you`);
    const member = await page.getByText('You’re a member', { exact: false }).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
    check('a Plus member sees their membership', member);
    await fetch(`${BASE}/v1/admin/players/${me.id}/plus`, { method: 'POST', headers: { 'x-admin-token': process.env.E2E_ADMIN_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ days: 0 }) });
  }

  // ------------------------------------------------------------------ 8. Report a problem
  await page.goto(`${BASE}/you`);
  await page.getByTestId('report-problem').scrollIntoViewIfNeeded();
  await page.getByTestId('report-problem').click();
  await page.getByTestId('problem-input').fill('E2E: the Suggest button picked a joker');
  await page.getByTestId('problem-details-toggle').click();
  const problemDetails = (await page.getByTestId('problem-details').textContent()) ?? '';
  check('a problem report shows what it sends', problemDetails.includes('Screen: /you') && /Device: \S/.test(problemDetails) && problemDetails.includes('Settings:'), problemDetails.slice(0, 100));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), page.getByTestId('problem-add-shot').click()]);
  await chooser.setFiles(join(OUT, '05-play-tab.png'));
  check('a screenshot can be attached to a problem report', await page.getByTestId('problem-shot').waitFor({ timeout: 10_000 }).then(() => true, () => false));
  await shot(page, '33-report-problem');
  await page.getByTestId('send-problem').click();
  check('a problem report sends', await page.getByTestId('problem-sent').waitFor({ timeout: 15_000 }).then(() => true, () => false));
  if (process.env.E2E_ADMIN_TOKEN) {
    const headers = { 'x-admin-token': process.env.E2E_ADMIN_TOKEN };
    const { bugReports } = await (await fetch(`${BASE}/v1/admin/bug-reports`, { headers })).json();
    const filed = bugReports.find((b) => b.description.startsWith('E2E: the Suggest button'));
    const image = filed?.hasScreenshot ? await fetch(`${BASE}/v1/admin/bug-reports/${filed.id}/screenshot`, { headers }) : null;
    const bytes = image?.ok ? (await image.arrayBuffer()).byteLength : 0;
    check(
      'moderators see the problem with device details and the screenshot',
      filed?.screen === '/you' && typeof filed.details.device === 'string' && image?.headers.get('content-type') === 'image/jpeg' && bytes > 1000,
      filed ? `${filed.details.device}, ${filed.details.os}, screenshot ${(bytes / 1024).toFixed(0)} KB` : 'missing',
    );
  }
  await page.goto(`${BASE}/offline`);
  await page.getByLabel('How to play').click();
  await page.getByTestId('help-report-problem').scrollIntoViewIfNeeded();
  await page.getByTestId('help-report-problem').click();
  await page.getByTestId('problem-details-toggle').click({ timeout: 10_000 });
  check('the table’s help sheet opens a report for that screen', ((await page.getByTestId('problem-details').textContent()) ?? '').includes('Screen: /offline'));

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
