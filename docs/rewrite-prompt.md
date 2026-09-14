# Rewrite prompt: teddy-pe as a decoupled Rails API, React web app, and React Native app

Paste everything below the line into a fresh Claude Code session opened at `/Users/backupadmin/code/teddy-pe`.

---

Rewrite this project as a decoupled Rails API with a React web frontend and a React Native app, following the patterns in the sibling repo at `../burough_buddies`. The design decisions below are settled. Do not relitigate them; if you think one is wrong, say so in one sentence at the relevant phase gate and keep building.

## Read first

In this repo: `CLAUDE.md`, `docs/context.md`, `docs/architecture.md`, `docs/status.md`, `docs/decisions.md`, the newest file in `docs/history/`, then `data/program.json`, `data/drills.json`, `data/plans/2026-09.json`, `src/page.html`, and `api/diary.js`.

In `../burough_buddies`, read these as the pattern source, not as content:
- `backend/app/controllers/api/v1/api_controller.rb` (JWT `authorize_request`, error envelope `{ error: { code, message } }`)
- `backend/app/controllers/api/v1/passport_controller.rb` (one fat payload per view rather than chatty endpoints)
- `backend/app/services/jwt_service.rb`, `backend/app/models/user.rb`, `backend/app/serializers/`
- `backend/config/routes.rb`, `backend/Gemfile`, `backend/spec/content_spec.rb`
- `mobile/src/ducks/auth/*` (the canonical duck: `actionTypes.ts`, `actions.ts`, `reducer.ts`, `api.ts`, `sagas.ts`, `selectors.ts`, `index.ts`)
- `mobile/src/store/{index,rootReducer,rootSaga,hooks}.ts`, `mobile/src/services/apiClient.ts`

## What this is

Teddy's year-long PE and athletic development program. Jeff is the coach, Teddy is 7 and homeschooled. Today it is a Python build script that injects JSON into one 773-line HTML file, deployed to Vercel behind a single shared passphrase, with a four-function diary API against Neon. All of that gets replaced.

## Settled decisions

1. **Monorepo**, mirroring burough_buddies:

   ```
   teddy-pe/
   |- backend/    Rails 8 API-only, Ruby 3.3.5, Postgres (Neon), RSpec
   |- core/       Shared TypeScript package: ducks, apiClient, types, storage port
   |- web/        Vite + React 18 + TS + Redux Toolkit + redux-saga + react-router
   |- mobile/     Expo React Native + expo-router, TypeScript
   |- docs/       Existing docs, kept and updated
   ```

   Program content lives at `backend/content/`, which the seeder reads, matching where burough_buddies actually seeds from.

2. **`core/` is the sync mechanism.** Every duck, the apiClient, and all API TypeScript types live in `core/` and are imported by both `web/` and `mobile/`. Neither app defines its own duck. Platform differences are injected through ports, not forked code: a `ClientStorage` interface in `core/src/services/clientStorage.ts` with a `localStorage` implementation in `web/` and an `expo-secure-store` implementation in `mobile/`, passed in at store creation. `core/` also holds a `theme` module of colors, spacing and type scale so the two UIs read as siblings. `web/` and `mobile/` own components and routing only. If you find yourself copying a reducer between apps, you have made a mistake.

3. **Ducks exactly as burough_buddies writes them.** One folder per domain under `core/src/ducks/`, each with `actionTypes.ts`, `actions.ts`, `reducer.ts`, `api.ts`, `sagas.ts`, `selectors.ts`, `index.ts`. Plain string constants namespaced `domain/ACTION`. Hand-written action creators. A plain `switch` reducer, not `createSlice`. `redux-saga` for all side effects, not thunks and not RTK Query. `configureStore` with `thunk: false` and saga middleware, registered through `rootReducer.ts` and `rootSaga.ts`. Every `api.ts` call goes through the shared `apiClient` and returns the `ApiResult<T>` union.

