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
| `data/plans/<month>.json` | A month's weeks (themes, sub-targets, challenges, day items) and one week of daily cards. |
| `data/current.json` | Which plan the page currently shows. |
| `src/page.html` | The page template. Data is injected at build. |
| `build.py` | Builds `dist/artifact.html`, `site/index.html`, `docs/plans/<month>.md`. |
| `site/index.html` | Standalone page for Vercel or any static host (built, committed). |
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

No dependencies beyond Python 3.

## Deploy to Vercel

The repo is a zero-build static site: `vercel.json` points Vercel at `site/`.

Option A, dashboard: import this GitHub repo at vercel.com/new. Framework "Other", leave build command empty, output directory `site`. Every push to `main` redeploys.

Option B, CLI: `npx vercel --prod` from the repo root.

To mount it inside an existing Vercel site instead of as its own project, copy `site/index.html` to that project's `public/teddy/index.html` (or equivalent) and it will serve at `/teddy`.

## Regenerating a month or week

1. Read `docs/architecture.md`, especially the block's weekly themes, the day roles, and the load rule.
2. Write `data/plans/<month>.json` with the same shape as `data/plans/2026-09.json`: `weeks[]` for the month view and `cards` for the current week's daily cards.
3. Point `data/current.json` at it and run `python3 build.py`.
4. Commit. Republish `dist/artifact.html` to the claude.ai artifact and push for Vercel.
5. Append anything that changed direction to `docs/decisions.md`.

## Recording results

Test battery (10 tests plus height): baseline Sep 15 to 17, retests Dec 7 to 11, Mar 1 to 5, Jun 14 to 18, Aug 9 to 13. Record results in `data/results.json` (create on first use) as `{ "2026-09": { "sprint20m": 4.9, ... } }` and they can be charted on the Year view.
