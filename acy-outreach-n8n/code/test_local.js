// Local smoke test for the Code-node scripts. Run: node acy-outreach-n8n/code/test_local.js
// Mocks n8n's $input and $() helpers so the same source runs here and inside n8n.
const fs = require('fs');
const path = require('path');
const dir = __dirname;

function run(file, input, nodes) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const items = (arr) => arr.map((j) => ({ json: j }));
  const $input = { first: () => items(input)[0], all: () => items(input) };
  const $ = (name) => {
    const rows = nodes[name] || [];
    return { first: () => items(rows)[0], all: () => items(rows) };
  };
  const fn = new Function('$input', '$', src);
  return fn($input, $);
}

let failures = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('ok   ' + label);
  else { failures++; console.log('FAIL ' + label, extra !== undefined ? JSON.stringify(extra) : ''); }
};

// normalise
const good = run('normalise.js', [{ body: {
  username: '@Gold_Trader_JO', full_name: 'أحمد', bio: 'أكاديمية تداول الذهب، قناة تيليجرام خاصة للطلاب',
  followers: '12,400', posts: 88, is_private: false, follow_relation: 'none',
  links: ['https://t.me/goldjo'], recent_posts: [{ date: new Date().toISOString(), caption: 'تحليل الذهب اليوم' }], country: 'Jordan',
} }], {})[0].json;
check('normalise: clean candidate', good.verdict === 'candidate' && good.username === 'gold_trader_jo', good);

const prop = run('normalise.js', [{ body: { username: 'x', bio: 'حسابات ممولة FTMO', followers: 5000, posts: 50, recent_posts: [{ date: new Date().toISOString(), caption: 'ربح مضمون' }] } }], {})[0].json;
check('normalise: prop firm + guarantee rejected', prop.verdict === 'reject' && prop.reasons.length === 2, prop.reasons);

const follow = run('normalise.js', [{ body: { username: 'y', bio: 'تداول', followers: 5000, posts: 50, follow_relation: 'Follow Back' } }], {})[0].json;
check('normalise: follow relationship skipped', follow.verdict === 'skip', follow);

const weak = run('normalise.js', [{ body: { username: 'z', bio: 'تداول فوركس', followers: 150, posts: 5, is_private: 'true' } }], {})[0].json;
check('normalise: thin account weak', weak.verdict === 'weak' && weak.reasons.length === 3, weak.reasons);

for (const [inp, want] of [['18.2K', 18200], ['12,400', 12400], ['1.2M', 1200000], ['٣٤٥', 345], ['12.4 ألف', 12400], [88, 88], ['', null]]) {
  const r = run('normalise.js', [{ body: { username: 'n', bio: 'تداول', followers: inp, posts: 50 } }], {})[0].json;
  check('normalise: followers "' + inp + '" -> ' + want, r.profile.followers === want, r.profile.followers);
}

const yemen = run('normalise.js', [{ body: { username: 'q', bio: 'تداول', followers: 5000, posts: 50, country: 'اليمن' } }], {})[0].json;
check('normalise: Yemen rejected', yemen.verdict === 'reject', yemen);

// decide
const d1 = run('decide.js', [good], { Normalise: [good], 'Lookup DNC': [{}], 'Lookup history': [{}], 'Sends last 24h': [{}] })[0].json;
check('decide: clean candidate needs AI', d1.verdict === 'candidate' && d1.needs_ai === true && d1.remaining_today === 20, d1);

const d2 = run('decide.js', [good], { Normalise: [good], 'Lookup DNC': [{ username: 'gold_trader_jo', list: 'recent' }], 'Lookup history': [{}], 'Sends last 24h': [{}] })[0].json;
check('decide: DNC hit skips', d2.verdict === 'skip' && /recently/.test(d2.reasons[0]), d2);

const d3 = run('decide.js', [good], { Normalise: [good], 'Lookup DNC': [{}], 'Lookup history': [{ username: 'gold_trader_jo', source: 'localStorage' }], 'Sends last 24h': [{}] })[0].json;
check('decide: history hit skips', d3.verdict === 'skip', d3);

const twenty = Array.from({ length: 20 }, (_, i) => ({ username: 'u' + i, sent_at: new Date(Date.now() - i * 3600000).toISOString() }));
const d4 = run('decide.js', [good], { Normalise: [good], 'Lookup DNC': [{}], 'Lookup history': [{}], 'Sends last 24h': twenty })[0].json;
check('decide: cap reached', d4.verdict === 'cap' && d4.cap_reached === true, d4);

