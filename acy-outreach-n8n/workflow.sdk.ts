import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

const inbound = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.2,
  config: {
    name: 'ACY Outreach API', position: [0, 1400],
    parameters: { httpMethod: 'POST', path: 'acy-outreach', responseMode: 'responseNode' }
  },
  output: [{ body: { action: 'check', username: 'example_fx', bio: 'أكاديمية تداول', followers: 12400, posts: 88 }, headers: {}, query: {} }]
});

const route = switchCase({
  version: 3.2,
  config: {
    name: 'Route by action', position: [300, 1400],
    parameters: {
      rules: { values: [{ renameOutput: true, outputKey: 'check', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'check' }], combinator: 'and' } },
        { renameOutput: true, outputKey: 'opener', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'opener' }], combinator: 'and' } },
        { renameOutput: true, outputKey: 'log_send', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'log_send' }], combinator: 'and' } },
        { renameOutput: true, outputKey: 'log_reject', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'log_reject' }], combinator: 'and' } },
        { renameOutput: true, outputKey: 'flag', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'flag' }], combinator: 'and' } },
        { renameOutput: true, outputKey: 'report', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'report' }], combinator: 'and' } },
        { renameOutput: true, outputKey: 'import_history', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'import_history' }], combinator: 'and' } }] },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'unknown' }
    }
  }
});


const normalise = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Normalise', position: [700, 200], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Normalise\" (action = check). Runs once for all items.\n// Cleans the candidate payload and applies the rule-based rejects and sanity checks\n// that do not need a database or an AI call.\nconst raw = $input.first().json;\nconst b = raw.body ?? raw;\nconst clean = (s) => String(s ?? '').trim().replace(/^@/, '').toLowerCase();\nconst username = clean(b.username);\nconst num = (v) => {\n  if (v === null || v === undefined || v === '') return null;\n  if (typeof v === 'number') return Math.round(v);\n  let s = String(v).trim().toLowerCase().replace(/[\\u0660-\\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/,/g, '');\n  let mult = 1;\n  if (/(m\\b|مليون)/.test(s)) mult = 1000000;\n  else if (/(k\\b|ألف|الف|آلاف)/.test(s)) mult = 1000;\n  const m = s.match(/[0-9]+(\\.[0-9]+)?/);\n  if (!m) return null;\n  return Math.round(parseFloat(m[0]) * mult);\n};\nconst followers = num(b.followers);\nconst posts = num(b.posts);\nconst isPrivate = b.is_private === true || String(b.is_private).toLowerCase() === 'true';\nconst relation = String(b.follow_relation ?? 'none').toLowerCase().replace(/\\s+/g, '_');\nconst links = Array.isArray(b.links) ? b.links.map(String) : (b.links ? [String(b.links)] : []);\nconst recent = Array.isArray(b.recent_posts) ? b.recent_posts : [];\nconst country = String(b.country ?? '').toLowerCase();\nconst captions = recent.map((p) => (p && typeof p === 'object') ? String(p.caption ?? '') : String(p ?? ''));\nconst text = [b.full_name, b.bio, links.join(' '), captions.join(' '), b.notes].filter(Boolean).join(' \\n ');\n\nconst profile = {\n  username,\n  full_name: String(b.full_name ?? ''),\n  bio: String(b.bio ?? ''),\n  followers,\n  posts,\n  is_private: isPrivate,\n  follow_relation: relation,\n  links,\n  recent_posts: recent,\n  country: String(b.country ?? ''),\n  notes: String(b.notes ?? ''),\n};\n\nlet verdict = 'candidate';\nconst reasons = [];\nif (!username) { verdict = 'error'; reasons.push('no username given'); }\nif (['following', 'follow_back', 'follows_you', 'mutual'].includes(relation)) {\n  verdict = 'skip';\n  reasons.push('follow relationship with Baha (' + relation + ')');\n}\nif (/\\b(sudan|yemen)\\b|السودان|اليمن/i.test(country)) {\n  verdict = 'reject';\n  reasons.push('Sudan and Yemen are out of scope');\n}\n\nconst rejectRules = [\n  [/\\bftmo\\b|funding ?pips|fundednext|the5ers|prop ?firm|حسابات? ممول|شركات? التمويل|تمويل حساب/i, 'prop firm or funded accounts'],\n  [/copy ?trad|نسخ الصفقات|كوبي تريد/i, 'copy trading'],\n  [/[إا]دارة (حساب|حسابات|محافظ|محفظة|رأس مال)|account management/i, 'account management'],\n  [/روبوت|اكسبيرت|إكسبيرت|expert advisor|\\bEA\\b|trading bot|بوت تداول/i, 'bots or EAs'],\n  [/pocket ?option|quotex|\\bderiv\\b|binary option|خيارات ثنائية|الخيارات الثنائية/i, 'binary options'],\n  [/مضمون|نسبة نجاح|نسبة ربح|win ?rate|guaranteed/i, 'guaranteed profit or win-rate claims'],\n  [/الحرية المالية|دخل إضافي|team ?leader|تيم ليدر|network marketing|تسويق شبكي|\\bINFO\\b/, 'network marketing or DM INFO funnel'],\n  [/\\begx\\b|البورصة المصرية|سوق الأسهم السعودي|\\bتاسي\\b/i, 'local stock market or stocks only'],\n];\nfor (const [re, label] of rejectRules) {\n  if (re.test(text)) {\n    if (verdict !== 'skip' && verdict !== 'error') verdict = 'reject';\n    reasons.push(label);\n  }\n}\n\nconst weak = [];\nif (isPrivate) weak.push('private account');\nif (followers !== null && (followers < 400 || followers > 400000)) weak.push('followers outside 400 to 400,000 (' + followers + ')');\nif (posts !== null && posts < 12) weak.push('fewer than 12 posts (' + posts + ')');\nif (recent.length) {\n  const dates = recent.map((p) => Date.parse(p && p.date ? p.date : '')).filter((d) => !isNaN(d));\n  if (dates.length) {\n    const newest = Math.max(...dates);\n    if (Date.now() - newest > 90 * 86400000) weak.push('dormant, newest post is older than 90 days');\n  }\n}\nif (!/[؀-ۿ]/.test(text)) weak.push('no Arabic text found on the profile');\nif (verdict === 'candidate' && weak.length) { verdict = 'weak'; reasons.push(...weak); }\n\nreturn [{ json: { action: 'check', username, verdict, reasons, profile } }];\n" } },
  output: [{ action: 'check', username: 'example_fx', verdict: 'candidate', reasons: [], profile: { username: 'example_fx', bio: 'أكاديمية تداول', followers: 12400, posts: 88 } }]
});

