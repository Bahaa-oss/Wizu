// Code node: "Parse history map" (action = import_history). Runs once for all items.
// Accepts the localStorage JSON (__acy_H22 / __acy_hist), a plain array, or a comma/space list.
const raw = $input.first().json;
const b = raw.body ?? raw;
const names = [];
const push = (v) => {
  if (!v) return;
  if (Array.isArray(v)) { v.forEach(push); return; }
  if (typeof v === 'object') { Object.keys(v).forEach((k) => names.push(k)); return; }
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try { push(JSON.parse(s)); return; } catch (e) { /* fall through to plain split */ }
    }
    s.split(/[\s,]+/).forEach((x) => names.push(x));
  }
};
['usernames', 'map', 'history', '__acy_H22', '__acy_hist'].forEach((k) => push(b[k]));
const seen = new Set();
const rows = [];
for (const n of names) {
  const u = String(n).trim().replace(/^@/, '').toLowerCase();
  if (u && !seen.has(u)) {
    seen.add(u);
    rows.push({ username: u, source: String(b.source ?? 'localStorage'), note: '' });
  }
}
return [{ json: { count: rows.length, rows, imported: 0, ok: true } }];
