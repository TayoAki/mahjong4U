// Moderator tool for player reports. Talks to the server's /v1/admin endpoints.
//
//   ADMIN_TOKEN=... API_URL=https://your-server node scripts/reports.mjs              list open reports
//   ... node scripts/reports.mjs all                                                    list recent reports, any status
//   ... node scripts/reports.mjs resolve <reportId> dismiss|remove-content|suspend
//   ... node scripts/reports.mjs unsuspend <playerId>
//
// remove-content hides the reported message for everyone. suspend also hides everything the
// player has written and stops them chatting, adding friends or joining game nights.
const API = (process.env.API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error('Set ADMIN_TOKEN to the server’s ADMIN_TOKEN.');
  process.exit(1);
}

const call = async (method, path, body) => {
  const res = await fetch(`${API}/v1/admin${path}`, {
    method,
    headers: { 'x-admin-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(data?.error?.message ?? `The server answered HTTP ${res.status}.`);
    process.exit(1);
  }
  return data;
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
} else if (command === 'resolve' && id && ['dismiss', 'remove-content', 'suspend'].includes(action)) {
  await call('POST', `/reports/${id}`, { action });
  console.log(`Report ${id}: ${action}.`);
} else if (command === 'unsuspend' && id) {
  const { unsuspended } = await call('POST', `/players/${id}/unsuspend`);
  console.log(unsuspended ? `Player ${id} can chat again.` : `Player ${id} was not suspended.`);
} else {
  console.error('Usage: node scripts/reports.mjs [open|all] | resolve <reportId> dismiss|remove-content|suspend | unsuspend <playerId>');
  process.exit(1);
}
