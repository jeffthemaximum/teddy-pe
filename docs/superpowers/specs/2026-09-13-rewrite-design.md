# Spec: teddy-pe as a Rails API, a React web app and a React Native app

Date: 2026-09-13. Branch: `feature/rails-react-rewrite`. Source brief: `docs/rewrite-prompt.md`.

This is the design written down concretely, derived from the real files rather than from memory. The decisions in the brief are settled and are not relitigated here. What this document adds is the exact schema, the exact payloads, the rules turned into tests, and a short list of things the brief could not have known because they only show up once you read the data.

Read the last two sections first if you are short on time. They are the decisions I made on your behalf and the questions I cannot answer without you.

## Scope

Replace the Python build script, the single 773 line HTML page, the four Vercel functions and the shared passphrase with:

```
teddy-pe/
|- backend/    Rails 8 API-only, Ruby 3.3.5, Postgres (Neon), RSpec
|- core/       Shared TypeScript: ducks, apiClient, types, storage port, theme
|- web/        Vite + React 18 + TS + Redux Toolkit + redux-saga + react-router
|- mobile/     Expo React Native + expo-router, TypeScript
|- docs/       Existing docs, kept and updated
```

Program content is authored in `backend/content/` as YAML and seeded into Postgres. I confirmed the brief's claim about the sibling: `burough_buddies/backend/db/seeds.rb` reads `backend/content/`, and the root `content/` directory there is a stale leftover it explicitly notes moving away from. So `backend/content/` is right.

## Where the data model actually comes from

Every table below is derived from a real file. The mapping is listed so you can check it.

### From `data/program.json`

| JSON key | n | Shape | Becomes |
|---|---|---|---|
| `blocks` | 6 | `{k, name, start, end, focus, now}` | `Block` (`now` is derived from dates, not stored) |
| `areas` | 9 | `{n, s}` | `Area` (name, summary) |
| `cells` | 9 x 6 | array of HTML strings | `AreaCell` (area x block grid, 54 rows) |
| `patches` | 9 | `[area_name, requirement]` | `Patch`, scoped to a block and an area |
| `gates` | 3 | `[from, to, label, requirement, status]` | `BallGate` |
| `battery` | 10 | `[name, protocol, area, unit]` | `BatteryTest` |
| `sheetRows` | 15 | `[label, unit, test_id, direction]` | `BatteryMeasure` (see note below) |
| `roles` | 7 | `[dow, role, organized, mins, level, note]` | `DayRole` |
| `org`, `level` | 7 each | dow to values | folded into `DayRole`, they duplicate it |
| `testDates` | 5 | `[window, label, display]` | `TestDate` |
| `levelName` | 5 | `off, low, mod, high, organized` | a constant on the serializer |
| `northStar`, `rankRule`, `ballNow` | | strings | columns on `ProgramYear` |

**`BatteryMeasure` is an addition to the model list in the brief, and it is needed.** There are 10 battery tests but 15 recordable rows, because the single-leg hop, the overhand throw and the single-leg balance each record left and right, and height stands outside the ten. `TestResult` keys on `t3r`, `t11l`, `h`, not on a test index. The unit and the progress direction (`lower`, `higher`, `growth`) also live at the row level. Without a second table those four facts have nowhere to go. `BatteryMeasure.battery_test_id` is nullable so height, which is not one of the ten, is a first class row rather than a special case.

### From `data/drills.json`

84 entries keyed by slug, each `{name, area, aliases[], short, how[], watch, cue, video}`. Becomes `Drill`, global across years so mastery carries forward. `area` stays a string because areas are scoped to a program year and drills are not.

### From `data/plans/2026-09.json`

Top level `{month, block, label, range, weeks[], cards}`.

- `weeks[]` is `{n, theme, dates, targets[], challenge, days[]}` where each `days` entry is `[dow, day_number, name, lines[]]`. This is the month view.
- `cards` is `{week, theme, dates, days[]}` where each day is `{dow, date, role, name, mins, level, blocks[], dad}` and each block is `[mins, name, prose, tag?]` with `tag` being absent, `"test"` or `"ch"`. This is the full day card, and only the current week has one.

So a day is written twice today, once as a month-view summary and once as a full card, and the two can drift. In the new model one `DayCard` holds both: `summary_lines` for the month view, `day_blocks` and `dad_note` for the full card. A day with no blocks renders as a summary. That removes the duplication rather than porting it.