4. **Auth: email and password to a JWT bearer token.** `has_secure_password` with bcrypt, `POST /api/v1/auth/login` returns `{ jwt, user }`, and `Api::V1::ApiController#authorize_request` verifies the bearer token the way burough_buddies does. Token stored via the `ClientStorage` port: `localStorage` on web, `expo-secure-store` on native. No public signup. Accounts are created by a rake task (`rails users:create`). The auth duck's bootstrap saga reads a stored token, calls `/me` to confirm it still works, and falls back to the login screen, which is the same shape as burough_buddies' bootstrap without the device-guest path.

5. **Roles and athletes are separate concepts.** `User` carries `role` (coach, athlete, viewer). `Athlete` is its own model with an optional `user_id`, so the schema supports a second child later without a migration. Coach reads and writes everything. Athlete sees their own cards and writes their own entries. Viewer (mom, grandparents, an outside tennis coach) reads and writes nothing. Use Pundit, as burough_buddies already depends on it.

6. **Journals are two different models, both attached to their author.**
   - `CoachEntry`: one per user per session date per program year. Carries `overall`, `energy`, `flag_pain`, `pain_note`, `note`, `challenge_num`, and per-drill ratings.
   - `AthleteEntry`: Teddy's own reflection, written in his language. Different fields (how it felt, what was fun, what was hard, a note), different form, kid-readable UI.
   - Drill ratings become a normalized `DrillRating` table rather than the `jsonb` column `api/diary.js` uses today, because cross-year drill mastery is a requirement and you cannot query mastery over time out of jsonb without pain.

7. **`ProgramYear` scopes everything, and progression crosses years.** A `ProgramYear` row (label `2026-27`, `starts_on`, `ends_on`, `athlete`, `status`) owns blocks, areas, plans, ranks, patches and test dates. Every journal entry, test result and patch award carries `program_year_id`. Nothing about "this is year one" may be hardcoded anywhere, in the backend or either client. Creating a new year clones a prior year's structure as an editable starting template. On top of that, the API exposes explicit cross-year progression: rank history, test battery trends charted across every year, height over time, and drill mastery carried forward.

8. **Program content stays authored in the repo and is seeded into Postgres.** `backend/content/program_years/2026-27/{program.yml, drills.yml, plans/2026-09.yml, ...}`, converted from today's `data/*.json`. An idempotent `rails content:seed` task loads them. An RSpec content spec modeled on `burough_buddies/backend/spec/content_spec.rb` validates shape and referential integrity so a bad edit fails CI instead of production. Postgres owns user-generated data (journals, test results, patch and rank awards); the repo owns the program. This preserves the `CLAUDE.md` principle that this repo is the complete memory of the project.

9. **The old build pipeline is deleted.** `build.py`, `src/page.html`, `site/`, `dist/`, `api/*.js`, `public/`, `vercel.json` and `tools/diary_pull.py` all go, at Phase 3 cutover and not before. Stop publishing `dist/artifact.html` to claude.ai.

10. **Hosting, built to cost as close to nothing as possible.** See the running costs section below. Rails on a single scale-to-zero Fly.io machine, the existing Neon free tier for Postgres, Vercel Hobby for the web app, and no background job infrastructure at all. Copy burough_buddies' `Dockerfile` shape, but not its `fly.staging.toml` / `fly.production.toml` two-environment setup. Set up `rack-cors` for the web origin.

## Data model to build

Derive exact fields from `data/program.json`, `data/drills.json`, `data/plans/2026-09.json`, `docs/architecture.md` and the `diary_entry` table in `api/diary.js`. At minimum:

`User`, `Athlete`, `ProgramYear`, `Block`, `Area`, `AreaCell` (the area-by-block grid), `Patch`, `BallGate`, `BatteryTest`, `Drill`, `MonthPlan`, `Week`, `DayCard`, `CoachEntry`, `AthleteEntry`, `DrillRating`, `TestResult` (including height at every test date), `PatchAward`, `RankAward`.

