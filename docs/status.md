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
- This Week: daily cards for Sep 14 to 20, plus the test sheet (15 rows, five test windows, stored in Neon and shared across devices).
- Drill glossary: `data/drills.json`, 84 entries covering everything written so far. `build.py` links names and aliases into card prose and block titles at build time; tapping one opens a sheet with how to do it, what to watch for and the cue. Fourth tab lists all of them with a filter. The markdown export carries a glossary appendix for the week.
- Coach's diary: form on This Week (session, how it went, energy, pain flag, note, challenge number, and a rating per drill from that day's card). One entry per session date, stored only in Neon and keyed by date on the server, so every device opens and edits the same entry. No local storage, so saving needs a connection. `tools/pull.py` pulls entries and results into `data/`. Entries produce proposed plan changes only.
- Test results and the Progress panel: `api/results.js` stores one row per test window and test id; the sheet on This Week reads and writes it; the Year tab charts each test as a card with its latest value, change since baseline in the direction that counts as progress, and a sparkline. Height reports a cm/year pace and flags the growth-load protocol.
- Passphrase gate on the whole Vercel site: `api/page.js` serves the page only to a signed-in visitor, `api/login.js` exchanges the passphrase for a 90 day signed cookie, and `public/` (robots.txt only) is the sole publicly served directory.

## Branches

- **`main` now carries both systems.** Jeff merged the rewrite on 14 September as a squash, `c6a94d6`, PR #7, and GitHub deleted the branch behind it. The old pipeline is still there and still serving: `build.py`, `src/page.html`, `site/`, `dist/`, the four functions in `api/` and the root `vercel.json` are all untouched, so the Vercel project that has always served Teddy's page keeps serving it. The rewrite sits beside it in `backend/`, `core/` and `web/`. Nothing is removed until Phase 3 cuts over, which is the safer order: there is no window where the program is unavailable.
- `feature/ball-sports-and-mindset` and `feature/drill-glossary-and-coach-diary`: merged and stale. Tidying them is Jeff's call, not part of the rewrite.
- **The rewrite is Phase 1 and Phase 2 complete, on `main`.** Rails 8 API, the `core/` package, the React web app. The API lives in `backend/` and runs at `https://teddy-pe-api.fly.dev`. The Phase 1 whole-branch review is at `.superpowers/sdd/2026-09-13-phase-1-rails-api/final-review.md` and Jeff's ten fixes off it are in. Phase 3 (migration and cutover) and Phase 4 (React Native) are not started.

## The rewrite

Read `docs/rewrite-prompt.md` for the settled design, `docs/superpowers/specs/2026-09-13-rewrite-design.md` for the spec derived from the real data, and `docs/superpowers/plans/2026-09-13-phase-1-rails-api.md` for the Phase 1 implementation plan (16 tasks, 114 steps, test-first).

Four phases, each with a hard review gate Jeff approves before the next begins:

1. Rails API. Schema, seeds from YAML, auth, every endpoint, Pundit, specs green, deployed to Fly.
2. `core/` and the React web app, including the offline queue.
3. Migration and cutover. Only then is the old pipeline deleted.
4. React Native app on the same ducks.

If the program itself needs changing while the rewrite is in flight (a new month, a fix to a day card), do it on `main` in the old format. It gets ported into `backend/content/` during Phase 3. Do not try to keep the two in sync continuously.

## Open

- **Jeff to do:** set the Vercel project's output directory to `public` (or let `vercel.json` do it), confirm `DATABASE_URL` and `DIARY_PASSPHRASE` are set, and redeploy. The site then asks for the passphrase before showing anything.
- Whether to keep publishing `dist/artifact.html` to claude.ai, which is ungated and now shows a diary that cannot save.
- Whether the missing offline queue matters in practice at a field with no signal.
- One-hand vs two-hand backhand, to settle in the Fox block with his coach.
- Youth basketball size (27.5 in) and a mat for keeper dive progressions before the Fox block.
- Whether the November move changes any facility access (assumed: none).
- Whether to film Teddy for the glossary's clip field, which would double as a form record across the year.
- Pre-existing 20px horizontal overflow on the Year tab at phone width, from a timeline marker. Not caused by the glossary or diary work and left alone.

## Next

- **Sep 15 to 17: record the baseline.** Open This Week, pick Baseline in the test sheet, type the numbers. They save to the database as you go and the Year tab starts charting immediately. This happens on the current site, off `main`. The rewrite does not touch it, and Phase 3 migrates these rows across with a count and a spot check before anything is dropped.