### From `api/diary.js` and `api/results.js`

`diary_entry` columns: `id, created_at, session_date, dow, plan_month, week, overall, energy, flag_pain, pain_note, note, ratings jsonb, challenge_num, device`.

`dow`, `plan_month` and `week` are derivable from `session_date` plus the plan, and `device` was part of the per-device id scheme that broke cross-device editing and is already dead. They are read during migration and then dropped. `ratings` jsonb becomes the `DrillRating` table.

`test_result` columns: `id, test_window, test_id, value, recorded_at, device`. Note `value` is deliberately **text**, with a comment saying some rows get typed as ranges or with a unit and a number that will not parse is still worth storing. That judgment is correct and survives: `TestResult` keeps `raw_value` as a string and adds a nullable `numeric_value` that the parser fills when it can. The chart reads `numeric_value` and skips what it cannot read, and nothing you type is ever thrown away.

## Schema

Nothing is scoped to "year one". Every user-generated row carries `program_year_id`.

**`users`**: `email` (citext, unique), `password_digest`, `name`, `role` (enum `coach` / `athlete` / `viewer`), `last_seen_at`, timestamps.

**`athletes`**: `name`, `birthday` (date, not null), `user_id` (nullable FK). Separate from `users` so a second child needs no migration, and nullable `user_id` so an athlete can exist before they have a login.

**`program_years`**: `athlete_id`, `label` (`2026-27`), `starts_on`, `ends_on`, `status` (`draft` / `active` / `archived`), `north_star`, `rank_rule`, `ball_now`.

**`blocks`**: `program_year_id`, `key`, `name`, `position` (1 to 6), `starts_on`, `ends_on`, `focus`.

**`areas`**: `program_year_id`, `slug`, `position` (1 to 9), `name`, `summary`. The slug is what cross-year progression joins on, so Speed in 2026-27 lines up with Speed in 2027-28 without forcing a shared table.

**`area_cells`**: `area_id`, `block_id`, `body`.

**`patches`**: `program_year_id`, `block_id`, `area_id`, `name`, `requirement`.

**`ball_gates`**: `program_year_id`, `position`, `from_ball`, `to_ball`, `label`, `requirement`, `status` (`cleared` / `active` / `held`). **No date column anywhere**, which is how "gated on skill, never on date" is enforced structurally.

**`battery_tests`**: `program_year_id`, `position`, `name`, `protocol`, `area_name`, `unit`.

**`battery_measures`**: `program_year_id`, `battery_test_id` (nullable), `test_id` (`t1`, `t3r`, `h`), `label`, `unit`, `direction` (`lower` / `higher` / `growth`), `position`.

**`test_dates`**: `program_year_id`, `window` (`2026-09`), `label` (`Baseline`), `display` (`Sep 15-17`), `position`.

**`day_roles`**: `program_year_id`, `dow`, `position` (0 to 6), `name`, `organized` (string array), `minutes`, `intensity` (1 to 4), `note`.

**`drills`**: global. `slug` (unique), `name`, `area_name`, `aliases` (string array), `short`, `how` (string array), `watch`, `cue`, `video`.

**`month_plans`**: `program_year_id`, `block_id`, `month` (`2026-09`), `label`, `range_display`.

**`weeks`**: `month_plan_id`, `block_id`, `number`, `position_in_block`, `theme`, `dates_display`, `targets` (string array), `challenge`, `trials` (boolean).

**`day_cards`**: `week_id`, `day_role_id`, `date`, `dow`, `name`, `minutes`, `intensity`, `hie` (integer, see below), `summary_lines` (string array), `dad_note`, `position`.

**`day_blocks`**: `day_card_id`, `position`, `minutes`, `name`, `body`, `tag` (null / `test` / `challenge`), `drill_slugs` (string array, first mention order).

**`coach_entries`**: `user_id`, `athlete_id`, `program_year_id`, `session_date`, `day_card_id` (nullable), `overall` (1 to 5), `energy` (1 to 5), `flag_pain`, `pain_note`, `note`, `challenge_num`. Unique on `(user_id, program_year_id, session_date)`.

