# Make scenario setup — Daily Forex Education → Facebook + Instagram

Build this once in your Make account (Team `534604`). It mirrors your existing
RSS→OpenAI→Telegram scenarios, so the pattern will feel familiar.

## Prerequisites
1. ✅ Authorize **Facebook Pages** and **Instagram Business** connections (links in the README).
2. Choose + connect a **visual engine** (Canva Pro / Higgs Field / Placid — see README).
3. Make sure `topics/forex-topic-bank.json` is pushed to GitHub so it has a public raw URL:
   `https://raw.githubusercontent.com/Bahaa-oss/Wizu/<branch>/topics/forex-topic-bank.json`

---

## Modules (in order)

### 1. Schedule trigger
- App: **(built-in) Schedule** — run scenario **Every day** at `19:00`, timezone **Asia/Amman**.

### 2. HTTP → Get the topic bank
- App: **HTTP → Make a request** (GET) to the raw GitHub JSON URL above.
- Parse response as JSON (enable "Parse response").

### 3. Set variable → today's index
- App: **(built-in) Tools → Set variable**
- Name: `topicIndex`
- Value (formula): `{{floor(parseNumber(formatDate(now; "DDD")) % length(2.topics))}}`
  - `DDD` = day-of-year. Modulo the number of topics → rotates through them.
- Then map the chosen topic as `{{2.topics[3.topicIndex]}}` downstream (Make arrays are
  1-based, so you may use `topicIndex + 1` depending on your formula — test once).

### 4. (Optional) OpenAI → Create a Completion
- App: **OpenAI (GPT)** — use existing connection `My OpenAI connection`.
- System prompt: see `prompts/caption-system-prompt.md`. Map fields from the topic record.
- Skip this module to save an operation and just use the JSON `caption_ar` / `caption_en`.

### 5. Visual engine → render PNG  (pick the one you connected)

**Option A — Canva (Pro):**
- App: **Canva → Autofill a Design from a Brand Template**
- `Brand Template`: your forex post template (with tagged fields `headline`, `body`).
- Map `headline` ← topic `title_ar` (or `title_en`), `body` ← short version of caption.
- Then **Canva → Export a Design** as PNG → use the returned download URL downstream.

**Option C — Placid / Templated.io / Bannerbear (free tier):**
- App: that renderer's **Create an Image** module.
- Map your template's text layers to `title` + `caption`. Output = a public PNG URL.

> Whichever engine: the next modules need a **publicly accessible image URL** (Meta downloads
> the image server-side). Canva/Placid/Bannerbear all return one.

### 6. Facebook Pages → Create a Post with Photos
- App: **Facebook Pages → Create a Post with Photos** (connection: your authorized Page).
- `Photos`: the PNG URL from step 5.
- `Message`: the caption (from step 4 or the JSON).

### 7. Instagram Business → Create a photo post
- App: **Instagram Business → Create a photo post** (connection: your authorized IG).
- `Image URL`: the PNG URL from step 5.
- `Caption`: caption + hashtags.

### 8. (Optional) Telegram → Send a Photo
- Reuse your existing Telegram connection to also drop the post into your channel/group
  for easy manual sharing into Facebook Groups.

### 9. Data store → Add a record (audit/dedup)
- Use a data store (e.g. create `forexEducationLog`) to record `{ date, topicId, status }`.

---

## Test before activating
- Run the scenario once manually ("Run once"). Confirm:
  - the correct topic is selected for today,
  - the PNG renders with readable text,
  - the post appears on the FB Page and IG.
- Then set the schedule to active.

## Operations budget
~5–8 operations/day ≈ 150–240/month — well within your 20,000/month Core quota.