const lookupDnc = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Lookup DNC', position: [1000, 200], executeOnce: true, alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'list', value: 'iXgUuvpmrTyd19Q6', cachedResultName: 'acy_dnc' },
      matchType: 'allConditions', returnAll: true,
      filters: { conditions: [{ keyName: 'username', condition: 'eq', keyValue: expr("{{ $('Normalise').first().json.username }}") }] }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const lookupHistory = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Lookup history', position: [1300, 200], executeOnce: true, alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'list', value: '51jKjudXAfpmB31y', cachedResultName: 'acy_history' },
      matchType: 'allConditions', returnAll: true,
      filters: { conditions: [{ keyName: 'username', condition: 'eq', keyValue: expr("{{ $('Normalise').first().json.username }}") }] }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const sends24h = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Sends last 24h', position: [1600, 200], executeOnce: true, alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'list', value: 'PIsTCsiQmjjgJpIa', cachedResultName: 'acy_sends' },
      matchType: 'allConditions', returnAll: true,
      filters: { conditions: [{ keyName: 'sent_at', condition: 'gte', keyValue: expr('{{ $now.minus({ hours: 24 }).toISO() }}') }] }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const decide = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Decide', position: [1900, 200], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Decide\" (action = check). Runs once for all items.\n// Combines the rule verdict with the do-not-contact table, the history map and the daily cap.\nconst base = $('Normalise').first().json;\nconst rows = (name) => $(name).all().map((i) => i.json).filter((r) => r && (r.username || r.sent_at));\nconst dnc = rows('Lookup DNC');\nconst hist = rows('Lookup history');\nconst since = Date.now() - 24 * 3600 * 1000;\nconst sends = rows('Sends last 24h').filter((r) => {\n  const t = Date.parse(r.sent_at);\n  return isNaN(t) ? true : t >= since;\n});\nconst cap = 20;\n\nlet verdict = base.verdict;\nconst reasons = [...(base.reasons || [])];\nif (dnc.length) {\n  verdict = 'skip';\n  const l = String(dnc[0].list || '');\n  const label = l === 'mine_followup' ? 'on the follow-up list Baha handles himself, do not touch'\n    : l === 'friend' ? 'friend, never a lead'\n    : l === 'recent' ? 'already messaged recently'\n    : l === 'dnc_business' ? 'do-not-contact business or its staff'\n    : 'on the do-not-contact list';\n  reasons.unshift(label);\n}\nif (hist.length) {\n  verdict = 'skip';\n  reasons.unshift('already in the history map (' + (hist[0].source || 'history') + '), any history means skip');\n}\nconst capReached = sends.length >= cap;\nif (capReached && verdict === 'candidate') {\n  verdict = 'cap';\n  reasons.unshift('daily cap reached: ' + sends.length + ' sends in the last 24 hours');\n}\n\nreturn [{\n  json: {\n    ...base,\n    verdict,\n    reasons,\n    sends_last_24h: sends.length,\n    cap,\n    cap_reached: capReached,\n    remaining_today: Math.max(0, cap - sends.length),\n    needs_ai: verdict === 'candidate',\n  },\n}];\n" } },
  output: [{ action: 'check', username: 'example_fx', verdict: 'candidate', reasons: [], sends_last_24h: 3, cap: 20, cap_reached: false, remaining_today: 17, needs_ai: true, profile: { username: 'example_fx' } }]
});

const needsAi = ifElse({
  version: 2.2,
  config: {
    name: 'Needs AI judgment?', position: [2200, 200],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.needs_ai }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    }
  }
});


const qualifyModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6,
  config: {
    name: 'Claude for qualification', position: [2500, 420],
    parameters: {
      model: { __rl: true, mode: 'list', value: 'claude-sonnet-5', cachedResultName: 'Claude Sonnet 5' },
      options: { maxTokensToSample: 2000, promptCaching: '1h' }
    },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const qualifyParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3,
  config: {
    name: 'Qualification JSON', position: [2750, 420],
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: "{\"verdict\": \"lead\", \"reason\": \"runs a paid Telegram channel with an Exness IB link\", \"display_name\": \"أحمد\", \"addressee\": \"man\", \"broker\": \"إكسنس\", \"details\": [\"detail one\", \"detail two\", \"detail three\"], \"monetisation_proof\": \"VIP channel\"}"
    }
  }
});

