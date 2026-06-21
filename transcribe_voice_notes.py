#!/usr/bin/env python3
"""
transcribe_voice_notes.py
=========================
Local, offline transcriber for Instagram + WhatsApp voice notes.
Arabic + English capable. Uses faster-whisper on CPU (compute_type=int8).

Nothing leaves your machine. No API keys. No cloud.

Quick start (Windows): double-click "Run Voice Transcriber.bat".
Or from a terminal:
    py transcribe_voice_notes.py
    py transcribe_voice_notes.py --folder "C:\\path\\to\\voice notes" --model small
    py transcribe_voice_notes.py --lang ar
    py transcribe_voice_notes.py --watch

It scans a folder for voice notes, transcribes each one, appends the text to
voice_transcripts.txt, and remembers what it already did in a JSON state file
so re-runs only handle NEW files.
"""

import argparse
import datetime
import glob
import json
import os
import subprocess
import sys


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TRANSCRIPTS_FILE = "voice_transcripts.txt"
STATE_FILE = ".voice_transcriber_state.json"

# Filename patterns we treat as voice notes.
#   Instagram saves voice clips as audioclip-*.ogg / audioclip-*.mp4
#   WhatsApp exports use .opus and "WhatsApp Ptt ..." / "WhatsApp Audio ..."
PATTERNS = [
    "audioclip-*.ogg",
    "audioclip-*.mp4",
    "*.opus",
    "WhatsApp Ptt *",
    "WhatsApp Audio *",
]


# ---------------------------------------------------------------------------
# Dependency bootstrap
# ---------------------------------------------------------------------------
def ensure_faster_whisper():
    """Import faster-whisper, pip-installing it on first run if missing."""
    try:
        from faster_whisper import WhisperModel  # noqa: F401
        return
    except ImportError:
        pass

    print("[setup] faster-whisper not found. Installing it now (one-time)...")
    print("[setup] This downloads a few packages; please be patient.\n")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--upgrade", "pip"]
        )
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "faster-whisper"]
        )
    except subprocess.CalledProcessError as exc:
        print(
            "\n[error] Could not auto-install faster-whisper.\n"
            "        Try manually:  py -m pip install faster-whisper\n"
            f"        ({exc})"
        )
        sys.exit(1)

    # Verify the install worked.
    try:
        from faster_whisper import WhisperModel  # noqa: F401
        print("[setup] faster-whisper installed successfully.\n")
    except ImportError:
        print("[error] faster-whisper still not importable after install.")
        sys.exit(1)


# ---------------------------------------------------------------------------
# State (which files are already done)
# ---------------------------------------------------------------------------
def load_state(folder):
    path = os.path.join(folder, STATE_FILE)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return set(data.get("done", []))
        except (json.JSONDecodeError, OSError):
            print("[warn] State file unreadable; starting fresh.")
    return set()


def save_state(folder, done):
    path = os.path.join(folder, STATE_FILE)
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"done": sorted(done)}, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        print(f"[warn] Could not write state file: {exc}")


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------
def find_voice_notes(folder):
    """Return a sorted, de-duplicated list of voice-note paths in folder."""
    found = set()
    for pattern in PATTERNS:
        for path in glob.glob(os.path.join(folder, pattern)):
            if os.path.isfile(path):
                found.add(os.path.abspath(path))
    return sorted(found)


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------
def fmt_duration(seconds):
    if seconds is None:
        return "?"
    seconds = int(round(seconds))
    return f"{seconds // 60:d}:{seconds % 60:02d}"


def transcribe_file(model, path, lang):
    """Transcribe one file. Returns (text, language, duration_seconds)."""
    segments, info = model.transcribe(
        path,
        beam_size=1,
        vad_filter=True,
        language=lang,  # None => auto-detect
    )
    # segments is a generator; consume it to build the full text.
    text = "".join(seg.text for seg in segments).strip()
    language = getattr(info, "language", None) or (lang or "?")
    duration = getattr(info, "duration", None)
    return text, language, duration


def append_transcript(folder, filename, duration, language, text):
    path = os.path.join(folder, TRANSCRIPTS_FILE)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    block = (
        "=" * 70 + "\n"
        f"File:     {filename}\n"
        f"When:     {stamp}\n"
        f"Duration: {fmt_duration(duration)}\n"
        f"Language: {language}\n"
        "-" * 70 + "\n"
        f"{text if text else '(no speech detected)'}\n\n"
    )
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(block)


def process_once(model, folder, lang, done):
    """Transcribe all new files. Returns number of files processed."""
    notes = find_voice_notes(folder)
    new_notes = [p for p in notes if p not in done]

    if not new_notes:
        return 0

    print(f"[scan] Found {len(new_notes)} new voice note(s) to transcribe.\n")
    count = 0
    for path in new_notes:
        name = os.path.basename(path)
        print(f"[work] Transcribing: {name} ...")
        try:
            text, language, duration = transcribe_file(model, path, lang)
        except Exception as exc:  # keep going on a single bad file
            print(f"[error] Failed on {name}: {exc}")
            continue

        append_transcript(folder, name, duration, language, text)
        done.add(path)
        save_state(folder, done)
        count += 1
        preview = (text[:80] + "...") if len(text) > 80 else text
        print(f"       [{language}, {fmt_duration(duration)}] {preview}\n")

    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Transcribe Instagram + WhatsApp voice notes locally "
                    "(Arabic + English) with faster-whisper.",
    )
    parser.add_argument(
        "--folder",
        default=None,
        help="Folder to scan (default: the folder this script lives in).",
    )
    parser.add_argument(
        "--model",
        default="small",
        help="Whisper model size: tiny, base, small, medium, large-v3 "
             "(default: small).",
    )
    parser.add_argument(
        "--lang",
        default=None,
        help="Force a language code (e.g. ar, en). Default: auto-detect.",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Keep running and transcribe new files as they appear.",
    )
    args = parser.parse_args()

    # Default folder = the script's own folder.
    folder = args.folder or os.path.dirname(os.path.abspath(__file__))
    folder = os.path.abspath(folder)
    if not os.path.isdir(folder):
        print(f"[error] Folder does not exist: {folder}")
        sys.exit(1)

    print("=" * 70)
    print(" Local Voice Note Transcriber (Arabic + English, 100% offline)")
    print("=" * 70)
    print(f" Folder: {folder}")
    print(f" Model:  {args.model} (CPU, int8)")
    print(f" Lang:   {args.lang or 'auto-detect'}")
    print(f" Output: {TRANSCRIPTS_FILE}")
    print("=" * 70 + "\n")

    ensure_faster_whisper()
    from faster_whisper import WhisperModel

    print(f"[load] Loading model '{args.model}' (first time downloads it)...")
    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
    except Exception as exc:
        print(f"[error] Could not load model '{args.model}': {exc}")
        sys.exit(1)
    print("[load] Model ready.\n")

    done = load_state(folder)

    if args.watch:
        import time
        print("[watch] Watching for new voice notes. Press Ctrl+C to stop.\n")
        try:
            while True:
                n = process_once(model, folder, args.lang, done)
                if n:
                    print(f"[watch] Done {n} file(s). Still watching...\n")
                time.sleep(5)
        except KeyboardInterrupt:
            print("\n[watch] Stopped.")
    else:
        n = process_once(model, folder, args.lang, done)
        if n == 0:
            print("[done] No new voice notes. Everything is already "
                  "transcribed.")
        else:
            print(f"[done] Transcribed {n} file(s). "
                  f"See {TRANSCRIPTS_FILE}.")


if __name__ == "__main__":
    main()
