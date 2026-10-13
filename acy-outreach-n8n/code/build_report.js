// Code node: "Build report" (action = report). Runs once for all items.
// Number first, problems first, plain English, Arabic kept in its own block.
const q = $('ACY Outreach API').first().json;
const b = q.body ?? q;
const rows = (n) => $(n).all().map((i) => i.json).filter((r) => r && r.username);
const sends = rows('Sends today');
const rejections = rows('Rejections today');
const flags = rows('Flags today');
const target = parseInt(String(b.target ?? '20'), 10) || 20;

const replies = flags.filter((f) => ['reply', 'voice_note'].includes(String(f.kind)));
const followups = flags.filter((f) => String(f.kind) === 'follow_up');
const other = flags.filter((f) => !['reply', 'voice_note', 'follow_up'].includes(String(f.kind)));
const problems = [];
if (b.problems) problems.push(...(Array.isArray(b.problems) ? b.problems.map(String) : [String(b.problems)]));
const blocked = rejections.filter((r) => /failed to send|couldn't send|not sent|429|try again later/i.test(String(r.reason)));
blocked.forEach((r) => problems.push('Instagram blocked a send on ' + r.username + ': ' + r.reason));

const lines = [];
lines.push(sends.length + ' of ' + target + (problems.length ? ', here is what went wrong.' : ', no blockers today.'));
if (problems.length) {
  lines.push('');
  problems.forEach((p) => lines.push(p));
}
if (replies.length) {
  lines.push('');
  lines.push('Replies and voice notes, flagged for you and not touched:');
  replies.forEach((f) => lines.push(f.username + (f.note ? ' (' + f.note + ')' : '')));
}
if (followups.length) {
  lines.push('');
  lines.push('Follow-ups for you, Baha messaged first and they never replied:');
  followups.forEach((f) => lines.push(f.username + (f.note ? ' (' + f.note + ')' : '')));
}
if (sends.length) {
  lines.push('');
  lines.push('Sent today:');
  sends.forEach((s) => lines.push(s.username + ' (thread ' + (s.thread_id || 'unknown') + '): ' + (s.why || '')));
}
if (rejections.length) {
  lines.push('');
  lines.push('Rejected or skipped:');
  rejections.forEach((r) => lines.push(r.username + ': ' + r.reason + (r.stage ? ' [' + r.stage + ']' : '')));
}
if (other.length) {
  lines.push('');
  lines.push('Other flags:');
  other.forEach((f) => lines.push(f.username + ' ' + f.kind + (f.note ? ' (' + f.note + ')' : '')));
}
if (sends.length) {
  lines.push('');
  lines.push('Messages that went out (Arabic):');
  lines.push('');
  sends.forEach((s) => { lines.push(s.username); lines.push(s.message || ''); lines.push(''); });
}

return [{
  json: {
    report: lines.join('\n'),
    counts: {
      sent: sends.length,
      target,
      remaining: Math.max(0, target - sends.length),
      rejected: rejections.length,
      replies: replies.length,
      followups: followups.length,
      problems: problems.length,
    },
    sends,
    rejections,
    flags,
  },
}];