const qualify = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9,
  config: {
    name: 'Qualify with Claude', position: [2500, 200], executeOnce: true,
    parameters: {
      promptType: 'define',
      text: expr('Profile JSON:\n{{ JSON.stringify($json.profile) }}'),
      hasOutputParser: true,
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "You are the lead qualifier for Bahaa Omoush, Relationship Manager MENA at ACY Securities in Amman. He looks for Arabic-speaking forex, gold and CFD people who make money from an audience and could become introducing brokers (IBs). You receive one Instagram profile as JSON (username, name, bio, follower and post counts, links, the last posts with dates and captions, country, notes). Judge it strictly and return JSON only.\n\nWho counts as a lead. They must be Arabic-speaking and based in the MENA region (Syria counts, Sudan and Yemen do not), they trade forex, gold or CFDs, and the profile shows proof they earn from an audience: a paid channel or VIP group, a course or academy with students, an existing broker or IB or affiliate link, or a team or community they run. Already working with another broker is a good sign, not a reason to reject. Someone who only posts analysis or content with no sign of a paid audience is NOT a lead: mark them weak.\n\nReject on sight: brokers and broker staff; prop firms and funded accounts (FTMO, FundingPips, حسابات ممولة); copy trading (نسخ الصفقات); account or portfolio management (إدارة حسابات، إدارة محافظ); bots and EAs (روبوت، اكسبيرت); binary options (Pocket Option, Quotex, Deriv); guaranteed profit or win-rate claims (مضمون، نسبة نجاح); network marketing (الحرية المالية، دخل إضافي، team leader, DM \"INFO\" funnels); crypto-only; stocks-only, futures-only or local markets (EGX, البورصة); general finance advisers; anyone presenting as staff of iTradePro or Papa Forex; and anything not in Arabic.\n\nWeak, not reject: fewer than about four hundred or more than about four hundred thousand followers, fewer than twelve posts, private, dormant for months, or a thin page where nothing proves they monetise an audience. Baha wants weak accounts listed, not messaged.\n\nAlso extract what the opener will need. display_name: the person's real first name in Arabic script if it appears anywhere, otherwise the brand or academy name in Arabic script (write Latin brand names phonetically in Arabic letters, for example AXL becomes إيه إكس إل). addressee: \"man\", \"woman\" or \"team\" (team for a brand, academy, duo or company page). broker: the broker they visibly work with, in Arabic script, or an empty string. details: three concrete, specific observations taken from actual posts, captions, link pages or pinned content, never from the bio line alone and never from follower counts. Each detail must be something only someone who looked at their content would know, in Arabic, and the third should ideally be the thing nobody else would notice (a registration page, a Telegram group structure, a recurring series, a broker partnership).\n\nReturn exactly this JSON shape and nothing else:\n{\"verdict\": \"lead\" | \"weak\" | \"reject\", \"reason\": \"one plain English sentence\", \"display_name\": \"...\", \"addressee\": \"man\" | \"woman\" | \"team\", \"broker\": \"\", \"details\": [\"...\", \"...\", \"...\"], \"monetisation_proof\": \"what proves they earn from an audience, or empty\"}" }] }
    },
    subnodes: { model: qualifyModel, outputParser: qualifyParser }
  },
  output: [{ output: { verdict: 'lead', reason: 'runs a paid channel', display_name: 'أحمد', addressee: 'man', broker: '', details: ['a', 'b', 'c'], monetisation_proof: 'VIP channel' } }]
});

const finalise = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Finalise verdict', position: [2900, 200], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Finalise verdict\" (action = check). Runs once for all items.\n// Merges Claude's judgment into the rule-based decision.\nconst d = $('Decide').first().json;\nconst out = $input.first().json;\nconst q = out.output ?? out;\nlet verdict = d.verdict;\nconst v = String(q.verdict || '').toLowerCase();\nif (v === 'reject') verdict = 'reject';\nelse if (v === 'weak') verdict = 'weak';\nelse if (v === 'lead') verdict = 'lead';\nconst reasons = [...(d.reasons || [])];\nif (q.reason) reasons.push(String(q.reason));\nreturn [{\n  json: {\n    ...d,\n    verdict,\n    reasons,\n    qualification: q,\n    display_name: q.display_name || d.profile.full_name || d.username,\n    addressee: ['man', 'woman', 'team'].includes(String(q.addressee || '').toLowerCase()) ? String(q.addressee).toLowerCase() : 'man',\n    broker: q.broker || '',\n    details: Array.isArray(q.details) ? q.details : [],\n    needs_ai: false,\n  },\n}];\n" } },
  output: [{ action: 'check', username: 'example_fx', verdict: 'lead', reasons: ['runs a paid channel'], display_name: 'أحمد', addressee: 'man', broker: '', details: ['a', 'b', 'c'], remaining_today: 17 }]
});

const respondCheck = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: check', position: [3200, 200], parameters: { respondWith: 'firstIncomingItem' } },
  output: [{ ok: true }]
});

const prepareOpener = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Prepare opener input', position: [700, 800], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Prepare opener input\" (action = opener). Runs once for all items.\nconst raw = $input.first().json;\nconst b = raw.body ?? raw;\nconst username = String(b.username ?? '').trim().replace(/^@/, '').toLowerCase();\nconst a = String(b.addressee ?? '').toLowerCase();\nconst addressee = ['man', 'woman', 'team'].includes(a) ? a : 'man';\nconst details = Array.isArray(b.details)\n  ? b.details.map((d) => String(d).trim()).filter(Boolean)\n  : String(b.details ?? '').split('\\n').map((s) => s.trim()).filter(Boolean);\nreturn [{\n  json: {\n    action: 'opener',\n    username,\n    name: String(b.name ?? b.display_name ?? b.full_name ?? username),\n    addressee,\n    details,\n    broker: String(b.broker ?? ''),\n    extra: String(b.extra ?? b.notes ?? ''),\n    enough_details: details.length >= 3,\n  },\n}];\n" } },
  output: [{ action: 'opener', username: 'example_fx', name: 'أحمد', addressee: 'man', details: ['a', 'b', 'c'], broker: '', extra: '', enough_details: true }]
});

const openerModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6,
  config: {
    name: 'Claude for opener', position: [1000, 1020],
    parameters: {
      model: { __rl: true, mode: 'list', value: 'claude-sonnet-5', cachedResultName: 'Claude Sonnet 5' },
      options: { maxTokensToSample: 2000, promptCaching: '1h' }
    },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const writeOpener = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9,
  config: {
    name: 'Write opener', position: [1000, 800], executeOnce: true,
    parameters: {
      promptType: 'define',
      text: expr('Name to address: {{ $json.name }}\n' + 'Addressee: {{ $json.addressee }}\n' + 'Broker they work with (empty if none): {{ $json.broker }}\n' + 'Three concrete details from their content:\n{{ $json.details.map((d, i) => (i + 1) + ". " + d).join("\\n") }}\n' + 'Extra context: {{ $json.extra }}\n\n' + 'Write the opener now.'),
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "You write Instagram openers for Bahaa Omoush (بهاء), Relationship Manager MENA at ACY Securities (إيه سي واي) in Amman. The reader is an Arabic-speaking forex, gold or CFD creator who earns from an audience. The opener must feel like a real person who actually read their page, and it must end with one open question. Nothing else.\n\nRules that override everything:\n- Jordanian spoken accent, always, whatever dialect the reader speaks. Natural, warm, not formal, not salesy.\n- Exactly five short paragraphs separated by blank lines. That is eight line breaks in total.\n- Start with مرحبا. Never أهلا.\n- Address them by the name you are given. For a team or brand, address the team.\n- Every detail must come from the details you are given. Do not invent facts, do not mention follower counts, do not quote the bio line alone.\n- Write every English term and brand name in Arabic script (تيليجرام، جست ماركت، إكسنس، إيه إكس إل). No Latin letters at all.\n- No digits of any kind. Write numbers in words if you must.\n- No em dashes, no en dashes, no prices, no rebates, no commission talk, no pitch, no links, no emojis.\n- If they visibly work with a broker, name that broker openly in the third paragraph.\n- Paragraph four is fixed and must be copied exactly. Paragraph five is the fixed closing question that matches the addressee.\n\nStructure:\n\nمرحبا [name]، [specific thing from their content].\n\nوعجبني كمان [second specific thing].\n\nولفتني [third thing, ideally the detail nobody else would notice. If they work with a broker, name it here openly].\n\nأنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.\n\n[closing question]\n\nClosing question by addressee:\n- man: كيف بتختار الشركة الي بتنصح فيها متابعينك؟\n- woman: كيف بتختاري الشركة الي بتنصحي فيها متابعينك؟\n- team: كيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟\n\nExample that went out (addressee: team):\n\nمرحبا فريق إيه إكس إل، عجبني بوست مين فيهم انت، نفس الشارت ونفس السوق وكل واحد بيطلع بنتيجة مختلفة.\n\nوعجبني كمان فيديو الإطلاق، إنه بعد سنين من \"علمني يا كوتش\" قررتوا تفتحوا الأكاديمية وتبلشوا تستقبلوا الناس.\n\nولفتني إنه صفحة التسجيل عندكم فيها دورات وتحليلات يومية ومجتمع تيليجرام وقناة توصيات، وفريقكم بيتواصل مع كل واحد بيسجل.\n\nأنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.\n\nكيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟\n\nOutput the message text only. No title, no quotes, no explanation, no code fence." }] }
    },
    subnodes: { model: openerModel }
  },
  output: [{ text: 'مرحبا أحمد، ...' }]
});

const checkOpener = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Check opener', position: [1300, 800], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Check opener\" and \"Check rewrite\" (action = opener). Runs once for all items.\n// Enforces the message format before anything is allowed to be pasted into Instagram.\nconst src = $('Prepare opener input').first().json;\nconst j = $input.first().json;\nconst raw = String(j.text ?? j.output ?? '').replace(/\\r/g, '');\nconst msg = raw.replace(/[ \\t]+\\n/g, '\\n').replace(/\\n[ \\t]+/g, '\\n').trim();\nconst paras = msg.split(/\\n\\s*\\n/).map((p) => p.trim()).filter(Boolean);\nconst problems = [];\n\nconst intro = 'أنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.';\nconst closings = {\n  man: 'كيف بتختار الشركة الي بتنصح فيها متابعينك؟',\n  woman: 'كيف بتختاري الشركة الي بتنصحي فيها متابعينك؟',\n  team: 'كيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟',\n};\nconst expectedClose = closings[src.addressee] || closings.man;\n\nif (!msg) problems.push('empty message');\nif (!msg.startsWith('مرحبا')) problems.push('must start with مرحبا');\nif (/أهلا|أهلاً|اهلا/.test(paras[0] || '')) problems.push('first paragraph uses أهلا');\nif (paras.length !== 5) problems.push('has ' + paras.length + ' paragraphs, needs exactly 5 separated by blank lines');\nif (/[0-9٠-٩۰-۹]/.test(msg)) problems.push('contains digits (write numbers in words)');\nif (/[–—]/.test(msg)) problems.push('contains an em dash or en dash');\nif (/[A-Za-z]/.test(msg)) problems.push('contains Latin letters (write English terms and brand names in Arabic script)');\nif (/[؀-ۿ]{40,}/.test(msg.replace(/\\s/g, '|'))) problems.push('a run of forty or more Arabic letters with no space');\nif (/\\$|%|€|£|ريبيت|عمولة|بونص|كاش باك|سبريد|رافعة|حساب مجاني|افتح حساب/.test(msg)) problems.push('contains a price, rebate or pitch word');\nif ((paras[1] || '').indexOf('وعجبني كمان') !== 0) problems.push('second paragraph must start with وعجبني كمان');\nif ((paras[2] || '').indexOf('ولفتني') !== 0) problems.push('third paragraph must start with ولفتني');\nif ((paras[3] || '') !== intro) problems.push('fourth paragraph must be exactly the fixed intro line');\nif ((paras[4] || '') !== expectedClose) problems.push('fifth paragraph must be exactly the closing question for ' + src.addressee);\nfor (let i = 0; i < 3; i++) {\n  if ((paras[i] || '').length < 25) problems.push('paragraph ' + (i + 1) + ' is too short to be specific');\n}\nif (src.broker && !paras.slice(0, 3).join(' ').includes(src.broker)) {\n  problems.push('broker name (' + src.broker + ') must be named openly in the third paragraph');\n}\n\nconst message = paras.join('\\n\\n');\nconst lineBreaks = (message.match(/\\n/g) || []).length;\nif (paras.length === 5 && lineBreaks !== 8) problems.push('needs exactly 8 line breaks, has ' + lineBreaks);\n\nreturn [{\n  json: {\n    ...src,\n    message,\n    valid: problems.length === 0,\n    problems,\n    line_breaks: lineBreaks,\n    paragraphs: paras.length,\n    chars: message.length,\n    draft: raw,\n  },\n}];\n" } },
  output: [{ username: 'example_fx', addressee: 'man', message: 'مرحبا أحمد، ...', valid: true, problems: [], line_breaks: 8, paragraphs: 5 }]
});

