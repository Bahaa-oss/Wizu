// Code node: "Prepare opener input" (action = opener). Runs once for all items.
const raw = $input.first().json;
const b = raw.body ?? raw;
const username = String(b.username ?? '').trim().replace(/^@/, '').toLowerCase();
const a = String(b.addressee ?? '').toLowerCase();
const addressee = ['man', 'woman', 'team'].includes(a) ? a : 'man';
const details = Array.isArray(b.details)
  ? b.details.map((d) => String(d).trim()).filter(Boolean)
  : String(b.details ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
return [{
  json: {
    action: 'opener',
    username,
    name: String(b.name ?? b.display_name ?? b.full_name ?? username),
    addressee,
    details,
    broker: String(b.broker ?? ''),
    extra: String(b.extra ?? b.notes ?? ''),
    enough_details: details.length >= 3,
  },
}];