**`athlete_entries`**: `user_id`, `athlete_id`, `program_year_id`, `session_date`, `day_card_id` (nullable), `felt` (1 to 5), `best` (text), `hard` (text), `note` (text), `shared` (boolean, default false). Unique on `(user_id, program_year_id, session_date)`. Teddy's own words in his own form, with his own fields. `shared` is the toggle he controls. It defaults to off, so showing Dad is always something he chooses rather than something he has to remember to switch off.

**`drill_ratings`**: `coach_entry_id`, `drill_id`, `rating` (`not_yet` / `getting` / `owns`), plus `program_year_id` and `session_date` carried on the row. Unique on `(coach_entry_id, drill_id)`, indexed on `(drill_id, session_date)`. The denormalized pair is there because the whole point of leaving jsonb is asking "how has the cartwheel gone across three years" without a join through every entry.

**`test_results`**: `program_year_id`, `athlete_id`, `test_date_id`, `battery_measure_id`, `raw_value`, `numeric_value`, `recorded_by_user_id`, `recorded_at`. Unique on `(program_year_id, test_date_id, battery_measure_id)`.

**`patch_awards`**: `athlete_id`, `program_year_id`, `patch_id`, `awarded_on`, `note`.

**`rank_awards`**: `athlete_id`, `program_year_id`, `block_id`, `awarded_on`, `patch_count`. Validates `patch_count >= 7`.

## The rules, as tests

The brief asks for these to fail a test rather than reach Teddy. Here is exactly how each one is caught.

| Rule | How it is enforced |
|---|---|
| Day roles are fixed | Content spec asserts the seven `DayRole` rows are exactly Mon Floor, Tue Rings, Wed Fast, Thu Wall, Fri Skate, Sat Game Day, Sun Court, and that every `DayCard` points at the `DayRole` for its own weekday. |
| Zero high intent on Sun and Mon, at most 5 on Fri | `DayCard` validation on `hie`. |
| 40 per week, 20 in Trials weeks | `Week` validation summing its cards' `hie`. |
| Never two consecutive high-impact home days | Content spec walks each week in order and fails if two adjacent cards both have `intensity >= 3`. |
| One theme, 5 to 6 sub-targets, one each of tennis, basketball, soccer | Content spec: `targets.length` in 5..6, and at least one target matching each of tennis, basketball, and soccer or keeper. |
| Challenge of the Week attempted early and late | Content spec: a block tagged `challenge` appears on Mon or Tue and again on Fri. |
| Ball skills counted in touches, not minutes | Content spec: every week has at least one ball-skill block whose body carries a counted volume (`\d+ (dribbles|touches|passes|reps)`). |
| Nine areas, nine patches per rank, 7 of 9 to rank up | Content spec on counts, `RankAward` validation on `patch_count`. |
| Height at every test date | Content spec asserts a measure with `test_id` of `h` exists; a model check flags a test window that has results but no height row. |
| Ball progression gated on skill, never date | Structural: `ball_gates` has no date column, and the spec asserts exactly one gate is `active`. |
| Week 8 of every block is Trials at half volume | Content spec: the week at `position_in_block` 8 has `trials` true, a theme matching Trials, and a total minutes under the block's mean, followed by a `RankAward`. |
| Jeff does not sprint in fall 2026 | Content spec: no `DayCard` dated before 2026-12-01 has a block whose body asks Dad to sprint, race or chase. A word list, reviewed with you. |

**The high intent effort budget needs a field that does not exist today.** Nothing in `data/plans/2026-09.json` records a count of high intent efforts. `level` (1 to 4) is an intensity band rather than a number, so it can enforce "never two consecutive high-impact days" and "Sunday and Monday are low", but it cannot enforce 40 a week.

**Settled:** an `hie:` integer is added per day card in the YAML. I derive a number for each of the 21 cards already written, from the architecture's own stated split (Wednesday 20 to 30, Thursday 5 to 10, Friday at most 5, Sunday and Monday zero) and from what each card actually asks for, then bring Jeff the full table at the Phase 1 gate for correction. Every number is shown with the blocks it was counted from, so a wrong one is obvious rather than buried.

## Backend

Rails 8, API only, Ruby 3.3.5.

Gemfile: `rails`, `puma`, `pg`, `active_model_serializers`, `jwt`, `bcrypt`, `pundit`, `rack-cors`, `bootsnap`, `okcomputer`, plus `rspec-rails`, `factory_bot_rails`, `faker`, `shoulda-matchers`, `database_cleaner-active_record`, `simplecov`, `rubocop-rails-omakase`, `brakeman`. Nothing beyond the brief's list. No Sidekiq, no Redis, no worker, no PostGIS, no push SDK, no staging app. The sibling's `psych` gem is skipped because Rails already loads YAML.

