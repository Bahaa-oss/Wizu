#!/usr/bin/env python3
"""Assemble workflow.sdk.ts for the n8n Workflow SDK from the code/ and prompts/ folders.

Run from the repo root:  python3 acy-outreach-n8n/build_workflow.py
The output file is what gets pasted into n8n (create_workflow_from_code) or kept as the source of truth.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
CODE = HERE / "code"
PROMPTS = HERE / "prompts"

TABLES = {
    "history": ("51jKjudXAfpmB31y", "acy_history"),
    "dnc": ("iXgUuvpmrTyd19Q6", "acy_dnc"),
    "sends": ("PIsTCsiQmjjgJpIa", "acy_sends"),
    "rejections": ("TBxv3foitKcDeCJx", "acy_rejections"),
    "flags": ("Ul6UTpTrr7LkPGUt", "acy_flags"),
}


def js(s: str) -> str:
    """A JS string literal (double quoted) that round-trips exactly."""
    return json.dumps(s, ensure_ascii=False)


def code(name: str) -> str:
    return js((CODE / name).read_text(encoding="utf-8"))


def prompt(name: str) -> str:
    return js((PROMPTS / name).read_text(encoding="utf-8").strip())


def table(key: str) -> str:
    tid, name = TABLES[key]
    return "{ __rl: true, mode: 'list', value: '%s', cachedResultName: '%s' }" % (tid, name)


def col(name: str, typ: str = "string") -> str:
    return ("{ id: '%s', displayName: '%s', required: false, defaultMatch: false, display: true, "
            "type: '%s', canBeUsedToMatch: true }" % (name, name, typ))


def lookup(var, name, key, filters, pos, extra=""):
    return f"""
const {var} = node({{
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {{
    name: '{name}', position: [{pos[0]}, {pos[1]}], executeOnce: true, alwaysOutputData: true,
    parameters: {{
      resource: 'row', operation: 'get', dataTableId: {table(key)},
      matchType: 'allConditions', returnAll: true,
      filters: {{ conditions: [{filters}] }}{extra}
    }}
  }},
  output: [{{ id: 1, username: 'example_fx' }}]
}});"""


def respond(var, name, pos, mode="firstIncomingItem", body=None, status=None):
    opts = ""
    if status:
        opts = f", options: {{ responseCode: {status} }}"
    if mode == "json":
        params = f"respondWith: 'json', responseBody: {js(body)}{opts}"
    else:
        params = f"respondWith: '{mode}'{opts}"
    return f"""
const {var} = node({{
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {{ name: '{name}', position: [{pos[0]}, {pos[1]}], parameters: {{ {params} }} }},
  output: [{{ ok: true }}]
}});"""


def model(var, name, pos):
    return f"""
const {var} = languageModel({{
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6,
  config: {{
    name: '{name}', position: [{pos[0]}, {pos[1]}],
    parameters: {{
      model: {{ __rl: true, mode: 'list', value: 'claude-sonnet-5', cachedResultName: 'Claude Sonnet 5' }},
      options: {{ maxTokensToSample: 2000, promptCaching: '1h' }}
    }},
    credentials: {{ anthropicApi: newCredential('Anthropic') }}
  }}
}});"""


def switch_rule(value):
    return ("{ renameOutput: true, outputKey: '%s', conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' }, "
            "conditions: [{ leftValue: expr('{{ $json.body.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: '%s' }], "
            "combinator: 'and' } }" % (value, value))


ACTIONS = ["check", "opener", "log_send", "log_reject", "flag", "report", "import_history"]

parts = []
parts.append("""import { workflow, node, trigger, sticky, placeholder, newCredential, ifElse, switchCase, merge, splitInBatches, nextBatch, languageModel, memory, tool, outputParser, embedding, embeddings, vectorStore, retriever, documentLoader, textSplitter, reranker, fromAi, expr } from '@n8n/workflow-sdk';

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
      rules: { values: [%s] },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'unknown' }
    }
  }
});
""" % ",\n        ".join(switch_rule(a) for a in ACTIONS))

# ---------- check ----------
parts.append(f"""
const normalise = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Normalise', position: [700, 200], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('normalise.js')} }} }},
  output: [{{ action: 'check', username: 'example_fx', verdict: 'candidate', reasons: [], profile: {{ username: 'example_fx', bio: 'أكاديمية تداول', followers: 12400, posts: 88 }} }}]
}});""")
parts.append(lookup("lookupDnc", "Lookup DNC", "dnc",
                    "{ keyName: 'username', condition: 'eq', keyValue: expr(\"{{ $('Normalise').first().json.username }}\") }",
                    (1000, 200)))
parts.append(lookup("lookupHistory", "Lookup history", "history",
                    "{ keyName: 'username', condition: 'eq', keyValue: expr(\"{{ $('Normalise').first().json.username }}\") }",
                    (1300, 200)))
parts.append(lookup("sends24h", "Sends last 24h", "sends",
                    "{ keyName: 'sent_at', condition: 'gte', keyValue: expr('{{ $now.minus({ hours: 24 }).toISO() }}') }",
                    (1600, 200)))
parts.append(f"""
const decide = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Decide', position: [1900, 200], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('decide.js')} }} }},
  output: [{{ action: 'check', username: 'example_fx', verdict: 'candidate', reasons: [], sends_last_24h: 3, cap: 20, cap_reached: false, remaining_today: 17, needs_ai: true, profile: {{ username: 'example_fx' }} }}]
}});

