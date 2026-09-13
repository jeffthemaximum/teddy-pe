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

## Branches

- `main`: first version (7 areas, tennis-tilted general athleticism).
- `feature/ball-sports-and-mindset`: adds Basketball, Soccer (with Keeper), Compete & Mindset, height and two battery tests, more technical volume, regenerated September and Week 1. Awaiting Jeff's review. After merge: rebuild and republish the artifact.

## Open

- Baseline test numbers (Sep 15 to 17) to record in `data/results.json` and chart on the Year view.
- Teddy's exact birthday.
- One-hand vs two-hand backhand, to settle in the Fox block with his coach.
- Youth basketball size (27.5 in) and a mat for keeper dive progressions before the Fox block.
- Whether the November move changes any facility access (assumed: none).

## Next

- October view (Cub weeks 4 to 8: Upside Down, Skip & Bound, Turn, Reactor, Cub Trials) and Week 2 daily cards. Write `data/plans/2026-10.json`, point `data/current.json` at it, run `python3 build.py`.