`Drill` is global across years, not scoped to one, so mastery carries forward.

## API surface

Namespaced `/api/v1`, following burough_buddies' route file. Prefer one well-shaped payload per view over many chatty endpoints, the way `PassportController#payload` does it.

```
POST   /auth/login
GET    /me
PATCH  /me
GET    /program_years
GET    /program_years/:id                     the Year view payload
GET    /program_years/:id/plans/:month        a month's weeks
GET    /program_years/:id/weeks/current       this week's day cards
GET    /drills
GET    /drills/:slug
GET    /coach_entries            POST /coach_entries         PATCH /coach_entries/:id
GET    /athlete_entries          POST /athlete_entries       PATCH /athlete_entries/:id
GET    /test_results             POST /test_results
GET    /progression                           cross-year trends
```

Error envelope is `{ error: { code, message } }` with the same status mapping burough_buddies uses, because `core/`'s apiClient parses exactly that shape.

## Ducks to build in `core/`

`auth`, `programYear`, `plan`, `week`, `drills`, `coachJournal`, `athleteJournal`, `results`, `progression`.

## Program rules that the code must enforce, not just display

These come from `CLAUDE.md` and `docs/architecture.md`. Encode them as model validations or content-spec assertions so a bad plan fails a test rather than reaching Teddy:

- Day roles are fixed: Mon Floor, Tue Rings, Wed Fast, Thu Wall, Fri Skate, Sat Game Day (home off), Sun Court.
- High-intent effort budget: 40 per week, 20 in Trials weeks. Zero on Sun and Mon, at most 5 on Fri. Never two consecutive high-impact home days.
- Every week has one theme, 5 to 6 sub-targets including one tennis, one basketball and one soccer sub-target, and a Challenge of the Week.
- Ball skills are counted in touches, never minutes. Adding volume means adding touches, never sprints or jumps.
- Nine areas, nine patches per rank, 7 of 9 to rank up. Height recorded at every test date.
- Tennis ball progression is gated on skill, never on date.
- Week 8 of every block is Trials at half volume, followed by a rank-up.

## Running costs: keep this near zero

There is one real user plus a handful of family readers. burough_buddies costs about $80 a month, and nearly all of that is infrastructure this project does not need: a staging app and a production app, an always-on Sidekiq worker, Redis, and machines that never scale down. Do not carry any of it over. Target is a few dollars a month at most, and zero where a free tier covers it.

**Do not build:**

- **No Sidekiq, no Redis, no worker process, and no `sidekiq-cron`.** Nothing in this program needs a background job. Do not copy the `Sidekiq::Web` mount from `burough_buddies/backend/config/routes.rb`, and do not copy `sidekiq.yml` or `sidekiq_schedule.yml`. If a genuine background need appears later, use Rails 8's database-backed Solid Queue, which needs no extra service. Raise it at a phase gate before adding it.
- **No staging environment.** One production app. Correctness comes from the test suite running locally and in CI, not from a second paid environment.
- **No PostGIS and no geo stack.** Drop `activerecord-postgis-adapter`, `rgeo`, `rgeo-activerecord`.
- **No push notification service.** Drop `exponent-server-sdk`. If Phase 4 wants reminders, use local notifications scheduled on the device, which cost nothing and need no server.

**Trim the Gemfile to roughly:** `rails`, `puma`, `pg`, `active_model_serializers`, `jwt`, `bcrypt`, `pundit`, `rack-cors`, `bootsnap`, `okcomputer` (Fly wants a health check endpoint), plus the existing dev and test groups (`rspec-rails`, `factory_bot_rails`, `faker`, `shoulda-matchers`, `database_cleaner-active_record`, `simplecov`, `rubocop-rails-omakase`, `brakeman`). Justify at the Phase 1 gate anything you add beyond that.

**Configure for cheap:**

