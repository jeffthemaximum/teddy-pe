# Teddy's Training Year

A year-long physical education and athletic development program for a 7 year old, Sep 2026 through Aug 2027. Built for a future champion, most likely in tennis, possibly basketball or soccer goalkeeping, and built the way champions are actually made: a wide athletic base, thousands of technical touches, protected intensity, and a mind trained alongside the body. Nine areas, six ranks, one cartwheel.

Live page: https://claude.ai/code/artifact/a755f23c-b6e8-41dd-b5d4-16bb2a9730e6 (mirrored on Vercel from `site/`).

## What is here

| Path | What |
|---|---|
| `docs/architecture.md` | The program. Areas, blocks, ranks, patches, test battery, ball gates, load rules, weekly and daily templates. Change this first. |
| `docs/context.md` | Who this is for and how it runs. Read this before anything else if you are new. |
| `docs/decisions.md` | Decision log: pushbacks, choices, open items. Append, never rewrite. |
| `docs/status.md` | What is built, which branch is which, what is open, what comes next. Read second. |
| `docs/history/` | Session records: what was asked, what was answered, in order. One file per working session. |
| `docs/original-plan.md` | Jeff's original notes and resource links, and what changed from them. |
| `docs/plans/<month>.md` | Markdown export of each generated month and its daily cards (built). |
| `data/program.json` | The year: blocks, areas, cells, patches, gates, battery, day roles. |
| `data/drills.json` | The drill registry: one entry per named drill, with how to do it, what to watch for, a cue, and an optional video link. Linked into cards at build time and rated by the diary. |
| `data/diary.json` | Coach's diary entries pulled out of the database (created by `tools/pull.py`). |
| `data/results.json` | Test battery results pulled out of the database, keyed by test window. |
| `data/plans/<month>.json` | A month's weeks (themes, sub-targets, challenges, day items) and one week of daily cards. |
| `data/current.json` | Which plan the page currently shows. |
| `src/page.html` | The page template. Data is injected at build. |
| `build.py` | Builds `dist/artifact.html`, `site/index.html`, `docs/plans/<month>.md`. |
| `site/index.html` | Standalone page for Vercel or any static host (built, committed). |
| `api/page.js` | Serves the site, but only to a signed-in visitor. The page is not a static file, which is what makes the gate real. |
| `api/login.js` | Exchanges the passphrase for a signed session cookie. |
| `api/_auth.js` | Shared passphrase and cookie checking. |
| `api/diary.js` | Reads and writes coach's diary entries. |
| `api/results.js` | Reads and writes test battery results. |
| `public/` | The only publicly served directory. Deliberately holds nothing but `robots.txt`. |
| `tools/pull.py` | Pulls diary entries and test results into `data/`, so the repo stays the memory. |
| `tools/test_api.mjs` | Tests for the APIs' validation and the passphrase gate. |
| `dist/artifact.html` | Fragment for the claude.ai Artifact tool (built, committed). |

## Resuming on any computer

```
git clone git@github.com:jeffthemaximum/teddy-pe.git
cd teddy-pe
python3 build.py          # regenerates dist/, site/, docs/plans/ from data/
open site/index.html      # the page, offline
```

Then read `docs/context.md`, `docs/status.md`, `docs/architecture.md`, and the latest file in `docs/history/`. That is the complete state of the project; nothing needed to continue lives outside this repo. With an AI session: open the folder (Claude Code reads `CLAUDE.md` automatically; in Cowork, connect the folder) and it has the same context. The claude.ai Project and memory hold copies for convenience; this repo wins on any disagreement.

Working convention: changes go on a branch (`feature/...`), Jeff reviews the diff, merges to `main`, then the page is rebuilt and republished.

## Build

```
python3 build.py            # builds the plan in data/current.json
python3 build.py 2026-10    # builds a specific month
```

The build needs nothing beyond Python 3. It also reports any daily-card block where no drill matched the glossary, which is the list of glossary gaps to fill.

The one npm dependency in `package.json` is for the diary API only; Vercel installs it when it builds the function. The page itself stays dependency-free and works offline.

```
node tools/test_api.mjs    # diary API validation and auth tests
```