Auth is `has_secure_password` with bcrypt. `POST /api/v1/auth/login` returns `{ jwt, user }`. `Api::V1::ApiController#authorize_request` verifies the bearer token exactly as the sibling does, with the same `{ error: { code, message } }` envelope, because `core`'s apiClient parses that shape and nothing else. No public signup. Accounts come from `rails users:create`.

Pundit policies, one sentence each:

- **Coach** reads and writes everything for their athlete, with one exception: an `AthleteEntry` is visible only when Teddy has set `shared`. The policy scope filters on it, so an unshared entry is absent from the payload rather than present and hidden by the client.
- **Athlete** reads their own program year, plans, weeks and drills, reads their own test results, and writes only their own `AthleteEntry`, including its `shared` flag.
- **Viewer** reads the program, the plans and the drills. Writes nothing. Sees no journal entry from either side.

A request spec asserts the coach gets a 404 on an unshared entry by id and that it never appears in a list payload. That is the whole point of the toggle, so it gets a test rather than a comment.

### API surface

Namespaced `/api/v1`, one well-shaped payload per view.

```
POST   /auth/login                            { jwt, user }
GET    /me                                    { user, athlete, current_program_year_id }
PATCH  /me
GET    /program_years                         label, dates, status, is_current
GET    /program_years/:id                     the Year view, in one response
GET    /program_years/:id/plans/:month        the month view
GET    /program_years/:id/weeks/current       this week, with full day cards
GET    /drills                                GET /drills/:slug
GET    /coach_entries     POST /coach_entries     PATCH /coach_entries/:id
GET    /athlete_entries   POST /athlete_entries   PATCH /athlete_entries/:id
GET    /test_results      POST /test_results
GET    /progression                           cross-year trends
```

`GET /program_years/:id` returns blocks, the nine areas with their six cells each, patches with awards, ball gates, the battery with its measures and every recorded result, test dates, day roles, the north star, the rank rule, the current ball, and pointers to the current block and week. That is the whole Year tab in one request, the way `PassportController#payload` does it, because splitting it only buys round trips on a server that may have just woken up.

`GET /weeks/current` returns the week, its day cards, each card's blocks with `drill_slugs` resolved, the dad note, and the coach entry and athlete entry that already exist for each date, so the journal form opens filled in rather than fetching again.

`GET /progression` is the one that justifies the schema: rank history across every year, each battery measure charted across every window of every year, height over time with the cm per year pace, and per-drill mastery from `drill_ratings`.

### Content pipeline

`backend/content/program_years/2026-27/{program.yml, drills.yml, plans/2026-09.yml, ...}`, converted from today's `data/*.json`. `rails content:seed` is idempotent. `spec/content_spec.rb` validates shape and referential integrity without touching the database, modeled on the sibling's, so a bad edit fails CI.

Postgres owns what you and Teddy generate. The repo owns the program. That split is what keeps this repo the complete memory of the project.

## `core/`

Every duck, the apiClient, all API types, the storage port and the theme. `web/` and `mobile/` import them and own components and routing only. If a reducer gets copied between the two apps, that is a bug.

Ducks: `auth`, `programYear`, `plan`, `week`, `drills`, `coachJournal`, `athleteJournal`, `results`, `progression`. Each is a folder with `actionTypes.ts`, `actions.ts`, `reducer.ts`, `api.ts`, `sagas.ts`, `selectors.ts`, `index.ts`. Plain `domain/ACTION` string constants, hand-written action creators, a plain `switch` reducer, redux-saga for every side effect, `configureStore` with `thunk: false`, wired through `rootReducer.ts` and `rootSaga.ts`. Every `api.ts` call goes through the shared apiClient and returns `ApiResult<T>`.

`ClientStorage` is an interface in `core/src/services/clientStorage.ts`, implemented over `localStorage` in `web/` and `expo-secure-store` in `mobile/`, passed in at store creation. The auth bootstrap saga reads the stored token, calls `/me` to confirm it still works, and falls back to the login screen. Same shape as the sibling's bootstrap, without the device-guest path.