- One Fly app, smallest VM that boots Rails reliably (start at `shared-cpu-1x` with 512MB and configure swap; 256MB will thrash or OOM on boot). In `fly.toml` set `min_machines_running = 0` with `auto_stop_machines` and `auto_start_machines` enabled, so the machine sleeps when nobody is using it and wakes on the next request. A site used a few times a day costs almost nothing this way.
- Puma tuned small: one worker, a low thread count. Do not size it for concurrency that will never arrive.
- Stay on the existing **Neon free tier** with autosuspend on. A family journal and a year of plans is nowhere near the free storage limit, and keeping the current instance means the diary rows never move hosts.
- Web app on **Vercel Hobby**, free. It is static files from a Vite build.
- Mobile builds on the **EAS free tier**, or locally. Do not put a paid EAS plan in the plan.

**Verify, do not assume.** Hosting prices and free tiers change, and these specifics may be out of date by the time you read them. At the Phase 1 gate, report the actual expected monthly cost with the numbers currently published by Fly, Neon and Vercel, and flag anything that would push it past a few dollars before deploying it.

## Isolation: this work never touches main

Teddy's program is live and the deployed site is used every week. `main` must stay deployable and untouched for the entire rewrite, through to the Phase 3 gate.

**Before writing any code, in this order:**

1. **Confirm the baseline.** `git status` clean, `git branch --show-current` is `main`, and `git rev-list --left-right --count origin/main...main` returns `0	0`. If any of that is untrue, stop and ask Jeff.

2. **Close the worktree ignore trap before creating a worktree.** `.claude/` is not in this repo's `.gitignore`, and the sibling repo has already been bitten by exactly this: in `../burough_buddies`, `git ls-files -s .claude` returns `160000 ... .claude/worktrees/landmark-passport-build`, a worktree committed by accident as a phantom gitlink. Do not repeat it here.
   - Right now, with no commit and no change to `main`, run `printf '.claude/worktrees/\n.worktrees/\n' >> .git/info/exclude`. That is local-only and takes effect immediately.
   - Then add the same two lines to `.gitignore` in your first commit on the feature branch, so the rule becomes permanent when Jeff merges.

3. **Create the isolated workspace with the harness's native worktree tool** (`EnterWorktree` or equivalent), branch `feature/rails-react-rewrite`, based on `main`. Do not run `git worktree add` by hand. The native tool owns placement, branch creation and cleanup; bypassing it leaves state the harness cannot see or clean up.

4. **Verify you are actually isolated** before proceeding: `git rev-parse --git-dir` and `git rev-parse --git-common-dir` must differ, and `git branch --show-current` must be `feature/rails-react-rewrite`.

**For the whole project:**

