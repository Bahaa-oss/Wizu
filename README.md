# Wizu — Daily Forex Education Auto-Poster

Automated daily educational forex content (liquidity, A/B/C-book brokers, regulation,
spreads, leverage, risk, psychology…) published to **Facebook Page + Instagram** with an
appealing branded visual, running hands-off on a schedule via **Make.com**.

This repo is the **content + configuration source of truth**. The live automation runs in
your Make account (Org `5814874` / Team `534604`).

---

## ⚠️ Read first: security

The previous version of this repo committed an **OpenAI API key in plain text** (file
`wizuu`). That file has been removed, **but the key still lives in git history** and must be
treated as compromised. **Rotate/revoke it now** at <https://platform.openai.com/api-keys>.
Never commit secrets — use Make connections (already set up) or the `.env` pattern instead.

---

## How it works

```
┌──────────────────────────────────────────────────────────────────────┐
│  Make scenario — runs daily ~19:00 Asia/Amman                          │
│                                                                        │
│  1. Schedule trigger (daily)                                           │
│  2. Pick today's topic  ── from topics/forex-topic-bank.json           │
│         (day-of-year % topic_count → repeats ~every 3 weeks)           │
│  3. (optional) OpenAI ── polish caption / translate / vary wording     │
│  4. Render visual ── headline + body text onto a branded template      │
│         → PNG  (the ONE step that needs a paid tool — see below)       │
│  5. Facebook Pages ── "Create a Post with Photos" (image + caption)    │
│  6. Instagram Business ── "Create a photo post" (image + caption)      │
│  7. Telegram ── SendPhoto (optional, reuse your existing channel)      │
│  8. Data store ── log what was posted (dedup / audit)                  │
└──────────────────────────────────────────────────────────────────────┘
```

Your existing Make scenarios (FXStreet / CNBC / ACY → Telegram) already use this exact
pattern — this just swaps the destination to FB + IG and the content to evergreen education.

---

## What works on your current (free) accounts

| Piece | Status |
|---|---|
| Daily scheduling | ✅ Make Core plan |
| Caption generation | ✅ OpenAI connection already exists |
| Topic rotation | ✅ this repo |
| Facebook Page posting | ✅ free — needs you to **authorize** (link below) |
| Instagram posting | ✅ free — needs a **Business/Creator IG linked to a FB Page** + authorize |
| Telegram cross-post | ✅ connection already exists |
| **Branded visual (text on image)** | ✅ **Templated.io free tier** (chosen) — see `make/visual-template.md` |

### The visual engine: Templated.io (chosen — free)

Hands-off "headline text on a branded background" is handled by **Templated.io** on its free
tier ($0/mo, ~30 renders/month = one daily post). It's purpose-built for "text-on-template via
API" and has a native Make module. Setup + template spec: **`make/visual-template.md`**.

> Higgs Field (your original pick) and Canva both require a paid plan for automated image
> generation, and Higgs Field can't reliably put clean text on an image — so a free
> automation-native renderer is the better fit for educational text posts. The wiring is
> identical for Bannerbear/Placid if you ever switch: each just returns a PNG URL.

---

## Authorize your accounts (do these — only you can)

Open each link while logged into Make and approve. Pick the Facebook **Page** (and the
**Instagram Business** account linked to it) you want to post to.

- **Facebook Page:** https://eu1.make.com/534604/credentials-requests/inbox?requestId=bc4f4257-7bcb-448b-b104-a2cd53700da6
- **Instagram Business:** https://eu1.make.com/534604/credentials-requests/inbox?requestId=86d851d9-6ed7-4262-a5c0-c704d0b01c6f

> Instagram auto-posting **only** works with an Instagram **Business or Creator** account
> that is linked to a Facebook Page. A personal IG account cannot be automated by any tool.

---

## Repo layout

| Path | What |
|---|---|
| `topics/forex-topic-bank.json` | The daily topic library (EN + AR captions, hashtags, visual prompt). Edit freely. |
| `prompts/caption-system-prompt.md` | OpenAI system prompt to format/vary the daily caption. |
| `make/SETUP.md` | Step-by-step guide to build the Make scenario. |
| `.env.example` | Template for any keys you run locally (never commit real keys). |

---

## About Facebook Groups & your personal profile

You asked to also auto-post across Facebook **Groups** and your profile. Meta deprecated the
Groups publishing API and actively detects/ bans scheduled group spam — automating it risks a
**permanent ban** that would also kill the Page + IG. This system therefore does **not**
auto-post to groups. Instead it can drop a ready-made image + caption each day (via Telegram
or Google Drive) so you can share into your groups in a couple of taps — safe and sustainable.