const needsAi = ifElse({{
  version: 2.2,
  config: {{
    name: 'Needs AI judgment?', position: [2200, 200],
    parameters: {{
      conditions: {{
        options: {{ caseSensitive: true, leftValue: '', typeValidation: 'strict' }},
        conditions: [{{ leftValue: expr('{{{{ $json.needs_ai }}}}'), operator: {{ type: 'boolean', operation: 'true', singleValue: true }}, rightValue: '' }}],
        combinator: 'and'
      }}
    }}
  }}
}});
""")
parts.append(model("qualifyModel", "Claude for qualification", (2500, 420)))
parts.append(f"""
const qualifyParser = outputParser({{
  type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3,
  config: {{
    name: 'Qualification JSON', position: [2750, 420],
    parameters: {{
      schemaType: 'fromJson',
      jsonSchemaExample: {js(json.dumps({"verdict": "lead", "reason": "runs a paid Telegram channel with an Exness IB link", "display_name": "أحمد", "addressee": "man", "broker": "إكسنس", "details": ["detail one", "detail two", "detail three"], "monetisation_proof": "VIP channel"}, ensure_ascii=False))}
    }}
  }}
}});

const qualify = node({{
  type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9,
  config: {{
    name: 'Qualify with Claude', position: [2500, 200], executeOnce: true,
    parameters: {{
      promptType: 'define',
      text: expr('Profile JSON:\\n{{{{ JSON.stringify($json.profile) }}}}'),
      hasOutputParser: true,
      messages: {{ messageValues: [{{ type: 'SystemMessagePromptTemplate', message: {prompt('qualify_system.md')} }}] }}
    }},
    subnodes: {{ model: qualifyModel, outputParser: qualifyParser }}
  }},
  output: [{{ output: {{ verdict: 'lead', reason: 'runs a paid channel', display_name: 'أحمد', addressee: 'man', broker: '', details: ['a', 'b', 'c'], monetisation_proof: 'VIP channel' }} }}]
}});

const finalise = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Finalise verdict', position: [2900, 200], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('finalise.js')} }} }},
  output: [{{ action: 'check', username: 'example_fx', verdict: 'lead', reasons: ['runs a paid channel'], display_name: 'أحمد', addressee: 'man', broker: '', details: ['a', 'b', 'c'], remaining_today: 17 }}]
}});""")
parts.append(respond("respondCheck", "Respond: check", (3200, 200)))

# ---------- opener ----------
parts.append(f"""
const prepareOpener = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Prepare opener input', position: [700, 800], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('prepare_opener.js')} }} }},
  output: [{{ action: 'opener', username: 'example_fx', name: 'أحمد', addressee: 'man', details: ['a', 'b', 'c'], broker: '', extra: '', enough_details: true }}]
}});""")
parts.append(model("openerModel", "Claude for opener", (1000, 1020)))
OPENER_TEXT = ("expr('Name to address: {{ $json.name }}\\n' + "
               "'Addressee: {{ $json.addressee }}\\n' + "
               "'Broker they work with (empty if none): {{ $json.broker }}\\n' + "
               "'Three concrete details from their content:\\n{{ $json.details.map((d, i) => (i + 1) + \". \" + d).join(\"\\\\n\") }}\\n' + "
               "'Extra context: {{ $json.extra }}\\n\\n' + "
               "'Write the opener now.')")
parts.append(f"""
const writeOpener = node({{
  type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9,
  config: {{
    name: 'Write opener', position: [1000, 800], executeOnce: true,
    parameters: {{
      promptType: 'define',
      text: {OPENER_TEXT},
      messages: {{ messageValues: [{{ type: 'SystemMessagePromptTemplate', message: {prompt('opener_system.md')} }}] }}
    }},
    subnodes: {{ model: openerModel }}
  }},
  output: [{{ text: 'مرحبا أحمد، ...' }}]
}});

