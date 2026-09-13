# Working in this repo

This is Teddy's year-long PE and athletic development program. Jeff (Dad) is the coach. Teddy is 7, homeschooled, on green ball in tennis, and being prepared as a future champion: most likely tennis, possibly basketball or soccer goalkeeping. Plan for a champion the evidence-based way: wide base, high technical volume, protected intensity, mind trained on purpose.

Read in this order before changing anything: `docs/context.md`, `docs/status.md`, `docs/architecture.md`, `docs/decisions.md`, then the newest file in `docs/history/`.

This repo is the complete memory of the project. Any claude.ai Project doc or memory file about it is a cache; when they disagree, this repo is right and the cache gets updated from here.

## Rules of the program that code and plans must respect

- Day roles are fixed: Mon Floor (60 to 90, basketball handling), Tue Rings (75 to 90, soccer touch), Wed Fast (the only high-impact home day, soccer at speed), Thu Wall (tennis-heaviest, basketball skill), Fri Skate (low impact, keeper work), Sat Game Day (home off), Sun Court (30 to 45 min quick card with 15 min ball skills).
- High-intent effort budget: 40 per week for the home program, 20 in Trials weeks. Zero on Sun and Mon, at most 5 on Fri. Never two consecutive high-impact home days.
- Every week has one theme, 5 to 6 sub-targets including one tennis, one basketball and one soccer sub-target, and a Challenge of the Week attempted early and late in the week.
- Ball skills are counted in touches (200 dribbles, 300 touches, 40 passes), not minutes. Adding volume means adding touches, never adding sprints or jumps.
- Nine areas, nine patches per rank, 7 of 9 to rank up. Height is recorded at every test date.
- The cartwheel progression occupies the New Thing slot until it is owned.
- Tennis ball progression is gated on skill, never on date. Green is the default rally ball this year.
- Week 8 of every block is Trials at half volume, followed by a rank-up.
- Jeff's running participation is limited in fall 2026; do not write fall drills that need him to sprint.

## Generating plans

Plans are JSON in `data/plans/`. Match the shape of `data/plans/2026-09.json` exactly. Then `python3 build.py`. The page template in `src/page.html` reads `DATA` injected at build; do not hand-edit `site/` or `dist/`.

## Writing style

Direct, warm, specific. Cues in Teddy's language ("land like a cat"). Dad notes are one to three sentences of what to watch. No em dashes. Avoid "it's not X, it's Y" constructions.

## When something changes

Append to `docs/decisions.md` with the date. Update `docs/context.md` if the facts about Teddy, Jeff, places or gear changed. Update `docs/architecture.md` if the program itself changed. Update `docs/status.md` at the end of every working session, and add or extend a file in `docs/history/` recording what was asked and answered. Work on a branch; Jeff merges.
