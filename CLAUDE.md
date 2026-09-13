# Working in this repo

This is Teddy's year-long PE and athletic development program. Jeff (Dad) is the coach. Teddy is 7, homeschooled, on green ball in tennis, aiming to compete at the highest level at 20.

Read in this order before changing anything: `docs/context.md`, `docs/architecture.md`, `docs/decisions.md`.

## Rules of the program that code and plans must respect

- Day roles are fixed: Mon Floor, Tue Rings, Wed Fast (the only high-impact home day), Thu Wall (tennis-heaviest), Fri Skate (low impact), Sat Game Day (home off), Sun Court (20 to 30 min quick card).
- High-intent effort budget: 40 per week for the home program, 20 in Trials weeks. Zero on Sun and Mon, at most 5 on Fri. Never two consecutive high-impact home days.
- Every week has one theme, 3 to 4 sub-targets including one tennis sub-target, and a Challenge of the Week attempted early and late in the week.
- The cartwheel progression occupies the New Thing slot until it is owned.
- Tennis ball progression is gated on skill, never on date. Green is the default rally ball this year.
- Week 8 of every block is Trials at half volume, followed by a rank-up.
- Jeff's running participation is limited in fall 2026; do not write fall drills that need him to sprint.

## Generating plans

Plans are JSON in `data/plans/`. Match the shape of `data/plans/2026-09.json` exactly. Then `python3 build.py`. The page template in `src/page.html` reads `DATA` injected at build; do not hand-edit `site/` or `dist/`.

## Writing style

Direct, warm, specific. Cues in Teddy's language ("land like a cat"). Dad notes are one to three sentences of what to watch. No em dashes. Avoid "it's not X, it's Y" constructions.

## When something changes

Append to `docs/decisions.md` with the date. Update `docs/context.md` if the facts about Teddy, Jeff, places or gear changed. Update `docs/architecture.md` if the program itself changed.