const checkOpener = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Check opener', position: [1300, 800], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('check_opener.js')} }} }},
  output: [{{ username: 'example_fx', addressee: 'man', message: 'مرحبا أحمد، ...', valid: true, problems: [], line_breaks: 8, paragraphs: 5 }}]
}});

const openerValid = ifElse({{
  version: 2.2,
  config: {{
    name: 'Opener passes checks?', position: [1600, 800],
    parameters: {{
      conditions: {{
        options: {{ caseSensitive: true, leftValue: '', typeValidation: 'strict' }},
        conditions: [{{ leftValue: expr('{{{{ $json.valid }}}}'), operator: {{ type: 'boolean', operation: 'true', singleValue: true }}, rightValue: '' }}],
        combinator: 'and'
      }}
    }}
  }}
}});
""")
parts.append(model("rewriteModel", "Claude for rewrite", (1900, 1120)))
REWRITE_TEXT = ("expr('Name to address: {{ $json.name }}\\n' + "
                "'Addressee: {{ $json.addressee }}\\n' + "
                "'Broker they work with (empty if none): {{ $json.broker }}\\n' + "
                "'Three concrete details from their content:\\n{{ $json.details.map((d, i) => (i + 1) + \". \" + d).join(\"\\\\n\") }}\\n' + "
                "'Extra context: {{ $json.extra }}\\n\\n' + "
                "'Your previous draft failed these checks:\\n{{ $json.problems.map((p) => \"- \" + p).join(\"\\\\n\") }}\\n\\n' + "
                "'Previous draft:\\n{{ $json.draft }}\\n\\n' + "
                "'Rewrite it so every check passes. Output the message text only.')")
parts.append(f"""
const rewriteOpener = node({{
  type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9,
  config: {{
    name: 'Rewrite opener', position: [1900, 900], executeOnce: true,
    parameters: {{
      promptType: 'define',
      text: {REWRITE_TEXT},
      messages: {{ messageValues: [{{ type: 'SystemMessagePromptTemplate', message: {prompt('opener_system.md')} }}] }}
    }},
    subnodes: {{ model: rewriteModel }}
  }},
  output: [{{ text: 'مرحبا أحمد، ...' }}]
}});

const checkRewrite = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Check rewrite', position: [2200, 900], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('check_opener.js')} }} }},
  output: [{{ username: 'example_fx', addressee: 'man', message: 'مرحبا أحمد، ...', valid: true, problems: [], line_breaks: 8, paragraphs: 5 }}]
}});""")
parts.append(respond("respondOpener", "Respond: opener", (2500, 800)))

# ---------- log_send ----------
parts.append(f"""
const saveSend = node({{
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {{
    name: 'Save send', position: [700, 1400],
    parameters: {{
      resource: 'row', operation: 'insert', dataTableId: {table('sends')},
      columns: {{
        mappingMode: 'defineBelow',
        value: {{
          sent_at: expr('{{{{ $json.body.sent_at || $now.toISO() }}}}'),
          username: expr('{{{{ String($json.body.username || "").replace(/^@/, "").toLowerCase() }}}}'),
          thread_id: expr('{{{{ String($json.body.thread_id || "") }}}}'),
          why: expr('{{{{ String($json.body.why || "") }}}}'),
          message: expr('{{{{ String($json.body.message || "") }}}}')
        }},
        schema: [{col('sent_at', 'date')}, {col('username')}, {col('thread_id')}, {col('why')}, {col('message')}]
      }}
    }}
  }},
  output: [{{ id: 1, username: 'example_fx' }}]
}});

