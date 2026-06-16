# Visual template spec — Templated.io (free tier)

The daily image is rendered by **Templated.io** (free plan, API access, native Make module).
You build the template **once** in Templated's editor; Make then fills its text layers with
each day's topic and gets back a public PNG URL to post.

## 1. Sign up (free) & get your API key
1. Create a free account at <https://templated.io>.
2. Go to **Settings → API** and copy your **API key**.
3. In Make, add a **Templated.io** connection (or send me the key and I'll wire the
   connection via a credential request).

## 2. Build the template (once)
Create a new template, size **1080 × 1080** (square — works for both FB and IG).
Add these layers and name them **exactly** (the names become the API fields):

| Layer name | Type | Purpose | Maps from topic |
|---|---|---|---|
| `background` | Image/shape | Brand background (navy + gold suggested) | static |
| `category` | Text | Small kicker label, e.g. "BROKER MODELS" | `category` |
| `headline` | Text | Big headline | `title_ar` (or `title_en`) |
| `body` | Text | 1–2 line teaser | first line of `caption_ar` / `hook` |
| `logo` | Image | Your brand logo | static (upload once) |
| `handle` | Text | Your @handle / page name | static |

Styling tips for readability:
- Headline: bold, 64–96px, high contrast, auto-fit enabled.
- Keep `body` short — the full teaching goes in the post caption, not the image.
- For Arabic, set the text layers' font to an Arabic-supporting font and **RTL** alignment.

## 3. Make module config (replaces step 5 in SETUP.md)
- App: **Templated.io → Create a Render**
- `Template`: your template ID.
- Layer mappings (JSON the module exposes once the template is selected):
  ```
  category → {{ topic.category }}
  headline → {{ topic.title_ar }}
  body     → {{ topic.hook }}
  ```
- Output: a public PNG URL → feed it into the Facebook Pages + Instagram modules.

## Free-tier note
Templated.io's free plan covers a low monthly render volume — one post/day fits. If you later
scale to multiple posts/day or add channels, upgrade or switch the renderer; the rest of the
scenario is unchanged because every renderer just returns a PNG URL.

## Alternatives (same wiring, different module)
- **Bannerbear** — `Create an Image` module. Free tier ~30 images/mo.
- **Placid** — `Create Image` module. Similar layer-mapping model.
All three are drop-in: build a template with named text layers, map the topic fields, get a
PNG URL.
