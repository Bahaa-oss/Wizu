# Voice Note Transcriber — How To

Read Instagram & WhatsApp voice notes as text, fast. Arabic + English.
**Runs 100% locally on your Windows PC. No cloud, no API keys, nothing uploaded.**

---

## What's in this folder

| File | What it is |
|------|------------|
| `transcribe_voice_notes.py` | The transcriber (uses faster-whisper on CPU). |
| `Run Voice Transcriber.bat` | Double-click to run it. |
| `Instagram Voice Note Downloader (bookmarklet).txt` | Browser bookmarklet to pull IG voice notes into Downloads. |
| `voice_transcripts.txt` | Created on first run — your readable transcripts. |
| `.voice_transcriber_state.json` | Created automatically — remembers what's already done. |

---

## One-time setup

1. **Install Python 3** (if you don't have it): https://www.python.org/downloads/
   During install, tick **"Add Python to PATH"**.
2. That's it. The first run auto-installs `faster-whisper` and downloads the
   `small` model. It needs internet **once** for that; after that it's fully offline.

---

## Getting your voice notes into the folder

### WhatsApp
1. In a chat, tap the voice note menu → **Share / Export**, or use
   **Export chat** to get the audio files.
2. WhatsApp audio is named like `WhatsApp Ptt ...` / `WhatsApp Audio ...` or
   ends in `.opus` — the transcriber picks these up automatically.
3. Copy them into this folder (or use `--folder` to point at where they are).

### Instagram
1. Open the **bookmarklet** file and follow its install steps (one time).
2. Open the IG DM conversation in your browser, **scroll up** so the voice
   notes load, then click the **IG Voice Downloader** bookmark.
3. The clips download to **Downloads** as `audioclip-*.mp4` / `audioclip-*.ogg`.
4. Move them into this folder.

---

## Running it

**Easiest:** double-click **`Run Voice Transcriber.bat`**.

It scans this folder, transcribes every **new** voice note, and appends the
text to `voice_transcripts.txt`. Re-running only handles files it hasn't seen
before, so it's safe to run again and again.

### From a terminal (optional)

```bat
py transcribe_voice_notes.py
```

**Command-line options:**

| Flag | Meaning | Example |
|------|---------|---------|
| `--folder` | Folder to scan (default: this script's folder) | `--folder "C:\Users\me\Downloads"` |
| `--model` | Model size: `tiny`, `base`, `small`, `medium`, `large-v3` (default `small`) | `--model medium` |
| `--lang` | Force a language instead of auto-detect | `--lang ar` |
| `--watch` | Keep running; transcribe new files as they land | `--watch` |

Examples:

```bat
py transcribe_voice_notes.py --folder "C:\Users\me\Downloads"
py transcribe_voice_notes.py --model medium --lang ar
py transcribe_voice_notes.py --watch
```

---

## Reading the results

Open **`voice_transcripts.txt`**. Each entry looks like:

```
======================================================================
File:     audioclip-1718900000-0.mp4
When:     2026-06-21 14:05:33
Duration: 0:42
Language: ar
----------------------------------------------------------------------
السلام عليكم، حابب أستفسر عن الخدمة والأسعار ...
```

---

## Tips & troubleshooting

- **Arabic accuracy too low?** Use a bigger model: `--model medium`
  (slower, more accurate). `small` is a good speed/quality balance on CPU.
- **It says "No new voice notes"** → everything's already transcribed. To
  redo a file, delete `.voice_transcriber_state.json` and run again.
- **"Python was not found"** → install Python and tick *Add to PATH*, then
  reboot or re-open the terminal.
- **First run is slow** → it's downloading the model once. Later runs are fast.
- **Mixed Arabic + English in one note?** Leave `--lang` off (auto-detect),
  or set it to the dominant language for cleaner output.
- Everything runs on your machine. No audio or text ever leaves your PC.