const openerValid = ifElse({
  version: 2.2,
  config: {
    name: 'Opener passes checks?', position: [1600, 800],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    }
  }
});


const rewriteModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6,
  config: {
    name: 'Claude for rewrite', position: [1900, 1120],
    parameters: {
      model: { __rl: true, mode: 'list', value: 'claude-sonnet-5', cachedResultName: 'Claude Sonnet 5' },
      options: { maxTokensToSample: 2000, promptCaching: '1h' }
    },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const rewriteOpener = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9,
  config: {
    name: 'Rewrite opener', position: [1900, 900], executeOnce: true,
    parameters: {
      promptType: 'define',
      text: expr('Name to address: {{ $json.name }}\n' + 'Addressee: {{ $json.addressee }}\n' + 'Broker they work with (empty if none): {{ $json.broker }}\n' + 'Three concrete details from their content:\n{{ $json.details.map((d, i) => (i + 1) + ". " + d).join("\\n") }}\n' + 'Extra context: {{ $json.extra }}\n\n' + 'Your previous draft failed these checks:\n{{ $json.problems.map((p) => "- " + p).join("\\n") }}\n\n' + 'Previous draft:\n{{ $json.draft }}\n\n' + 'Rewrite it so every check passes. Output the message text only.'),
      messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: "You write Instagram openers for Bahaa Omoush (بهاء), Relationship Manager MENA at ACY Securities (إيه سي واي) in Amman. The reader is an Arabic-speaking forex, gold or CFD creator who earns from an audience. The opener must feel like a real person who actually read their page, and it must end with one open question. Nothing else.\n\nRules that override everything:\n- Jordanian spoken accent, always, whatever dialect the reader speaks. Natural, warm, not formal, not salesy.\n- Exactly five short paragraphs separated by blank lines. That is eight line breaks in total.\n- Start with مرحبا. Never أهلا.\n- Address them by the name you are given. For a team or brand, address the team.\n- Every detail must come from the details you are given. Do not invent facts, do not mention follower counts, do not quote the bio line alone.\n- Write every English term and brand name in Arabic script (تيليجرام، جست ماركت، إكسنس، إيه إكس إل). No Latin letters at all.\n- No digits of any kind. Write numbers in words if you must.\n- No em dashes, no en dashes, no prices, no rebates, no commission talk, no pitch, no links, no emojis.\n- If they visibly work with a broker, name that broker openly in the third paragraph.\n- Paragraph four is fixed and must be copied exactly. Paragraph five is the fixed closing question that matches the addressee.\n\nStructure:\n\nمرحبا [name]، [specific thing from their content].\n\nوعجبني كمان [second specific thing].\n\nولفتني [third thing, ideally the detail nobody else would notice. If they work with a broker, name it here openly].\n\nأنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.\n\n[closing question]\n\nClosing question by addressee:\n- man: كيف بتختار الشركة الي بتنصح فيها متابعينك؟\n- woman: كيف بتختاري الشركة الي بتنصحي فيها متابعينك؟\n- team: كيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟\n\nExample that went out (addressee: team):\n\nمرحبا فريق إيه إكس إل، عجبني بوست مين فيهم انت، نفس الشارت ونفس السوق وكل واحد بيطلع بنتيجة مختلفة.\n\nوعجبني كمان فيديو الإطلاق، إنه بعد سنين من \"علمني يا كوتش\" قررتوا تفتحوا الأكاديمية وتبلشوا تستقبلوا الناس.\n\nولفتني إنه صفحة التسجيل عندكم فيها دورات وتحليلات يومية ومجتمع تيليجرام وقناة توصيات، وفريقكم بيتواصل مع كل واحد بيسجل.\n\nأنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.\n\nكيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟\n\nOutput the message text only. No title, no quotes, no explanation, no code fence." }] }
    },
    subnodes: { model: rewriteModel }
  },
  output: [{ text: 'مرحبا أحمد، ...' }]
});