const markHistory = node({{
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {{
    name: 'Mark in history', position: [1000, 1400],
    parameters: {{
      resource: 'row', operation: 'upsert', dataTableId: {table('history')},
      matchType: 'allConditions',
      filters: {{ conditions: [{{ keyName: 'username', condition: 'eq', keyValue: expr("{{{{ String($('ACY Outreach API').item.json.body.username || '').replace(/^@/, '').toLowerCase() }}}}") }}] }},
      columns: {{
        mappingMode: 'defineBelow',
        value: {{
          username: expr("{{{{ String($('ACY Outreach API').item.json.body.username || '').replace(/^@/, '').toLowerCase() }}}}"),
          source: 'n8n_send',
          note: expr("{{{{ 'opener sent ' + $now.toISO() }}}}")
        }},
        schema: [{col('username')}, {col('source')}, {col('note')}]
      }}
    }}
  }},
  output: [{{ id: 1, username: 'example_fx' }}]
}});""")
parts.append(respond("respondSend", "Respond: send logged", (1300, 1400), "json", '{ "ok": true, "logged": "send" }'))

# ---------- log_reject ----------
parts.append(f"""
const saveRejection = node({{
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {{
    name: 'Save rejection', position: [700, 1700],
    parameters: {{
      resource: 'row', operation: 'insert', dataTableId: {table('rejections')},
      columns: {{
        mappingMode: 'defineBelow',
        value: {{
          at: expr('{{{{ $now.toISO() }}}}'),
          username: expr('{{{{ String($json.body.username || "").replace(/^@/, "").toLowerCase() }}}}'),
          reason: expr('{{{{ String($json.body.reason || "") }}}}'),
          stage: expr('{{{{ String($json.body.stage || "profile") }}}}')
        }},
        schema: [{col('at', 'date')}, {col('username')}, {col('reason')}, {col('stage')}]
      }}
    }}
  }},
  output: [{{ id: 1, username: 'example_fx' }}]
}});""")
parts.append(respond("respondReject", "Respond: rejection logged", (1000, 1700), "json", '{ "ok": true, "logged": "rejection" }'))

# ---------- flag ----------
parts.append(f"""
const saveFlag = node({{
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {{
    name: 'Save flag', position: [700, 2000],
    parameters: {{
      resource: 'row', operation: 'insert', dataTableId: {table('flags')},
      columns: {{
        mappingMode: 'defineBelow',
        value: {{
          at: expr('{{{{ $now.toISO() }}}}'),
          username: expr('{{{{ String($json.body.username || "").replace(/^@/, "").toLowerCase() }}}}'),
          kind: expr('{{{{ String($json.body.kind || "reply") }}}}'),
          note: expr('{{{{ String($json.body.note || "") }}}}')
        }},
        schema: [{col('at', 'date')}, {col('username')}, {col('kind')}, {col('note')}]
      }}
    }}
  }},
  output: [{{ id: 1, username: 'example_fx' }}]
}});""")
parts.append(respond("respondFlag", "Respond: flag logged", (1000, 2000), "json", '{ "ok": true, "logged": "flag" }'))

# ---------- report ----------
SINCE = "expr(\"{{ $('ACY Outreach API').first().json.body.since || $today.toISO() }}\")"
parts.append(lookup("sendsToday", "Sends today", "sends",
                    f"{{ keyName: 'sent_at', condition: 'gte', keyValue: {SINCE} }}", (700, 2300)))
parts.append(lookup("rejectionsToday", "Rejections today", "rejections",
                    f"{{ keyName: 'at', condition: 'gte', keyValue: {SINCE} }}", (1000, 2300)))
parts.append(lookup("flagsToday", "Flags today", "flags",
                    f"{{ keyName: 'at', condition: 'gte', keyValue: {SINCE} }}", (1300, 2300)))
parts.append(f"""
const buildReport = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Build report', position: [1600, 2300], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('build_report.js')} }} }},
  output: [{{ report: '7 of 20, here is what went wrong.', counts: {{ sent: 7, target: 20, remaining: 13, rejected: 4, replies: 1, followups: 2, problems: 1 }} }}]
}});""")
parts.append(respond("respondReport", "Respond: report", (1900, 2300)))

# ---------- import_history ----------
parts.append(f"""
const parseHistory = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Parse history map', position: [700, 2700], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('parse_history.js')} }} }},
  output: [{{ count: 2, rows: [{{ username: 'a', source: 'localStorage', note: '' }}, {{ username: 'b', source: 'localStorage', note: '' }}], imported: 0, ok: true }}]
}});