## Deploy to Vercel

The site is private: everything is behind one passphrase, including the program itself.

That is why `vercel.json` points the output directory at `public/`, which contains only `robots.txt`, rather than at `site/`. Vercel gives the filesystem precedence over rewrites, so a static `index.html` in the served directory would be handed to anyone who asked, straight past the passphrase check. Instead `/` is rewritten to `api/page.js`, which reads `site/index.html` and returns it only to a signed-in visitor. Do not move the built page back into the served directory; that would quietly unlock the whole site.

Set two environment variables in the Vercel project:

| Variable | What |
|---|---|
| `DIARY_PASSPHRASE` | The one passphrase. Gates the page and the diary API. Pick a real one; it is the only thing standing in front of the site. |
| `DATABASE_URL` | Neon Postgres connection string. |

Option A, dashboard: import this GitHub repo at vercel.com/new. Framework "Other", leave the build command empty, output directory `public`. Add both variables, then deploy. Every push to `main` redeploys. If the output directory was set in the dashboard previously, `vercel.json` overrides it.

Option B, CLI: `npx vercel --prod` from the repo root.

Signing in sets an HttpOnly, SameSite=Lax cookie that lasts 90 days, so it is one passphrase entry per device. `/api/login?logout=1` clears it. With no `DIARY_PASSPHRASE` set the site returns a "not configured" page and stays closed rather than falling open.

What this does not cover: `dist/artifact.html` published to claude.ai is a separate copy with no gate and no API access. If the program content should be private too, stop publishing the artifact. The diary there shows a message explaining it needs the Vercel site.

## Regenerating a month or week

0. Pull the diary and the test results (`tools/pull.py`) and read what has been recorded since the last plan.
1. Read `docs/architecture.md`, especially the block's weekly themes, the day roles, and the load rule.
2. Write `data/plans/<month>.json` with the same shape as `data/plans/2026-09.json`: `weeks[]` for the month view and `cards` for the current week's daily cards.
3. Add `data/drills.json` entries for any drill the new block introduces; the build prints the blocks where nothing matched.
4. Point `data/current.json` at it and run `python3 build.py`.
5. Commit. Republish `dist/artifact.html` to the claude.ai artifact and push for Vercel.
6. Append anything that changed direction to `docs/decisions.md`.

## Coach's diary

One entry per session date, and one only. The id is derived from the date on the server, so the entry written on a laptop is the same row a phone opens and edits. Sign in on any device and the day's entry is there.

The database is the only record. Nothing is written to the device, which has one consequence worth knowing: **saving with no connection fails and nothing is stored.** The text stays in the form so you can press Save again, and unsaved edits survive switching between sessions while the page is open, but closing the tab loses them. If a field with no signal turns out to be a real problem, the fix is to put the offline queue back.

The table is created on the first request, so there is no migration step. Entries that were previously keyed per device are collapsed to one row per date automatically, newest wins.

To bring entries into the repo before planning:

```
DIARY_PASSPHRASE=... python3 tools/pull.py https://<your-site>
```

Entries produce proposed plan changes, never automatic ones. See the diary section of `docs/architecture.md` for the rules.

## Recording results

Test battery, 15 rows across five windows: baseline Sep 15 to 17, then Dec 7 to 11, Mar 1 to 5, Jun 14 to 18, Aug 9 to 13.

Type the numbers into the test sheet on the **This Week** tab. Pick the window you are recording, and each number saves to the database as you leave the box, so it is on every device and cannot be lost with a browser. Clearing a box deletes that result. There is no local copy: these are the year's comparison points and most of them cannot be measured a second time.

The **Progress** panel on the Year tab draws from the same data: one card per test with the latest number, the change since baseline, and a sparkline across the windows recorded so far. Each test in `data/program.json` carries a direction, so a faster sprint and a longer jump both read as progress and a shorter dead hang reads as a regression. Height is treated separately and shows a cm/year pace, flagging the growth-load protocol from `docs/architecture.md` when growth runs fast.

`tools/pull.py` writes them into `data/results.json` as `{ "2026-09": { "t1": "5.2", "h": "128" }, ... }`, keyed by the test ids in `program.json`.