const checkRewrite = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Check rewrite', position: [2200, 900], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Check opener\" and \"Check rewrite\" (action = opener). Runs once for all items.\n// Enforces the message format before anything is allowed to be pasted into Instagram.\nconst src = $('Prepare opener input').first().json;\nconst j = $input.first().json;\nconst raw = String(j.text ?? j.output ?? '').replace(/\\r/g, '');\nconst msg = raw.replace(/[ \\t]+\\n/g, '\\n').replace(/\\n[ \\t]+/g, '\\n').trim();\nconst paras = msg.split(/\\n\\s*\\n/).map((p) => p.trim()).filter(Boolean);\nconst problems = [];\n\nconst intro = 'أنا بهاء من شركة إيه سي واي، مسؤول العلاقات بمنطقة الشرق الأوسط.';\nconst closings = {\n  man: 'كيف بتختار الشركة الي بتنصح فيها متابعينك؟',\n  woman: 'كيف بتختاري الشركة الي بتنصحي فيها متابعينك؟',\n  team: 'كيف بتختاروا الشركة الي بتنصحوا فيها متابعينكم؟',\n};\nconst expectedClose = closings[src.addressee] || closings.man;\n\nif (!msg) problems.push('empty message');\nif (!msg.startsWith('مرحبا')) problems.push('must start with مرحبا');\nif (/أهلا|أهلاً|اهلا/.test(paras[0] || '')) problems.push('first paragraph uses أهلا');\nif (paras.length !== 5) problems.push('has ' + paras.length + ' paragraphs, needs exactly 5 separated by blank lines');\nif (/[0-9٠-٩۰-۹]/.test(msg)) problems.push('contains digits (write numbers in words)');\nif (/[–—]/.test(msg)) problems.push('contains an em dash or en dash');\nif (/[A-Za-z]/.test(msg)) problems.push('contains Latin letters (write English terms and brand names in Arabic script)');\nif (/[؀-ۿ]{40,}/.test(msg.replace(/\\s/g, '|'))) problems.push('a run of forty or more Arabic letters with no space');\nif (/\\$|%|€|£|ريبيت|عمولة|بونص|كاش باك|سبريد|رافعة|حساب مجاني|افتح حساب/.test(msg)) problems.push('contains a price, rebate or pitch word');\nif ((paras[1] || '').indexOf('وعجبني كمان') !== 0) problems.push('second paragraph must start with وعجبني كمان');\nif ((paras[2] || '').indexOf('ولفتني') !== 0) problems.push('third paragraph must start with ولفتني');\nif ((paras[3] || '') !== intro) problems.push('fourth paragraph must be exactly the fixed intro line');\nif ((paras[4] || '') !== expectedClose) problems.push('fifth paragraph must be exactly the closing question for ' + src.addressee);\nfor (let i = 0; i < 3; i++) {\n  if ((paras[i] || '').length < 25) problems.push('paragraph ' + (i + 1) + ' is too short to be specific');\n}\nif (src.broker && !paras.slice(0, 3).join(' ').includes(src.broker)) {\n  problems.push('broker name (' + src.broker + ') must be named openly in the third paragraph');\n}\n\nconst message = paras.join('\\n\\n');\nconst lineBreaks = (message.match(/\\n/g) || []).length;\nif (paras.length === 5 && lineBreaks !== 8) problems.push('needs exactly 8 line breaks, has ' + lineBreaks);\n\nreturn [{\n  json: {\n    ...src,\n    message,\n    valid: problems.length === 0,\n    problems,\n    line_breaks: lineBreaks,\n    paragraphs: paras.length,\n    chars: message.length,\n    draft: raw,\n  },\n}];\n" } },
  output: [{ username: 'example_fx', addressee: 'man', message: 'مرحبا أحمد، ...', valid: true, problems: [], line_breaks: 8, paragraphs: 5 }]
});

const respondOpener = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: opener', position: [2500, 800], parameters: { respondWith: 'firstIncomingItem' } },
  output: [{ ok: true }]
});

const saveSend = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Save send', position: [700, 1400],
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'list', value: 'PIsTCsiQmjjgJpIa', cachedResultName: 'acy_sends' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          sent_at: expr('{{ $json.body.sent_at || $now.toISO() }}'),
          username: expr('{{ String($json.body.username || "").replace(/^@/, "").toLowerCase() }}'),
          thread_id: expr('{{ String($json.body.thread_id || "") }}'),
          why: expr('{{ String($json.body.why || "") }}'),
          message: expr('{{ String($json.body.message || "") }}')
        },
        schema: [{ id: 'sent_at', displayName: 'sent_at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true }, { id: 'username', displayName: 'username', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'thread_id', displayName: 'thread_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'why', displayName: 'why', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'message', displayName: 'message', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const markHistory = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Mark in history', position: [1000, 1400],
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'list', value: '51jKjudXAfpmB31y', cachedResultName: 'acy_history' },
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'username', condition: 'eq', keyValue: expr("{{ String($('ACY Outreach API').item.json.body.username || '').replace(/^@/, '').toLowerCase() }}") }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          username: expr("{{ String($('ACY Outreach API').item.json.body.username || '').replace(/^@/, '').toLowerCase() }}"),
          source: 'n8n_send',
          note: expr("{{ 'opener sent ' + $now.toISO() }}")
        },
        schema: [{ id: 'username', displayName: 'username', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'source', displayName: 'source', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'note', displayName: 'note', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const respondSend = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: send logged', position: [1300, 1400], parameters: { respondWith: 'json', responseBody: "{ \"ok\": true, \"logged\": \"send\" }" } },
  output: [{ ok: true }]
});

const saveRejection = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Save rejection', position: [700, 1700],
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'list', value: 'TBxv3foitKcDeCJx', cachedResultName: 'acy_rejections' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          at: expr('{{ $now.toISO() }}'),
          username: expr('{{ String($json.body.username || "").replace(/^@/, "").toLowerCase() }}'),
          reason: expr('{{ String($json.body.reason || "") }}'),
          stage: expr('{{ String($json.body.stage || "profile") }}')
        },
        schema: [{ id: 'at', displayName: 'at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true }, { id: 'username', displayName: 'username', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'reason', displayName: 'reason', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'stage', displayName: 'stage', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const respondReject = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: rejection logged', position: [1000, 1700], parameters: { respondWith: 'json', responseBody: "{ \"ok\": true, \"logged\": \"rejection\" }" } },
  output: [{ ok: true }]
});

const saveFlag = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Save flag', position: [700, 2000],
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'list', value: 'Ul6UTpTrr7LkPGUt', cachedResultName: 'acy_flags' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          at: expr('{{ $now.toISO() }}'),
          username: expr('{{ String($json.body.username || "").replace(/^@/, "").toLowerCase() }}'),
          kind: expr('{{ String($json.body.kind || "reply") }}'),
          note: expr('{{ String($json.body.note || "") }}')
        },
        schema: [{ id: 'at', displayName: 'at', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true }, { id: 'username', displayName: 'username', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'kind', displayName: 'kind', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'note', displayName: 'note', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const respondFlag = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: flag logged', position: [1000, 2000], parameters: { respondWith: 'json', responseBody: "{ \"ok\": true, \"logged\": \"flag\" }" } },
  output: [{ ok: true }]
});

