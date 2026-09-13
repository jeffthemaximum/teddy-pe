#!/usr/bin/env python3
"""Pull coach's diary entries into the repo.

The diary lives in Neon so it syncs across devices, but this repo is the memory
of the project: entries only influence a plan once they are here. Run this before
generating a new week or month.

Usage
  DIARY_PASSPHRASE=... DIARY_URL=https://<site> python3 tools/diary_pull.py
  python3 tools/diary_pull.py https://<site>          # passphrase still from env

Writes data/diary.json.
"""
import json, os, pathlib, sys, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data/diary.json"


def main():
    passphrase = os.environ.get("DIARY_PASSPHRASE")
    if not passphrase:
        sys.exit("Set DIARY_PASSPHRASE (the same value as the Vercel env var).")

    base = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DIARY_URL", "")).rstrip("/")
    if not base:
        current = json.loads((ROOT / "data/current.json").read_text())
        base = str(current.get("siteUrl", "")).rstrip("/")
    if not base:
        sys.exit("Give the site URL as an argument, or set DIARY_URL, or add siteUrl to data/current.json.")

    req = urllib.request.Request(f"{base}/api/diary", headers={"x-diary-key": passphrase})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        sys.exit(f"{e.code} from the diary API: {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"Could not reach {base}: {e.reason}")

    entries = payload.get("entries", [])
    OUT.write_text(json.dumps(entries, indent=2, ensure_ascii=False, default=str) + "\n")

    flagged = [e for e in entries if e.get("flag_pain")]
    print(f"pulled {len(entries)} entries into {OUT.relative_to(ROOT)}")
    if entries:
        print(f"range: {entries[0].get('session_date')} to {entries[-1].get('session_date')}")
    if flagged:
        print(f"PAIN FLAGGED on {len(flagged)} session(s): " +
              ", ".join(str(e.get("session_date")) for e in flagged))
        print("Check the growth-load protocol in docs/architecture.md before writing the next plan.")


if __name__ == "__main__":
    main()
