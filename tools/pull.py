#!/usr/bin/env python3
"""Pull the coach's diary and the test results into the repo.

Both live in Neon so they follow Jeff between devices, but this repo is the
memory of the project: nothing influences a plan until it is here. Run this
before generating a new week or month.

Usage
  DIARY_PASSPHRASE=... DIARY_URL=https://<site> python3 tools/pull.py
  python3 tools/pull.py https://<site>          # passphrase still from env

Writes data/diary.json and data/results.json.
"""
import json, os, pathlib, sys, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIARY_OUT = ROOT / "data/diary.json"
RESULTS_OUT = ROOT / "data/results.json"


def fetch(base, endpoint, passphrase):
    req = urllib.request.Request(f"{base}/api/{endpoint}", headers={"x-diary-key": passphrase})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        sys.exit(f"{e.code} from /api/{endpoint}: {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"Could not reach {base}: {e.reason}")


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

    entries = fetch(base, "diary", passphrase).get("entries", [])
    DIARY_OUT.write_text(json.dumps(entries, indent=2, ensure_ascii=False, default=str) + "\n")
    print(f"pulled {len(entries)} diary entries into {DIARY_OUT.relative_to(ROOT)}")
    if entries:
        print(f"  range: {entries[0].get('session_date')} to {entries[-1].get('session_date')}")

    # Results are keyed by test window so they chart directly:
    # {"2026-09": {"t1": "5.2", "h": "128"}, ...}
    rows = fetch(base, "results", passphrase).get("results", [])
    by_window = {}
    for row in rows:
        by_window.setdefault(str(row.get("test_window")), {})[str(row.get("test_id"))] = row.get("value")
    RESULTS_OUT.write_text(json.dumps(dict(sorted(by_window.items())), indent=2,
                                      ensure_ascii=False, default=str) + "\n")
    print(f"pulled {len(rows)} test results into {RESULTS_OUT.relative_to(ROOT)}")
    for window in sorted(by_window):
        print(f"  {window}: {len(by_window[window])} of 15 recorded")

    flagged = [e for e in entries if e.get("flag_pain")]
    if flagged:
        print(f"PAIN FLAGGED on {len(flagged)} session(s): " +
              ", ".join(str(e.get("session_date")) for e in flagged))
        print("Check the growth-load protocol in docs/architecture.md before writing the next plan.")


if __name__ == "__main__":
    main()