- **Phase 2a is built: `core/`, the package both apps import.** Ten ducks, 176 tests, on the same branch. It holds every piece of state logic the web app and the native app share, so neither writes its own. Its whole-branch review found three Criticals, all fixed: every journal save would have returned 400 for a missing `program_year_id`, the journal stored the API's envelope instead of the entry, and a write queued offline by Teddy would have replayed under Jeff's token on the shared iPad and was readable by him while it waited. See `docs/decisions.md` for the four rulings and `docs/history/2026-09-14-core-package.md` for the account.

- **Phase 2b is built: the web app's read screens.** Signing in, the shell, the Year, the month, This Week and the drill glossary. 130 tests. Its whole-app review found two Criticals, both closed: program vocabulary was shipping in the JavaScript, and the test meant to catch that could be walked past five ways including a file it never read. See `docs/history/2026-09-14-web-app.md`.

  Two things it cannot do yet. **It has no CSS**, so every screen is unstyled markup, and that is a requirement rather than polish because Teddy is 7 and This Week is his screen. And **nothing proves the deployed site refuses a stranger**: the bundle test proves the JavaScript carries nothing about him, which is a different claim from how the running site behaves.

- **Phase 2c is built, six of seven tasks.** Both journals, the test sheet, the cross-year charts, the soft delete Jeff asked for and the styling. `docs/superpowers/plans/2026-09-14-phase-2c-writing-screens.md`. The suites stand at `backend/` 249, `core/` 257, `web/` 250.

- **Task 7, the deploy, is the last thing in Phase 2 and it is in Jeff's hands.** A second Vercel project builds `web/` with its root directory set there, separate from the project that serves the old page. Its first build failed on 72 TypeScript errors with one cause: Vercel installs only `web/`'s own dependencies, `core/` arrives as `file:../core`, which links source without installing anything, and both TypeScript and Vite resolve an import from the real path of the file that wrote it, so `core/src/` looks in `core/node_modules` and never in `web/node_modules`. It had never shown up locally because `core/node_modules` is there for core's own Jest suite. A `prebuild` hook installs them when they are missing, on `fix/vercel-core-deps`. Once that is merged and the build is green, two things remain: `WEB_ORIGIN` on the Fly app so CORS admits the site, and the check the brief asks for, which is opening the deployed site signed out and recording what a stranger actually sees.

- **The soft delete is built, server and client together.** Owed since the night of 13 September. `deleted_at` on both journal tables, a `kept` scope per model that every read path goes through, `DELETE /api/v1/athlete_entries/:id` and the coach equivalent with a policy that permits only the owner, a `deleteEntry` action on the journal duck that queues offline, and a two-step delete on both journal screens. The export's prune is reachable for the first time: Teddy deletes an entry and the next export drops it from `docs/`. See `docs/decisions.md` for the eight rulings and `docs/history/2026-09-14-phase-2c-soft-delete.md` for the account.

- **The delete a share tap could undo is closed.** Deleting an entry offline and then tapping share used to hand that day to Dad: the save queued under the delete's own key and replaced it, and the replay upserted the still-kept row back to `shared: true` with the words blanked. The outbox's collapse rule is now asymmetric (a delete may replace a save, a save queues behind a delete), the share toggle and Save are gone from a day whose last queued write is a delete, and that day says so in two lines. Two things beside it: `AthleteJournal` reads `selectIsEntryQueued` instead of guessing, so a permanently rejected save no longer tells Teddy his words are safe on the device; and the save's `shared` field is asserted for the first time, from three fixtures that disagree. See `docs/history/2026-09-14-phase-2c-delete-then-share.md`.

- **The Phase 1 gate is passed and merged.** Two things Jeff looked at there are still open and are still his: the `hie` numbers on the 21 September day cards, which satisfy every rule in `CLAUDE.md` but were chosen by Claude and are corrections rather than approvals; and the Rails 8.1 upgrade, which needs a `bundle update` and a deploy and is due before 2026-11-07. `spec/rails_version_spec.rb` fails on that date if it has not happened.

- October view (Cub weeks 4 to 8: Upside Down, Skip & Bound, Turn, Reactor, Cub Trials) and Week 2 daily cards. Pull the diary first, then write `data/plans/2026-10.json`, add glossary entries for the drills October introduces (wall handstand, A-skip, laces pass, med ball hip throw, inside hook turn, reaction starts, low bounds, pull-backs), point `data/current.json` at it, run `python3 build.py`.
