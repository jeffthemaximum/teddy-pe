# Status

Update this file whenever something is built, decided, or left open. It is the first thing to read when resuming.

## Where things live

- **This repo is the source of truth.** GitHub: `jeffthemaximum/teddy-pe`. Clone it anywhere and everything needed to continue is here.
- **Live site:** https://teddy-pe-mlfs.vercel.app, the React app in `web/`, built from `main`. Behind a sign-in; there is no public page.
- **API:** https://teddy-pe-api.fly.dev, the Rails app in `backend/`. Postgres on Fly holds the program, both journals and the test results.
- **The old pipeline is gone.** `build.py`, `src/page.html`, `site/`, `dist/`, the five functions in `api/`, `public/`, the root `vercel.json`, `tools/` and `data/` were deleted on 14 September once the migration verified clean. There is no static mirror and no passphrase gate any more. Publishing `dist/artifact.html` to claude.ai has stopped, per decision 9 of `docs/rewrite-prompt.md`: the artifact was ungated and the program should not sit in the open.
- **claude.ai Project "teddy pe":** holds a copy of the architecture and status for convenience. If it disagrees with this repo, the repo wins; update the Project copy from here.
- **claude.ai memory:** two short memory files about Teddy and this curriculum exist for Jeff's account. They are a cache of `docs/context.md`, nothing more.

## Built

- Year view: 9 areas x 6 blocks (Cub, Fox, Coyote, Wolf, Puma, Cheetah), timeline with retests and Trials weeks, Cub patches (7 of 9 to rank up), tennis ball gates (green now, controlled-yellow gate active), 10-test battery plus height.
- September view: Cub weeks 1 to 3 (Sep 14 to Oct 4): Baseline & Land, Stick It, Brake. All 21 days are full cards, 139 day blocks, a dad note on every one. Weeks 2 and 3 were summary-line sketches until 21 September; see `docs/history/2026-09-21-weeks-2-and-3-cards.md`.
- This Week: daily cards for Sep 14 to Oct 4, plus the test sheet (15 rows, five test windows, stored in Neon and shared across devices).
- Drill glossary: `backend/content/program_years/2026-27/drills.yml`, 85 entries covering everything written so far. The seeder links names and aliases into card prose and block titles; tapping one opens a sheet with how to do it, what to watch for and the cue. A tab lists all of them with a filter.
- Coach's diary: form on This Week (session, how it went, energy, pain flag, note, challenge number, and a rating per drill from that day's card). One entry per session date, keyed on the server, so every device opens and edits the same entry. Saves go through the offline queue in `core/`. `bin/rails docs:export` writes entries and results back into `docs/`. Entries produce proposed plan changes only.
- Teddy's own journal, with a share toggle per day. Unshared entries stay out of the API's responses and out of the export. Both journals soft delete.
- Test results and the Progress panel: one row per test window and test id; the sheet on This Week reads and writes it; the Year tab charts each test as a card with its latest value, change since baseline in the direction that counts as progress, and a sparkline. Height reports a cm/year pace and flags the growth-load protocol.
- Sign-in on the whole site, three accounts, Pundit deciding what each may see. The web bundle ships no program vocabulary at all, and a test in `web/` builds the app for real and reads the built output to prove it.
- Today: the app's home, `/today`, first in the nav and where sign-in, `/` and a refused route all land. One screen holding the day's card (role, minutes, theme, dad note, an accordion of blocks with one open at a time), the signed-in person's own journal entry (autosaving as he writes, Save staying as the retry for a write the offline queue gave up on), and the test sheet when today falls inside a test window. Delete is not on Today; it stays on the tab screens. Each of the three accounts sees only what the API answers for them. The suites stand at `backend/` 320, `core/` 272, `web/` 340, all clean and typechecking clean. See `docs/decisions.md` and `docs/history/2026-09-14-today-view.md`.

## Branches

- **`main` carried both systems from 14 September until the cutover.** Jeff merged the rewrite that morning as a squash, `c6a94d6`, PR #7, and GitHub deleted the branch behind it. Keeping the old pipeline serving beside the new one was the safer order: there was no window where the program was unavailable. `feature/phase-3-cutover` removes it, and the repo is now just `backend/`, `core/`, `web/` and `docs/`.
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

