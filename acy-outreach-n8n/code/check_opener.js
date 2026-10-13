// Code node: "Check opener" and "Check rewrite" (action = opener). Runs once for all items.
// Enforces the message format before anything is allowed to be pasted into Instagram.
const src = $('Prepare opener input').first().json;
const j = $input.first().json;
const raw = String(j.text ?? j.output ?? '').replace(/\r/g, '');
const msg = raw.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
const paras = msg.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const problems = [];

const intro = 'أنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.';
const closings = {
  man: 'كيف بتختار الشركة الي بتنصح فيها متابعينك؟',
  woman: 'كيف بتختاري الشركة الي بتنصحي فيها متابعينك؟',
  team: 'كيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟',
};
const expectedClose = closings[src.addressee] || closings.man;

if (!msg) problems.push('empty message');
if (!msg.startsWith('مرحبا')) problems.push('must start with مرحبا');
if (/أهلا|أهلاً|اهلا/.test(paras[0] || '')) problems.push('first paragraph uses أهلا');
if (paras.length !== 5) problems.push('has ' + paras.length + ' paragraphs, needs exactly 5 separated by blank lines');
if (/[0-9٠-٩۰-۹]/.test(msg)) problems.push('contains digits (write numbers in words)');
if (/[–—]/.test(msg)) problems.push('contains an em dash or en dash');
if (/[A-Za-z]/.test(msg)) problems.push('contains Latin letters (write English terms and brand names in Arabic script)');
if (/[؀-ۿ]{40,}/.test(msg.replace(/\s/g, '|'))) problems.push('a run of forty or more Arabic letters with no space');
if (/\$|%|€|£|ريبيت|عمولة|بونص|كاش باك|سبريد|رافعة|حساب مجاني|افتح حساب/.test(msg)) problems.push('contains a price, rebate or pitch word');
if ((paras[1] || '').indexOf('وعجبني كمان') !== 0) problems.push('second paragraph must start with وعجبني كمان');
if ((paras[2] || '').indexOf('ولفتني') !== 0) problems.push('third paragraph must start with ولفتني');
if ((paras[3] || '') !== intro) problems.push('fourth paragraph must be exactly the fixed intro line');
if ((paras[4] || '') !== expectedClose) problems.push('fifth paragraph must be exactly the closing question for ' + src.addressee);
for (let i = 0; i < 3; i++) {
  if ((paras[i] || '').length < 25) problems.push('paragraph ' + (i + 1) + ' is too short to be specific');
}
if (src.broker && !paras.slice(0, 3).join(' ').includes(src.broker)) {
  problems.push('broker name (' + src.broker + ') must be named openly in the third paragraph');
}

const message = paras.join('\n\n');
const lineBreaks = (message.match(/\n/g) || []).length;
if (paras.length === 5 && lineBreaks !== 8) problems.push('needs exactly 8 line breaks, has ' + lineBreaks);

return [{
  json: {
    ...src,
    message,
    valid: problems.length === 0,
    problems,
    line_breaks: lineBreaks,
    paragraphs: paras.length,
    chars: message.length,
    draft: raw,
  },
}];