const sendsToday = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Sends today', position: [700, 2300], executeOnce: true, alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'list', value: 'PIsTCsiQmjjgJpIa', cachedResultName: 'acy_sends' },
      matchType: 'allConditions', returnAll: true,
      filters: { conditions: [{ keyName: 'sent_at', condition: 'gte', keyValue: expr("{{ $('ACY Outreach API').first().json.body.since || $today.toISO() }}") }] }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const rejectionsToday = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Rejections today', position: [1000, 2300], executeOnce: true, alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'list', value: 'TBxv3foitKcDeCJx', cachedResultName: 'acy_rejections' },
      matchType: 'allConditions', returnAll: true,
      filters: { conditions: [{ keyName: 'at', condition: 'gte', keyValue: expr("{{ $('ACY Outreach API').first().json.body.since || $today.toISO() }}") }] }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const flagsToday = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Flags today', position: [1300, 2300], executeOnce: true, alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'list', value: 'Ul6UTpTrr7LkPGUt', cachedResultName: 'acy_flags' },
      matchType: 'allConditions', returnAll: true,
      filters: { conditions: [{ keyName: 'at', condition: 'gte', keyValue: expr("{{ $('ACY Outreach API').first().json.body.since || $today.toISO() }}") }] }
    }
  },
  output: [{ id: 1, username: 'example_fx' }]
});

const buildReport = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Build report', position: [1600, 2300], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Build report\" (action = report). Runs once for all items.\n// Number first, problems first, plain English, Arabic kept in its own block.\nconst q = $('ACY Outreach API').first().json;\nconst b = q.body ?? q;\nconst rows = (n) => $(n).all().map((i) => i.json).filter((r) => r && r.username);\nconst sends = rows('Sends today');\nconst rejections = rows('Rejections today');\nconst flags = rows('Flags today');\nconst target = parseInt(String(b.target ?? '20'), 10) || 20;\n\nconst replies = flags.filter((f) => ['reply', 'voice_note'].includes(String(f.kind)));\nconst followups = flags.filter((f) => String(f.kind) === 'follow_up');\nconst other = flags.filter((f) => !['reply', 'voice_note', 'follow_up'].includes(String(f.kind)));\nconst problems = [];\nif (b.problems) problems.push(...(Array.isArray(b.problems) ? b.problems.map(String) : [String(b.problems)]));\nconst blocked = rejections.filter((r) => /failed to send|couldn't send|not sent|429|try again later/i.test(String(r.reason)));\nblocked.forEach((r) => problems.push('Instagram blocked a send on ' + r.username + ': ' + r.reason));\n\nconst lines = [];\nlines.push(sends.length + ' of ' + target + (problems.length ? ', here is what went wrong.' : ', no blockers today.'));\nif (problems.length) {\n  lines.push('');\n  problems.forEach((p) => lines.push(p));\n}\nif (replies.length) {\n  lines.push('');\n  lines.push('Replies and voice notes, flagged for you and not touched:');\n  replies.forEach((f) => lines.push(f.username + (f.note ? ' (' + f.note + ')' : '')));\n}\nif (followups.length) {\n  lines.push('');\n  lines.push('Follow-ups for you, Baha messaged first and they never replied:');\n  followups.forEach((f) => lines.push(f.username + (f.note ? ' (' + f.note + ')' : '')));\n}\nif (sends.length) {\n  lines.push('');\n  lines.push('Sent today:');\n  sends.forEach((s) => lines.push(s.username + ' (thread ' + (s.thread_id || 'unknown') + '): ' + (s.why || '')));\n}\nif (rejections.length) {\n  lines.push('');\n  lines.push('Rejected or skipped:');\n  rejections.forEach((r) => lines.push(r.username + ': ' + r.reason + (r.stage ? ' [' + r.stage + ']' : '')));\n}\nif (other.length) {\n  lines.push('');\n  lines.push('Other flags:');\n  other.forEach((f) => lines.push(f.username + ' ' + f.kind + (f.note ? ' (' + f.note + ')' : '')));\n}\nif (sends.length) {\n  lines.push('');\n  lines.push('Messages that went out (Arabic):');\n  lines.push('');\n  sends.forEach((s) => { lines.push(s.username); lines.push(s.message || ''); lines.push(''); });\n}\n\nreturn [{\n  json: {\n    report: lines.join('\\n'),\n    counts: {\n      sent: sends.length,\n      target,\n      remaining: Math.max(0, target - sends.length),\n      rejected: rejections.length,\n      replies: replies.length,\n      followups: followups.length,\n      problems: problems.length,\n    },\n    sends,\n    rejections,\n    flags,\n  },\n}];\n" } },
  output: [{ report: '7 of 20, here is what went wrong.', counts: { sent: 7, target: 20, remaining: 13, rejected: 4, replies: 1, followups: 2, problems: 1 } }]
});

const respondReport = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: report', position: [1900, 2300], parameters: { respondWith: 'firstIncomingItem' } },
  output: [{ ok: true }]
});

const parseHistory = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Parse history map', position: [700, 2700], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Parse history map\" (action = import_history). Runs once for all items.\n// Accepts the localStorage JSON (__acy_H22 / __acy_hist), a plain array, or a comma/space list.\nconst raw = $input.first().json;\nconst b = raw.body ?? raw;\nconst names = [];\nconst push = (v) => {\n  if (!v) return;\n  if (Array.isArray(v)) { v.forEach(push); return; }\n  if (typeof v === 'object') { Object.keys(v).forEach((k) => names.push(k)); return; }\n  if (typeof v === 'string') {\n    const s = v.trim();\n    if (s.startsWith('{') || s.startsWith('[')) {\n      try { push(JSON.parse(s)); return; } catch (e) { /* fall through to plain split */ }\n    }\n    s.split(/[\\s,]+/).forEach((x) => names.push(x));\n  }\n};\n['usernames', 'map', 'history', '__acy_H22', '__acy_hist'].forEach((k) => push(b[k]));\nconst seen = new Set();\nconst rows = [];\nfor (const n of names) {\n  const u = String(n).trim().replace(/^@/, '').toLowerCase();\n  if (u && !seen.has(u)) {\n    seen.add(u);\n    rows.push({ username: u, source: String(b.source ?? 'localStorage'), note: '' });\n  }\n}\nreturn [{ json: { count: rows.length, rows, imported: 0, ok: true } }];\n" } },
  output: [{ count: 2, rows: [{ username: 'a', source: 'localStorage', note: '' }, { username: 'b', source: 'localStorage', note: '' }], imported: 0, ok: true }]
});