- **Jeff to do, and this gates the merge:** repoint the old Vercel project at `web/` by hand before `feature/phase-3-cutover` lands. That branch deletes the root `vercel.json` and everything the old project builds, so merging it first would take the served page down.
- One-hand vs two-hand backhand, to settle in the Fox block with his coach.
- Youth basketball size (27.5 in) and a mat for keeper dive progressions before the Fox block.
- Whether the November move changes any facility access (assumed: none).
- Whether to film Teddy for the glossary's clip field, which would double as a form record across the year.
- Pre-existing 20px horizontal overflow on the Year tab at phone width, from a timeline marker. Not caused by the glossary or diary work and left alone.

## Next

- **Receive and return, three levels, is in the soccer strand and needs a
  deploy before Tuesday 29 September.** `feature/soccer-three-levels` adds the
  drill from the reel Jeff sent to the glossary, puts it on week 3's Tuesday and
  Wednesday soccer blocks, and writes it into the architecture's soccer section
  so October onward carries it. The level descriptions are Jeff's correction of
  Claude's first read.
  Backend at 320 examples, clean. Merge, then from `main`:
  `cd backend && fly deploy -a teddy-pe-api`. See
  `docs/history/2026-09-27-soccer-three-levels.md`.

- **Weeks 2 and 3 are written and need a deploy.** `feature/week-2-and-3-cards`
  fills in the 14 day cards for Sep 21 to Oct 4 that existed only as summary
  lines, which is why Today showed four bullets and no session on the morning of
  the 21st. Backend at 320 examples, clean. The cards reach Teddy's phone only on
  a deploy, because they ship inside the image and the release command seeds
  them:

  ```bash
  cd backend && fly deploy -a teddy-pe-api
  ```

  Run it from a checkout of `main` after merging. Two things to look at before
  merging: the Challenge of the Week for week 2 changed from Broad Jump & Stick
  to Statue Stick, because a maximal broad jump on a Monday breaks the zero-effort
  rule, and week 3's challenge now says "Run on green" rather than "Sprint on
  green" for the same reason. Both are in `docs/decisions.md` under 2026-09-21.

- **The production export has run and the baseline is in the repo.**
  `docs/results/2026-27.md` holds 14 of the 15 baseline rows and
  `docs/journal/2026-27/2026-09.md` holds Jeff's four session entries with their
  drill ratings, both from the Fly database on 21 September. The Fly machine has
  to be started before `fly ssh console` will answer it, which is what made the
  first three attempts fail silently.

- **Height was not recorded at the baseline.** Fourteen of fifteen rows are in;
  the height cell is empty. `CLAUDE.md` and the architecture both say height is
  recorded at every test date, and it is the anchor for the tall-frame growth
  protocol: without a first number, the cm/year pace has nothing to measure from
  and the Dec 7 to 11 retest becomes the baseline by default. Measure him shoes
  off against a wall and type it into the Baseline column on the Tests tab.

- **Test 8 is now a constrained wall rally, and its baseline is owed.** The 100 in
  the Baseline column was Teddy alone at the wall, unconstrained, and capped
  rather than reached, against a protocol that said cooperative rally with Dad.
  Test 8 now reads: green ball, behind a line 6m back, every ball above a line on
  the wall at net height, best of 3. **Thursday 24 September carries the
  re-measure** as an eight-minute test block on the card; the number replaces the
  100 in the Baseline column on the Tests tab. Weeks 2 and 3 keep their 15-ball
  and 15-to-20-ball rally sub-targets, which are rallies with Dad and measure
  something else. See `docs/decisions.md` for 21 September.

- **Today needs an API deploy before the test sheet appears on it.** The
  test windows' `starts_on` and `ends_on` reach production only when the
  seeder runs, and the seeder runs on a deploy:

  ```bash
  cd backend && fly deploy -a teddy-pe-api
  ```

  Run it from a checkout of `main` after merging. Until then Today shows the
  card and the note and no test section, which is what it is built to do
  when the server has not sent the dates.

- **Sep 15 to 17: record the baseline.** Open This Week, pick Baseline in the test sheet, type the numbers. They save as you go and the Year tab starts charting immediately. This now happens on the new site, https://teddy-pe-mlfs.vercel.app.

