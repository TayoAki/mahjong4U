// Moderator tool for player reports and problem reports. Talks to the server's /v1/admin endpoints.
//
//   ADMIN_TOKEN=... API_URL=https://your-server node scripts/reports.mjs              list open reports
//   ... node scripts/reports.mjs all                                                    list recent reports, any status
//   ... node scripts/reports.mjs resolve <reportId> dismiss|remove-content|suspend
//   ... node scripts/reports.mjs unsuspend <playerId>
//   ... node scripts/reports.mjs feedback                                               messages from Contact us
//   ... node scripts/reports.mjs bugs [all]                                             problems reported from the app
//   ... node scripts/reports.mjs bug <bugReportId>                                      one problem in full; saves its screenshot
//   ... node scripts/reports.mjs close-bug <bugReportId>                                mark a problem handled (reopen-bug undoes it)
//   ... node scripts/reports.mjs plus <playerId> <days|forever|off>                     give Daily Rack Plus by hand (testers, support)
//
// remove-content hides the reported message for everyone. suspend also hides everything the
// player has written and stops them chatting, adding friends or joining game nights.
import { writeFileSync } from 'node:fs';

const API = (process.env.API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error('Set ADMIN_TOKEN to the server’s ADMIN_TOKEN.');
  process.exit(1);
}

const send = async (method, path, body) => {
  const res = await fetch(`${API}/v1/admin${path}`, {
    method,
    headers: { 'x-admin-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    console.error(data?.error?.message ?? `The server answered HTTP ${res.status}.`);
    process.exit(1);
  }
  return res;
};
const call = async (method, path, body) => (await send(method, path, body)).json();

const ago = (iso) => {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};
const printBug = (b, full) => {
  console.log(`\n${b.id}  [${b.status}]  ${b.screen}  ${ago(b.createdAt)}${b.hasScreenshot ? '  (screenshot)' : ''}`);
  console.log(`  from:     ${b.from.name} (${b.from.id})`);
  console.log(`  device:   ${[b.details.device, b.details.os, b.details.appVersion && `app ${b.details.appVersion}`].filter(Boolean).join(', ') || 'not given'}`);
  console.log(`  problem:  ${full ? b.description : b.description.slice(0, 200)}`);
  if (full) for (const [key, value] of Object.entries(b.details)) console.log(`  ${`${key}:`.padEnd(15)} ${Array.isArray(value) ? value.join('\n                  ') : value}`);
};

const [command = 'open', id, action] = process.argv.slice(2);
if (command === 'open' || command === 'all') {
  const { reports } = await call('GET', `/reports${command === 'all' ? '?status=all' : ''}`);
  if (reports.length === 0) console.log(command === 'open' ? 'No open reports.' : 'No reports yet.');
  for (const r of reports) {
    const age = Math.round((Date.now() - new Date(r.createdAt).getTime()) / 3_600_000);
    console.log(`\n${r.id}  [${r.status}${r.action ? `: ${r.action}` : ''}]  ${r.reason}  ${age} h ago`);
    console.log(`  about:    ${r.target.name} (${r.target.id})${r.target.suspended ? ' SUSPENDED' : ''}, ${r.target.reportsAgainst} report(s) in total`);
    console.log(`  from:     ${r.reporter.name}`);
    if (r.reported?.kind === 'message') console.log(`  message:  “${r.reported.body}” (${r.reported.conversation} chat)`);
    else console.log(`  player:   named “${r.reported?.name}” when reported`);
    if (r.note) console.log(`  note:     ${r.note}`);
  }
} else if (command === 'feedback') {
  const { feedback } = await call('GET', '/feedback');
  if (feedback.length === 0) console.log('No messages yet.');
  for (const f of feedback) console.log(`\n${f.createdAt}  from ${f.from.name} (${f.from.id})\n  ${f.message}`);
} else if (command === 'bugs') {
  const { bugReports } = await call('GET', `/bug-reports${id === 'all' ? '?status=all' : ''}`);
  if (bugReports.length === 0) console.log(id === 'all' ? 'No problem reports yet.' : 'No open problem reports.');
  for (const b of bugReports) printBug(b, false);
} else if (command === 'bug' && id) {
  const { bugReports } = await call('GET', '/bug-reports?status=all');
  const bug = bugReports.find((b) => b.id === id || b.id.startsWith(id));
  if (!bug) {
    console.error(`No problem report ${id} among the latest 200.`);
    process.exit(1);
  }
  printBug(bug, true);
  if (bug.hasScreenshot) {
    const res = await send('GET', `/bug-reports/${bug.id}/screenshot`);
    const file = `bug-${bug.id.slice(0, 8)}.${res.headers.get('content-type') === 'image/png' ? 'png' : 'jpg'}`;
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`\n  Screenshot saved to ${file}`);
  }
} else if ((command === 'close-bug' || command === 'reopen-bug') && id) {
  const { status } = await call('POST', `/bug-reports/${id}`, { action: command === 'close-bug' ? 'close' : 'reopen' });
  console.log(`Problem report ${id}: ${status}.`);
} else if (command === 'plus' && id && action) {
  const days = action === 'forever' ? null : action === 'off' ? 0 : Number(action);
  if (days !== null && !Number.isInteger(days)) {
    console.error('Give a number of days, "forever" or "off".');
    process.exit(1);
  }
  const status = await call('POST', `/players/${id}/plus`, { days });
  console.log(status.plus ? `Player ${id} has Plus${status.until ? ` until ${status.until}` : ' with no end date'}.` : `Player ${id} doesn't have Plus.`);
} else if (command === 'resolve' && id && ['dismiss', 'remove-content', 'suspend'].includes(action)) {
  await call('POST', `/reports/${id}`, { action });
  console.log(`Report ${id}: ${action}.`);
} else if (command === 'unsuspend' && id) {
  const { unsuspended } = await call('POST', `/players/${id}/unsuspend`);
  console.log(unsuspended ? `Player ${id} can chat again.` : `Player ${id} was not suspended.`);
} else {
  console.error(
    'Usage: node scripts/reports.mjs [open|all] | feedback | bugs [all] | bug <id> | close-bug <id> | reopen-bug <id> | resolve <reportId> dismiss|remove-content|suspend | unsuspend <playerId> | plus <playerId> <days|forever|off>',
  );
  process.exit(1);
}
