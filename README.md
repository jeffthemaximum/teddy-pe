# Teddy's Training Year

A year-long physical education and athletic development program for a 7 year old, Sep 2026 through Aug 2027. General athleticism with a tennis tilt, aimed at a 20 year old who competes at the top rather than an 8 year old who looks precocious.

Live page: https://claude.ai/code/artifact/a755f23c-b6e8-41dd-b5d4-16bb2a9730e6 (mirrored on Vercel from `site/`).

## What is here

| Path | What |
|---|---|
| `docs/architecture.md` | The program. Areas, blocks, ranks, patches, test battery, ball gates, load rules, weekly and daily templates. Change this first. |
| `docs/context.md` | Who this is for and how it runs. Read this before anything else if you are new. |
| `docs/decisions.md` | Decision log: pushbacks, choices, open items. Append, never rewrite. |
| `docs/original-plan.md` | Jeff's original notes and resource links, and what changed from them. |
| `docs/plans/<month>.md` | Markdown export of each generated month and its daily cards (built). |
| `data/program.json` | The year: blocks, areas, cells, patches, gates, battery, day roles. |
| `data/plans/<month>.json` | A month's weeks (themes, sub-targets, challenges, day items) and one week of daily cards. |
| `data/current.json` | Which plan the page currently shows. |
| `src/page.html` | The page template. Data is injected at build. |
| `build.py` | Builds `dist/artifact.html`, `site/index.html`, `docs/plans/<month>.md`. |
| `site/index.html` | Standalone page for Vercel or any static host (built, committed). |
| `dist/artifact.html` | Fragment for the claude.ai Artifact tool (built, committed). |

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

Test battery: baseline Sep 15 to 17, retests Dec 7 to 11, Mar 1 to 5, Jun 14 to 18, Aug 9 to 13. Record results in `data/results.json` (create on first use) as `{ "2026-09": { "sprint20m": 4.9, ... } }` and they can be charted on the Year view.
