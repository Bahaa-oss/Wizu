// Code node: "Decide" (action = check). Runs once for all items.
// Combines the rule verdict with the do-not-contact table, the history map and the daily cap.
const base = $('Normalise').first().json;
const rows = (name) => $(name).all().map((i) => i.json).filter((r) => r && (r.username || r.sent_at));
const dnc = rows('Lookup DNC');
const hist = rows('Lookup history');
const since = Date.now() - 24 * 3600 * 1000;
const sends = rows('Sends last 24h').filter((r) => {
  const t = Date.parse(r.sent_at);
  return isNaN(t) ? true : t >= since;
});
const cap = 20;

let verdict = base.verdict;
const reasons = [...(base.reasons || [])];
if (dnc.length) {
  verdict = 'skip';
  const l = String(dnc[0].list || '');
  const label = l === 'mine_followup' ? 'on the follow-up list Baha handles himself, do not touch'
    : l === 'friend' ? 'friend, never a lead'
    : l === 'recent' ? 'already messaged recently'
    : l === 'dnc_business' ? 'do-not-contact business or its staff'
    : 'on the do-not-contact list';
  reasons.unshift(label);
}
if (hist.length) {
  verdict = 'skip';
  reasons.unshift('already in the history map (' + (hist[0].source || 'history') + '), any history means skip');
}
const capReached = sends.length >= cap;
if (capReached && verdict === 'candidate') {
  verdict = 'cap';
  reasons.unshift('daily cap reached: ' + sends.length + ' sends in the last 24 hours');
}

return [{
  json: {
    ...base,
    verdict,
    reasons,
    sends_last_24h: sends.length,
    cap,
    cap_reached: capReached,
    remaining_today: Math.max(0, cap - sends.length),
    needs_ai: verdict === 'candidate',
  },
}];