const hasRows = ifElse({
  version: 2.2,
  config: {
    name: 'Anything to import?', position: [1000, 2700],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.count }}'), operator: { type: 'number', operation: 'gt' }, rightValue: 0 }],
        combinator: 'and'
      }
    }
  }
});

const splitRows = node({
  type: 'n8n-nodes-base.splitOut', version: 1,
  config: { name: 'One item per username', position: [1300, 2600], parameters: { fieldToSplitOut: 'rows', include: 'noOtherFields' } },
  output: [{ username: 'a', source: 'localStorage', note: '' }]
});

const upsertHistory = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Upsert into history', position: [1600, 2600],
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: { __rl: true, mode: 'list', value: '51jKjudXAfpmB31y', cachedResultName: 'acy_history' },
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'username', condition: 'eq', keyValue: expr('{{ $json.username }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { username: expr('{{ $json.username }}'), source: expr('{{ $json.source }}'), note: expr('{{ $json.note }}') },
        schema: [{ id: 'username', displayName: 'username', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'source', displayName: 'source', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'note', displayName: 'note', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1, username: 'a' }]
});

const countImported = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Count imported', position: [1900, 2600], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// Code node: \"Count imported\" (action = import_history). Runs once for all items.\nreturn [{ json: { imported: $input.all().length, ok: true } }];\n" } },
  output: [{ imported: 2, ok: true }]
});

const respondImport = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: import', position: [2200, 2700], parameters: { respondWith: 'firstIncomingItem' } },
  output: [{ ok: true }]
});

const respondUnknown = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond: unknown action', position: [700, 3000], parameters: { respondWith: 'json', responseBody: "{ \"ok\": false, \"error\": \"unknown action, use check, opener, log_send, log_reject, flag, report or import_history\" }", options: { responseCode: 400 } } },
  output: [{ ok: true }]
});

const noteApi = sticky("## ACY Instagram IB outreach brain\n\nOne POST webhook, routed by body.action. The browser side (Claude in Chrome on Baha's logged-in Instagram) does the looking and the pasting; this workflow holds the rules, the memory and the log.\n\ncheck: gate a candidate (lists, history map, daily cap, rule rejects, then Claude judges the profile).\nopener: write the five paragraph Jordanian opener and verify its format.\nlog_send / log_reject / flag: one line per event.\nreport: number first, problems first.\nimport_history: load the __acy_H22 / __acy_hist usernames once.", [inbound, route], { color: 4 });

const noteCheck = sticky("## check\n\nSkip on any list or history hit. Stop at twenty sends in twenty four hours. Rule rejects run before any AI call. Only a clean candidate reaches Claude, who returns lead / weak / reject plus the name, addressee, broker and three concrete details the opener needs.", [normalise, decide], { color: 6 });

const noteOpener = sticky("## opener\n\nClaude writes it, the Check node enforces: starts with مرحبا, five paragraphs, eight line breaks, no digits, no dashes, no Latin letters, no pitch words, fixed intro line, closing question by addressee, broker named openly. One automatic rewrite, then the result is returned with valid true or false.", [prepareOpener, checkOpener], { color: 6 });


export default workflow('acy-instagram-ib-outreach', 'ACY Instagram IB Outreach')
  .add(inbound)
  .to(route
    .onCase(0, normalise.to(lookupDnc).to(lookupHistory).to(sends24h).to(decide).to(needsAi
      .onTrue(qualify.to(finalise).to(respondCheck))
      .onFalse(respondCheck)))
    .onCase(1, prepareOpener.to(writeOpener).to(checkOpener).to(openerValid
      .onTrue(respondOpener)
      .onFalse(rewriteOpener.to(checkRewrite).to(respondOpener))))
    .onCase(2, saveSend.to(markHistory).to(respondSend))
    .onCase(3, saveRejection.to(respondReject))
    .onCase(4, saveFlag.to(respondFlag))
    .onCase(5, sendsToday.to(rejectionsToday).to(flagsToday).to(buildReport).to(respondReport))
    .onCase(6, parseHistory.to(hasRows
      .onTrue(splitRows.to(upsertHistory).to(countImported).to(respondImport))
      .onFalse(respondImport)))
    .onCase(7, respondUnknown))
  .add(noteApi)
  .add(noteCheck)
  .add(noteOpener)
  .group('Check: gate', [normalise, lookupDnc, lookupHistory, sends24h, decide], { description: 'Lists, history map, daily cap and rule rejects. Only a clean candidate goes on to the AI judgment.' })
  .group('Check: AI judgment', [qualify, qualifyModel, qualifyParser, finalise], { description: 'Claude reads the profile and returns lead, weak or reject plus what the opener needs.' })
  .group('Opener: write and verify', [prepareOpener, writeOpener, openerModel, checkOpener], { description: 'Claude drafts the five paragraph opener, the Check node enforces every format rule.' })
  .group('Opener: rewrite once', [rewriteOpener, rewriteModel, checkRewrite], { description: 'One automatic rewrite with the failed checks fed back, then re-verified.' })
  .group('Report', [sendsToday, rejectionsToday, flagsToday, buildReport], { description: 'Today\'s sends, rejections and flags turned into the number-first, problems-first summary.' })
  .group('Import history map', [splitRows, upsertHistory, countImported], { description: 'Upserts every username from the localStorage history map into acy_history.' });