- Every commit goes on `feature/rails-react-rewrite` or a child branch of it. Never commit to `main`.
- Do not rebase onto `main`, do not merge `main` in, do not force push, do not touch any other branch.
- Leave `feature/ball-sports-and-mindset` and `feature/drill-glossary-and-coach-diary` alone. Both are stale leftovers of squash merges (the first is behind `main`, the second has an empty diff against it), but tidying them is Jeff's call and not part of this work.
- The deletions in decision 9 happen on the feature branch at Phase 3 and reach `main` only when Jeff merges. Until that merge, the Vercel deploy off `main` keeps serving the current site, so there is never a window where Teddy's program is unavailable.
- Because this rewrite replaces nearly every file, a long-lived branch will diverge badly if `main` moves. If Jeff needs to change the program itself (a new month's plan, a fix to a day card) while the rewrite is in flight, he does it on `main` in the old format, and you port it into `backend/content/` during Phase 3. Do not try to keep the two in sync continuously.
- At each phase gate, report the branch name and `git log --oneline main..HEAD` so Jeff can see exactly what would land.
- Jeff reviews the diff and merges. You never merge to `main`.

## Phases, each with a hard review gate

Do not begin a phase until Jeff has approved the previous one. At each gate, state what is done, what is tested, and what you would change.

**Phase 1: Rails API.** Schema, models, seeds from converted YAML, auth, all endpoints, Pundit policies, RSpec request specs and content spec green, running locally against Neon and deployed to Fly staging. Gate.

**Phase 2: `core/` and the React web app.** The shared package, every duck with reducer and saga tests, then the web app: login, Year, month, This Week with day cards, Glossary, coach journal form, athlete journal form, cross-year progression charts. Feature parity with `src/page.html` plus the new auth and journal work. Gate.

**Phase 3: Migration and cutover.** Convert all of `data/` to `backend/content/`. Migrate the existing Neon `diary_entry` rows onto Jeff's coach account with the correct `program_year_id`, verified by a count and a spot check before anything is dropped. Point Vercel at the new web app. Then delete the old pipeline listed in decision 9. Gate.

**Phase 4: React Native app.** Expo plus expo-router, importing the same ducks from `core/`. Same features and same data as the web app. No duck may be redefined here. Gate.

## Things that will bite you

- **The privacy model inverts.** Today `public/` holds only `robots.txt` and `api/page.js` serves the HTML only to a signed-in visitor, specifically because Vercel gives the filesystem precedence over rewrites and a static `index.html` would be handed to anyone who asked. A decoupled SPA has a publicly readable bundle by definition. That is acceptable only if privacy moves entirely to the API. **No program content, drill text, plan data or anything about Teddy may be baked into the JavaScript bundle or fetched without a valid JWT.** Call this out explicitly at the Phase 2 gate and show what an unauthenticated visitor can see.
- **The repo stops being the diary's memory.** `tools/diary_pull.py` exists so journal entries land in the repo before planning. Deleting it without a replacement breaks the `CLAUDE.md` principle that this repo is the complete memory of the project. Propose a replacement (a rake task exporting journals and plans to `docs/`) at the Phase 1 gate and let Jeff decide.
- **Saving with no signal currently fails and loses the entry.** That is a known open item in `docs/status.md`, and a tennis court is exactly where it bites. Decide deliberately whether the rewrite fixes it with an offline queue or carries the same limitation forward, and say which at the Phase 2 gate.
- **A sleeping server means a slow first load.** A scale-to-zero Fly machine plus an autosuspended Neon branch can add a few seconds to the first request after an idle period. That is the right trade for the cost, but the clients have to handle it well: a real loading state on first paint, no spinner-free blank screen, and no timeout shorter than the apiClient's existing 15 seconds. Measure the actual cold-start time at the Phase 1 gate and report it.
- **Teddy is 7.** The athlete-facing UI has to be usable by a 7-year-old who is reading. Big targets, few words, his own cue language.
- **Jeff's running participation is limited in fall 2026.** Do not write fall drills that need him to sprint.

## How to work

- Use the superpowers skills. The design above is settled, so skip brainstorming: write the spec to `docs/superpowers/specs/YYYY-MM-DD-rewrite-design.md`, commit it, ask Jeff to review it, then invoke `superpowers:writing-plans` for the implementation plan, then execute it phase by phase.
- Test-driven, per `superpowers:test-driven-development`. RSpec request and model specs on the backend, reducer and saga tests in `core/`, React Testing Library for `web/`, jest-expo for `mobile/`. Never claim a phase is done without showing the test output.
- Work in the isolated worktree on `feature/rails-react-rewrite`, per the isolation section above. Never commit to `main`.
- Keep `docs/` current as you go: append to `docs/decisions.md` with the date, update `docs/architecture.md` when the program model changes, update `docs/status.md` at the end of every session, and add a file to `docs/history/`.
- Match Jeff's writing style in all UI copy and docs: direct, warm, specific, cues in Teddy's language ("land like a cat"). No em dashes. Avoid "it's not X, it's Y" constructions. Dad notes are one to three sentences of what to watch.

## Ask before deciding

Ask Jeff rather than guessing about: Teddy's exact birthday (needed for the Athlete record), which email addresses get accounts and at what role, the passphrase-to-password migration for existing access, and anything that changes the program itself rather than the software.