- **Phase 3 is done. The migration ran against production on 14 September and the old pipeline is deleted.** The survey found the legacy tables were not on the Rails connection at all, which is exactly the Critical the final review caught: without that fix `legacy:verify` would have printed "Safe to delete the old pipeline" against a database that never held the rows. `LEGACY_DATABASE_URL` then pointed at database `neondb` on the same Neon host and the survey found one diary entry and one test result, with nothing unmapped. Both migrated and `legacy:verify` read clean, field by field. That the whole year came to two rows was not known until the survey ran, which is why the survey exists and why it writes nothing.

  The deletion is `feature/phase-3-cutover`. The legacy tables `diary_entry` and `test_result` in `neondb` were left alone and stay as a backstop. See `docs/history/2026-09-14-phase-3-cutover.md`.

  The fix round that got it there: `backend/` stands at 305 examples. A whole-branch review returned "not safe to run against production data" and the seven findings are closed:

  - A legacy table that is not on the connection used to read as clean, so `legacy:verify` would have printed "Safe to delete the old pipeline" while nothing had been compared to anything. That is what an unset `LEGACY_DATABASE_URL` looks like, one step before the only copy is deleted. Every task now names the table and `legacy:verify` exits 1.
  - The journal migrator wrote over entries the new site already held, a `nil` over a note Jeff typed included, and over drill ratings. It now declines and reports which fields disagree, the way the result migrator already did.
  - The verifier looked entries up by date alone while the unique index is (user, program year, date), so a run with the wrong `COACH_EMAIL` left two complete sets and it picked one. `legacy:verify` now takes `COACH_EMAIL=` too.
  - The verifier compared no drill ratings at all, and `DIARY_FIELDS` and the migrator's carried list were two hand-written lists with nothing asserting they agree. Both closed.

  See `docs/decisions.md` for the rulings and `.superpowers/sdd/2026-09-14-phase-3-migration-and-cutover/` for the briefs and reports. The cutover runbook is Task 5 of `docs/superpowers/plans/2026-09-14-phase-3-migration-and-cutover.md`. Jeff merges, and not before the Vercel project is repointed at `web/`.

- **Phase 2a is built: `core/`, the package both apps import.** Ten ducks, 176 tests, on the same branch. It holds every piece of state logic the web app and the native app share, so neither writes its own. Its whole-branch review found three Criticals, all fixed: every journal save would have returned 400 for a missing `program_year_id`, the journal stored the API's envelope instead of the entry, and a write queued offline by Teddy would have replayed under Jeff's token on the shared iPad and was readable by him while it waited. See `docs/decisions.md` for the four rulings and `docs/history/2026-09-14-core-package.md` for the account.

- **Phase 2b is built: the web app's read screens.** Signing in, the shell, the Year, the month, This Week and the drill glossary. 130 tests. Its whole-app review found two Criticals, both closed: program vocabulary was shipping in the JavaScript, and the test meant to catch that could be walked past five ways including a file it never read. See `docs/history/2026-09-14-web-app.md`.

  Two things were open at the end of 2b and both are closed now. It had no CSS, which Task 6 of 2c fixed. And nothing proved the deployed site refuses a stranger, which the deploy check answered against the running site rather than against a local build.

- **Phase 2c is built, six of seven tasks.** Both journals, the test sheet, the cross-year charts, the soft delete Jeff asked for and the styling. `docs/superpowers/plans/2026-09-14-phase-2c-writing-screens.md`. The suites stand at `backend/` 252, `core/` 257, `web/` 264.

- **The web app is deployed at `https://teddy-pe-mlfs.vercel.app`**, built from `main`, pointed at `https://teddy-pe-api.fly.dev`. The signed-out check is done and recorded in `docs/decisions.md`: the served JavaScript, CSS and HTML carry nothing about Teddy or his program, the API URL is compiled in correctly, and the security headers arrive. Two things were wrong and one is still open. Deep links all answered 404 because `cleanUrls` disabled the single-page rewrite beside it, fixed on `fix/spa-deep-links`. **`WEB_ORIGIN` is still unset on the Fly app**, so CORS refuses the site and nobody can sign in until Jeff sets it:

  ```
  fly secrets set WEB_ORIGIN="https://teddy-pe-mlfs.vercel.app" -a teddy-pe-api
  ```

- **The soft delete is built, server and client together.** Owed since the night of 13 September. `deleted_at` on both journal tables, a `kept` scope per model that every read path goes through, `DELETE /api/v1/athlete_entries/:id` and the coach equivalent with a policy that permits only the owner, a `deleteEntry` action on the journal duck that queues offline, and a two-step delete on both journal screens. The export's prune is reachable for the first time: Teddy deletes an entry and the next export drops it from `docs/`. See `docs/decisions.md` for the eight rulings and `docs/history/2026-09-14-phase-2c-soft-delete.md` for the account.

