// Code node: "Normalise" (action = check). Runs once for all items.
// Cleans the candidate payload and applies the rule-based rejects and sanity checks
// that do not need a database or an AI call.
const raw = $input.first().json;
const b = raw.body ?? raw;
const clean = (s) => String(s ?? '').trim().replace(/^@/, '').toLowerCase();
const username = clean(b.username);
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim().toLowerCase().replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/,/g, '');
  let mult = 1;
  if (/(m\b|مليون)/.test(s)) mult = 1000000;
  else if (/(k\b|ألف|الف|آلاف)/.test(s)) mult = 1000;
  const m = s.match(/[0-9]+(\.[0-9]+)?/);
  if (!m) return null;
  return Math.round(parseFloat(m[0]) * mult);
};
const followers = num(b.followers);
const posts = num(b.posts);
const isPrivate = b.is_private === true || String(b.is_private).toLowerCase() === 'true';
const relation = String(b.follow_relation ?? 'none').toLowerCase().replace(/\s+/g, '_');
const links = Array.isArray(b.links) ? b.links.map(String) : (b.links ? [String(b.links)] : []);
const recent = Array.isArray(b.recent_posts) ? b.recent_posts : [];
const country = String(b.country ?? '').toLowerCase();
const captions = recent.map((p) => (p && typeof p === 'object') ? String(p.caption ?? '') : String(p ?? ''));
const text = [b.full_name, b.bio, links.join(' '), captions.join(' '), b.notes].filter(Boolean).join(' \n ');

const profile = {
  username,
  full_name: String(b.full_name ?? ''),
  bio: String(b.bio ?? ''),
  followers,
  posts,
  is_private: isPrivate,
  follow_relation: relation,
  links,
  recent_posts: recent,
  country: String(b.country ?? ''),
  notes: String(b.notes ?? ''),
};

let verdict = 'candidate';
const reasons = [];
if (!username) { verdict = 'error'; reasons.push('no username given'); }
if (['following', 'follow_back', 'follows_you', 'mutual'].includes(relation)) {
  verdict = 'skip';
  reasons.push('follow relationship with Baha (' + relation + ')');
}
if (/\b(sudan|yemen)\b|السودان|اليمن/i.test(country)) {
  verdict = 'reject';
  reasons.push('Sudan and Yemen are out of scope');
}

const rejectRules = [
  [/\bftmo\b|funding ?pips|fundednext|the5ers|prop ?firm|حسابات? ممول|شركات? التمويل|تمويل حساب/i, 'prop firm or funded accounts'],
  [/copy ?trad|نسخ الصفقات|كوبي تريد/i, 'copy trading'],
  [/[إا]دارة (حساب|حسابات|محافظ|محفظة|رأس مال)|account management/i, 'account management'],
  [/روبوت|اكسبيرت|إكسبيرت|expert advisor|\bEA\b|trading bot|بوت تداول/i, 'bots or EAs'],
  [/pocket ?option|quotex|\bderiv\b|binary option|خيارات ثنائية|الخيارات الثنائية/i, 'binary options'],
  [/مضمون|نسبة نجاح|نسبة ربح|win ?rate|guaranteed/i, 'guaranteed profit or win-rate claims'],
  [/الحرية المالية|دخل إضافي|team ?leader|تيم ليدر|network marketing|تسويق شبكي|\bINFO\b/, 'network marketing or DM INFO funnel'],
  [/\begx\b|البورصة المصرية|سوق الأسهم السعودي|\bتاسي\b/i, 'local stock market or stocks only'],
];
for (const [re, label] of rejectRules) {
  if (re.test(text)) {
    if (verdict !== 'skip' && verdict !== 'error') verdict = 'reject';
    reasons.push(label);
  }
}

const weak = [];
if (isPrivate) weak.push('private account');
if (followers !== null && (followers < 400 || followers > 400000)) weak.push('followers outside 400 to 400,000 (' + followers + ')');
if (posts !== null && posts < 12) weak.push('fewer than 12 posts (' + posts + ')');
if (recent.length) {
  const dates = recent.map((p) => Date.parse(p && p.date ? p.date : '')).filter((d) => !isNaN(d));
  if (dates.length) {
    const newest = Math.max(...dates);
    if (Date.now() - newest > 90 * 86400000) weak.push('dormant, newest post is older than 90 days');
  }
}
if (!/[؀-ۿ]/.test(text)) weak.push('no Arabic text found on the profile');
if (verdict === 'candidate' && weak.length) { verdict = 'weak'; reasons.push(...weak); }

return [{ json: { action: 'check', username, verdict, reasons, profile } }];