const hasRows = ifElse({{
  version: 2.2,
  config: {{
    name: 'Anything to import?', position: [1000, 2700],
    parameters: {{
      conditions: {{
        options: {{ caseSensitive: true, leftValue: '', typeValidation: 'strict' }},
        conditions: [{{ leftValue: expr('{{{{ $json.count }}}}'), operator: {{ type: 'number', operation: 'gt' }}, rightValue: 0 }}],
        combinator: 'and'
      }}
    }}
  }}
}});

const splitRows = node({{
  type: 'n8n-nodes-base.splitOut', version: 1,
  config: {{ name: 'One item per username', position: [1300, 2600], parameters: {{ fieldToSplitOut: 'rows', include: 'noOtherFields' }} }},
  output: [{{ username: 'a', source: 'localStorage', note: '' }}]
}});

const upsertHistory = node({{
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {{
    name: 'Upsert into history', position: [1600, 2600],
    parameters: {{
      resource: 'row', operation: 'upsert', dataTableId: {table('history')},
      matchType: 'allConditions',
      filters: {{ conditions: [{{ keyName: 'username', condition: 'eq', keyValue: expr('{{{{ $json.username }}}}') }}] }},
      columns: {{
        mappingMode: 'defineBelow',
        value: {{ username: expr('{{{{ $json.username }}}}'), source: expr('{{{{ $json.source }}}}'), note: expr('{{{{ $json.note }}}}') }},
        schema: [{col('username')}, {col('source')}, {col('note')}]
      }}
    }}
  }},
  output: [{{ id: 1, username: 'a' }}]
}});

const countImported = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Count imported', position: [1900, 2600], parameters: {{ mode: 'runOnceForAllItems', language: 'javaScript', jsCode: {code('count_imported.js')} }} }},
  output: [{{ imported: 2, ok: true }}]
}});""")
parts.append(respond("respondImport", "Respond: import", (2200, 2700)))

# ---------- fallback ----------
parts.append(respond("respondUnknown", "Respond: unknown action", (700, 3000), "json",
                     '{ "ok": false, "error": "unknown action, use check, opener, log_send, log_reject, flag, report or import_history" }', 400))

# ---------- notes ----------
parts.append(f"""
const noteApi = sticky({js(
    "## ACY Instagram IB outreach brain\n\n"
    "One POST webhook, routed by body.action. The browser side (Claude in Chrome on Baha's logged-in Instagram) does the looking and the pasting; "
    "this workflow holds the rules, the memory and the log.\n\n"
    "check: gate a candidate (lists, history map, daily cap, rule rejects, then Claude judges the profile).\n"
    "opener: write the five paragraph Jordanian opener and verify its format.\n"
    "log_send / log_reject / flag: one line per event.\n"
    "report: number first, problems first.\n"
    "import_history: load the __acy_H22 / __acy_hist usernames once."
)}, [inbound, route], {{ color: 4 }});

const noteCheck = sticky({js(
    "## check\n\nSkip on any list or history hit. Stop at twenty sends in twenty four hours. Rule rejects run before any AI call. "
    "Only a clean candidate reaches Claude, who returns lead / weak / reject plus the name, addressee, broker and three concrete details the opener needs."
)}, [normalise, decide], {{ color: 6 }});

const noteOpener = sticky({js(
    "## opener\n\nClaude writes it, the Check node enforces: starts with مرحبا, five paragraphs, eight line breaks, no digits, no dashes, no Latin letters, "
    "no pitch words, fixed intro line, closing question by addressee, broker named openly. One automatic rewrite, then the result is returned with valid true or false."
)}, [prepareOpener, checkOpener], {{ color: 6 }});
""")

# ---------- composition ----------
parts.append("""
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
  .group('Report', [sendsToday, rejectionsToday, flagsToday, buildReport], { description: 'Today\\'s sends, rejections and flags turned into the number-first, problems-first summary.' })
  .group('Import history map', [splitRows, upsertHistory, countImported], { description: 'Upserts every username from the localStorage history map into acy_history.' });
""")

out = HERE / "workflow.sdk.ts"
out.write_text("\n".join(parts), encoding="utf-8")
print("wrote", out, len(out.read_text(encoding='utf-8')), "chars")