- **The delete a share tap could undo is closed.** Deleting an entry offline and then tapping share used to hand that day to Dad: the save queued under the delete's own key and replaced it, and the replay upserted the still-kept row back to `shared: true` with the words blanked. The outbox's collapse rule is now asymmetric (a delete may replace a save, a save queues behind a delete), the share toggle and Save are gone from a day whose last queued write is a delete, and that day says so in two lines. Two things beside it: `AthleteJournal` reads `selectIsEntryQueued` instead of guessing, so a permanently rejected save no longer tells Teddy his words are safe on the device; and the save's `shared` field is asserted for the first time, from three fixtures that disagree. See `docs/history/2026-09-14-phase-2c-delete-then-share.md`.

- **The Phase 1 gate is passed and merged.** Two things Jeff looked at there are still open and are still his: the `hie` numbers on the 21 September day cards, which satisfy every rule in `CLAUDE.md` but were chosen by Claude and are corrections rather than approvals; and the Rails 8.1 upgrade, which needs a `bundle update` and a deploy and is due before 2026-11-07. `spec/rails_version_spec.rb` fails on that date if it has not happened.

- **The Notes page asks about the day rather than the glossary.** "Rate each drill" listed all 84 drills; it now lists the ones on that date's day card, in the order the card runs them. `CoachJournal` fetches the current week for it and reads `selectDayByDate`. A date outside this week, a week still loading and a week that could not be reached each say which they are instead of quietly handing him everything, and a drill he has already rated stays on screen even when the card has dropped it, because the save writes the whole ratings map either way. On `feature/notes-drills-by-day` for Jeff to merge. See `docs/history/2026-09-14-notes-drills-by-day.md`.

- **The password minimum is 6, down from 12.** Jeff's call, so that all three accounts could be reset to a 7 character password he chose. `backend/app/models/user.rb`, one number, with the reason written beside it. The rule had no test at all, which is why moving it looked free; `backend/spec/models/user_spec.rb` now asserts it from both sides. The login throttle (10 attempts in 3 minutes) is unchanged and is what actually holds a guessing run. On `feature/password-minimum-6`. **The reset itself is still owed and cannot run until this is deployed**, because a `rails runner` on Fly runs the deployed code: merge, `fly deploy -a teddy-pe-api`, then reset. Everyone signs out when it lands. See `docs/history/2026-09-14-password-minimum.md`.

- **The Notes page shows the Challenge of the Week, and asks for the right number.** The field's label read "Which challenge attempt this was" while the column holds the score: week 1 says "count the silent ones, Monday number, Friday number" and the export writes "Challenge number". Jeff confirmed it is the score, so the label moved too. The challenge is read off the week payload and shown only for a date inside the loaded week, since that payload only ever holds the current one. On `feature/notes-show-challenge`. See `docs/history/2026-09-14-notes-challenge.md`.

- **The jump rope test moved from Tuesday to Thursday 17 September**, because there was no rope in the house this week. Thursday keeps it inside the Sep 15-17 baseline window, which Friday would not have, and keeps it off Wednesday, which is the only high-impact home day and already carries four max-effort tests. It sits second on the card, after Wake Up, so it is measured fresh. `hie` is unchanged on both days and the week still spends 28 of 40. Merged as PR #22 and live since the v9 deploy at 15:50 EDT on 14 September, whose release command reported `pruned day_blocks: 1`. See `docs/history/2026-09-14-jump-rope-to-thursday.md`.

- **Deploying the API is manual, and the repo now says so.** The jump rope move was merged and then sat undeployed for two hours because `CLAUDE.md` and `README.md` both claimed a merge to `main` seeds production on its own. CI only scans, lints and tests. The deploy is `cd backend && fly deploy -a teddy-pe-api`, run from a checkout of `main`, because `fly deploy` uploads the current directory as the build context and the plan YAML ships inside the image. Both files are corrected and both now warn that a Vercel rebuild moves no program content. **Still open and Jeff's call: whether a merge to `main` should deploy the API by itself.** That points an Action at a production database holding Teddy's journal, which is why it was not just done. On `docs/deploy-is-manual`. See `docs/history/2026-09-14-deploy-gap.md`.

- October view (Cub weeks 4 to 8: Upside Down, Skip & Bound, Turn, Reactor, Cub Trials) and Week 2 daily cards. Export the journals first, then write `backend/content/program_years/2026-27/plans/2026-10.yml`, open every Tuesday soccer Touch block with receive and return at his current level per foot, add entries to `drills.yml` for the drills October introduces (wall handstand, A-skip, laces pass, med ball hip throw, inside hook turn, reaction starts, low bounds, pull-backs), and run `cd backend && bin/rails content:seed`.