const stale = twenty.map((r) => ({ ...r, sent_at: new Date(Date.now() - 30 * 3600000).toISOString() }));
const d5 = run('decide.js', [good], { Normalise: [good], 'Lookup DNC': [{}], 'Lookup history': [{}], 'Sends last 24h': stale })[0].json;
check('decide: old sends do not count', d5.verdict === 'candidate' && d5.sends_last_24h === 0, d5);

// finalise
const f1 = run('finalise.js', [{ output: { verdict: 'lead', reason: 'runs a paid Telegram channel', display_name: 'أحمد', addressee: 'man', broker: '', details: ['a', 'b', 'c'] } }], { Decide: [d1] })[0].json;
check('finalise: lead', f1.verdict === 'lead' && f1.details.length === 3, f1);
const f2 = run('finalise.js', [{ output: { verdict: 'reject', reason: 'crypto only' } }], { Decide: [d1] })[0].json;
check('finalise: reject', f2.verdict === 'reject', f2);

// prepare opener + check opener
const prep = run('prepare_opener.js', [{ body: { username: 'axl.academyy', name: 'فريق إيه إكس إل', addressee: 'team', details: ['بوست مين فيهم انت', 'فيديو الإطلاق', 'صفحة التسجيل'], broker: '' } }], {})[0].json;
check('prepare: team addressee', prep.addressee === 'team' && prep.enough_details, prep);

const example = [
  'مرحبا فريق إيه إكس إل، عجبني بوست مين فيهم انت، نفس الشارت ونفس السوق وكل واحد بيطلع بنتيجة مختلفة.',
  'وعجبني كمان فيديو الإطلاق، إنه بعد سنين من "علمني يا كوتش" قررتوا تفتحوا الأكاديمية وتبلشوا تستقبلوا الناس.',
  'ولفتني إنه صفحة التسجيل عندكم فيها دورات وتحليلات يومية ومجتمع تيليجرام وقناة توصيات، وفريقكم بيتواصل مع كل واحد بيسجل.',
  'أنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.',
  'كيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟',
].join('\n\n');
const c1 = run('check_opener.js', [{ text: example }], { 'Prepare opener input': [prep] })[0].json;
check('check opener: the real example passes', c1.valid === true && c1.line_breaks === 8, c1.problems);

const c2 = run('check_opener.js', [{ text: example.replace('مرحبا', 'أهلا').replace('إيه إكس إل', 'AXL') + ' 2024' }], { 'Prepare opener input': [prep] })[0].json;
check('check opener: bad draft fails', c2.valid === false && c2.problems.length >= 3, c2.problems);

const prepMan = { ...prep, addressee: 'man', broker: 'إكسنس' };
const c3 = run('check_opener.js', [{ text: example }], { 'Prepare opener input': [prepMan] })[0].json;
check('check opener: wrong closing and missing broker flagged', c3.valid === false && c3.problems.some((p) => /closing/.test(p)) && c3.problems.some((p) => /broker/.test(p)), c3.problems);

// report
const rep = run('build_report.js', [{}], {
  'ACY Outreach API': [{ body: { action: 'report', target: 20, problems: ['Instagram window was hidden for twenty minutes'] } }],
  'Sends today': [{ username: 'a', thread_id: '1', why: 'paid channel', message: example, sent_at: 'x' }],
  'Rejections today': [{ username: 'b', reason: 'copy trading', stage: 'profile' }, { username: 'c', reason: 'Failed to send', stage: 'send' }],
  'Flags today': [{ username: 'd', kind: 'reply', note: 'voice note' }, { username: 'e', kind: 'follow_up' }],
})[0].json;
check('report: number first, problems first', rep.report.startsWith('1 of 20, here is what went wrong.') && rep.counts.problems === 2 && rep.counts.replies === 1, rep.report);

// import
const imp = run('parse_history.js', [{ body: { __acy_H22: JSON.stringify({ '@Abc': 1, def: 1 }), usernames: ['def', 'GHI'], source: 'localStorage' } }], {})[0].json;
check('import: dedupes and lowercases', imp.count === 3 && imp.rows.map((r) => r.username).sort().join(',') === 'abc,def,ghi', imp);
const cnt = run('count_imported.js', imp.rows, {})[0].json;
check('count imported', cnt.imported === 3, cnt);

console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
