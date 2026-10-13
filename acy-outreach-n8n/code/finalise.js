// Code node: "Finalise verdict" (action = check). Runs once for all items.
// Merges Claude's judgment into the rule-based decision.
const d = $('Decide').first().json;
const out = $input.first().json;
const q = out.output ?? out;
let verdict = d.verdict;
const v = String(q.verdict || '').toLowerCase();
if (v === 'reject') verdict = 'reject';
else if (v === 'weak') verdict = 'weak';
else if (v === 'lead') verdict = 'lead';
const reasons = [...(d.reasons || [])];
if (q.reason) reasons.push(String(q.reason));
return [{
  json: {
    ...d,
    verdict,
    reasons,
    qualification: q,
    display_name: q.display_name || d.profile.full_name || d.username,
    addressee: ['man', 'woman', 'team'].includes(String(q.addressee || '').toLowerCase()) ? String(q.addressee).toLowerCase() : 'man',
    broker: q.broker || '',
    details: Array.isArray(q.details) ? q.details : [],
    needs_ai: false,
  },
}];