**Drill linking has to move.** Today `build.py` matches drill names and aliases against card prose and emits HTML with tappable spans. React Native cannot render an HTML string, so that cannot stay a build-time HTML transform. Instead the seeder stores each block's raw `body` plus its `drill_slugs`, and `core/src/lib/renderBody.ts` is a pure function turning body text into a token array (`text`, `bold`, `quote`, `drill`) that web renders as elements and native renders as `<Text>` children. It is unit tested against the same cases `build.py` handles today: longest match first, word boundaries only, first mention per block, never inside existing markup. This is the one piece of the old pipeline worth rewriting carefully rather than porting.

## `web/` and `mobile/`

`web/` is Vite, React 18, TypeScript, react-router: login, Year, month, This Week with day cards, Glossary, the coach journal form, the athlete journal form, and cross-year progression charts. Feature parity with `src/page.html` plus auth and the athlete journal.

`mobile/` is Expo with expo-router, same features, same data, importing the same ducks. No duck is redefined there.

Teddy is 7 and reading. The athlete-facing screens get big targets, few words and his own cue language.

## Hosting

One Fly.io app, `shared-cpu-1x` with 512MB and swap configured, `min_machines_running = 0` with auto stop and auto start, so it sleeps when nobody is using it. Puma with one worker and a low thread count. The existing Neon free tier with autosuspend, which also means the diary rows never move hosts. Vercel Hobby for the web bundle. EAS free tier or local builds for mobile. No staging, no Redis, no worker.

I will report the actual expected monthly cost at the Phase 1 gate using prices published then, along with the measured cold start time, rather than quoting numbers from the brief that may already be stale.

## Migration and cutover, Phase 3

1. Convert all of `data/` to `backend/content/`.
2. Migrate the existing Neon `diary_entry` rows onto your coach account with the right `program_year_id`, exploding `ratings` jsonb into `drill_ratings`. Migrate `test_result` rows onto `battery_measures` by `test_id` and `test_dates` by window.
3. Verify by row count and a spot check of specific entries **before** anything is dropped.
4. Point Vercel at the new web app.
5. Only then delete `build.py`, `src/page.html`, `site/`, `dist/`, `api/*.js`, `public/`, `vercel.json` and `tools/pull.py`.

One correction to the brief's delete list: `tools/diary_pull.py` was renamed to `tools/pull.py` when it started pulling test results too. There is also `tools/test_api.mjs`, which tests the functions being deleted and goes with them.

Until you merge, the Vercel deploy off `main` keeps serving the current site, so there is no window where the program is unavailable.

## Things that will bite, and what I plan to do

**The privacy model inverts.** Today `api/page.js` serves the HTML only to a signed-in visitor and `public/` holds nothing but robots.txt, specifically because Vercel gives the filesystem precedence over rewrites. A decoupled SPA has a publicly readable bundle by definition. So privacy moves entirely to the API: no program content, no drill text, no plan data and nothing about Teddy is baked into the JavaScript bundle or fetched without a valid JWT. Request specs assert every content endpoint returns 401 without a token. At the Phase 2 gate I will fetch the deployed bundle unauthenticated and show you exactly what a stranger can read, which should be a login form and nothing else.

**The repo stops being the diary's memory.** `tools/pull.py` exists so entries land in the repo before planning. Deleting it without a replacement breaks the principle in `CLAUDE.md`.

**Settled:** `rails docs:export` writes `docs/journal/<year>/<month>.md`, `docs/results/<year>.md` and the plans as readable prose, run before any planning session. It does more than `pull.py` did, because the program goes back into the repo as text a person can read rather than only as YAML a seeder can read. Unshared athlete entries are excluded from the export, the same as they are from the API.

**Saving with no signal currently fails and loses the entry.** This is open in `docs/status.md`, and a tennis court is where it bites.

**Settled:** a write-through queue in `core/` covering both the journals and the test results, backed by the `ClientStorage` port. The safety comes from the id discipline that already fixed the cross-device bug, since an entry is addressed by `(user, program_year, session_date)` and a result by `(program_year, test_date, measure)`, so a replayed write updates the same row rather than creating a second one. That is the property the old per-device queue lacked. The queue shows its depth in the UI, so a pending save is visible rather than assumed, and it is demonstrated against a simulated dead connection at the Phase 2 gate.

