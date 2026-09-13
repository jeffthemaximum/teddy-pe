# Status

Update this file whenever something is built, decided, or left open. It is the first thing to read when resuming.

## Where things live

- **This repo is the source of truth.** GitHub: `jeffthemaximum/teddy-pe`. Clone it anywhere and everything needed to continue is here.
- **Live page (claude.ai):** https://claude.ai/code/artifact/a755f23c-b6e8-41dd-b5d4-16bb2a9730e6. Republished from `dist/artifact.html` after a merge to `main`.
- **Vercel mirror:** serves `site/index.html` (zero-build static; see README).
- **claude.ai Project "teddy pe":** holds a copy of the architecture and status for convenience. If it disagrees with this repo, the repo wins; update the Project copy from here.
- **claude.ai memory:** two short memory files about Teddy and this curriculum exist for Jeff's account. They are a cache of `docs/context.md`, nothing more.

## Built

- Year view: 9 areas x 6 blocks (Cub, Fox, Coyote, Wolf, Puma, Cheetah), timeline with retests and Trials weeks, Cub patches (7 of 9 to rank up), tennis ball gates (green now, controlled-yellow gate active), 10-test battery plus height.
- September view: Cub weeks 1 to 3 (Sep 14 to Oct 4): Baseline & Land, Stick It, Brake.
- This Week: daily cards for Sep 14 to 20 with the baseline test sheet (saves in the viewer's browser only).
- Drill glossary: `data/drills.json`, 84 entries covering everything written so far. `build.py` links names and aliases into card prose and block titles at build time; tapping one opens a sheet with how to do it, what to watch for and the cue. Fourth tab lists all of them with a filter. The markdown export carries a glossary appendix for the week.
- Coach's diary: form on This Week (session, how it went, energy, pain flag, note, challenge number, and a rating per drill from that day's card). Saves to the device, then syncs to Neon through `api/diary.js` behind a passphrase. `tools/diary_pull.py` pulls entries into `data/diary.json`. Entries produce proposed plan changes only.

## Branches

- `main`: first version (7 areas, tennis-tilted general athleticism).
- `feature/ball-sports-and-mindset`: merged (commit cedf5d5).
- `feature/drill-glossary-and-coach-diary`: the drill glossary and the coach's diary. Awaiting Jeff's review. After merge: rebuild, republish the artifact, and set the two Vercel env vars so the diary comes alive.

## Open

- **Jeff to do:** create the Neon database, set `DATABASE_URL` and `DIARY_PASSPHRASE` in Vercel, redeploy, then enter the passphrase once on each device. Until then the diary saves locally and says it is not configured.
- Baseline test numbers (Sep 15 to 17) to record in `data/results.json` and chart on the Year view.
- Teddy's exact birthday.
- One-hand vs two-hand backhand, to settle in the Fox block with his coach.
- Youth basketball size (27.5 in) and a mat for keeper dive progressions before the Fox block.
- Whether the November move changes any facility access (assumed: none).
- Whether to film Teddy for the glossary's clip field, which would double as a form record across the year.
- Pre-existing 20px horizontal overflow on the Year tab at phone width, from a timeline marker. Not caused by the glossary or diary work and left alone.

## Next

- October view (Cub weeks 4 to 8: Upside Down, Skip & Bound, Turn, Reactor, Cub Trials) and Week 2 daily cards. Pull the diary first, then write `data/plans/2026-10.json`, add glossary entries for the drills October introduces (wall handstand, A-skip, laces pass, med ball hip throw, inside hook turn, reaction starts, low bounds, pull-backs), point `data/current.json` at it, run `python3 build.py`.