**A sleeping server means a slow first load.** Scale-to-zero on Fly plus an autosuspended Neon branch can add seconds to the first request. The clients handle it with a real loading state on first paint, no blank screen, and no timeout below the apiClient's 15 seconds. I will measure the real cold start at the Phase 1 gate.

## Decisions I made, which you should check

1. `BatteryMeasure` added as a table. Fifteen recordable rows against ten tests, and unit plus direction live at the row level.
2. `DayCard` unifies the month-view summary and the full card, so a day's name is written once instead of twice.
3. `TestResult` keeps the text value and adds a parsed numeric beside it, preserving the deliberate choice in `api/results.js`.
4. `dow`, `plan_month`, `week` and `device` from `diary_entry` are not carried into `CoachEntry`. The first three are derivable and the fourth is dead.
5. Drill linking becomes a shared tokenizer in `core/` rather than build-time HTML, because React Native cannot render HTML.
6. `Area` gets a slug, so cross-year progression joins on it without a shared table.
7. Ball gates carry no date column at all, which turns "gated on skill, never on date" into something the schema will not let you violate.
8. `rails docs:export` replaces `tools/pull.py`, and exports plans as well as journals.
9. The `shared` toggle defaults to off. A toggle Teddy has to remember to switch off is not really his, so sharing is the deliberate act.

## Decisions Jeff made, 2026-09-13

| Question | Answer |
|---|---|
| Branch base | `feature/rails-react-rewrite` off `feature/rewrite`, so the brief travels with the work |
| Accounts | Coach, athlete and viewer, named in the accounts section below |
| Passphrase | No migration. Fresh per-user passwords, the shared passphrase dies at cutover |
| Athlete journal vs the Champion's Log | Teddy controls a per-entry "show Dad" toggle |
| `hie` backfill | I propose a number per card, Jeff corrects at the Phase 1 gate |
| Offline | Queue both journals and test results |
| Repo memory | `rails docs:export` covering journals, results and plans |

The "show Dad" toggle is the one that shapes the kid-facing UI most. It has to be legible to a 7 year old without a sentence of explanation, so it reads as a single labelled switch in his own language rather than a privacy setting.

## Accounts and the athlete record

Given by Jeff on 2026-09-13. Nothing is outstanding.

**Athlete:** Teddy Maxim, born **2019-01-09**. He is 7 years 8 months at the start of the program year and turns 8 on 2027-01-09, which falls in the Coyote block. That date matters in two places the architecture already cares about: the standard ball-progression path quotes red to age 8 and orange 8 to 10, which Teddy is ahead of either way, and the north star's "not precocious at 8" stops being an abstraction partway through this year.

**Users** created by `rails users:create`:

| Name | Email | Role |
|---|---|---|
| Jeff Maxim | jmaxim@trxtraining.com | coach |
| Teddy Maxim | teddymaxim225@gmail.com | athlete |
| Emily Barker (mom) | emmabark22@gmail.com | viewer |

Teddy's `User` links to the `Athlete` row through `athletes.user_id`, which is what makes his journal his rather than a record about him.

The rake task generates a password per account and prints it once. No password, and no `DIARY_PASSPHRASE`, is ever committed or seeded. The old shared passphrase is not carried anywhere and stops working at Phase 3 cutover.

Emily reads the program, the plans and the drills. She sees no journal entry from either side, including Teddy's shared ones, because `shared` means shared with Dad rather than published.

## Phases and gates

1. **Rails API.** Schema, models, seeds from converted YAML, auth, all endpoints, Pundit policies including the `shared` scope, `rails docs:export`, RSpec request and content specs green, running against Neon and deployed to Fly. Report at the gate: verified hosting cost, measured cold start, the full `hie` table for your correction, and the branch diff.
2. **`core/` and the web app.** The shared package with reducer and saga tests, then login, Year, month, This Week, Glossary, both journal forms with Teddy's toggle, progression charts, and the offline queue. Report at the gate: what an unauthenticated visitor can see, and the queue demonstrated against a dead connection.
3. **Migration and cutover.** Content converted, Neon rows migrated and verified by count and spot check, Vercel repointed, then the old pipeline deleted.
4. **React Native app.** Expo and expo-router on the same ducks. No duck redefined.

No phase begins until you have approved the one before it. Every commit lands on `feature/rails-react-rewrite` or a child of it, and you do the merge.
