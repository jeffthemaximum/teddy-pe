# Teddy's Training Year

A year-long physical education and athletic development program for a 7 year old, Sep 2026 through Aug 2027. Built for a future champion, most likely in tennis, possibly basketball or soccer goalkeeping, and built the way champions are actually made: a wide athletic base, thousands of technical touches, protected intensity, and a mind trained alongside the body. Nine areas, six ranks, one cartwheel.

Live site: https://teddy-pe-mlfs.vercel.app, signed in. The API behind it is https://teddy-pe-api.fly.dev.

## What is here

Four parts, and each one has a single job.

| Path | What |
|---|---|
| `backend/` | The Rails 8 API, deployed to Fly. Postgres holds the program, both journals and the test results. The program content itself lives in `backend/content/program_years/<year>/` as YAML and is seeded on every deploy. |
| `core/` | The shared Redux package. Ten ducks holding every piece of state logic the web app and the native app both need, including the offline queue, so neither writes its own. |
| `web/` | The React app, deployed to Vercel. Signing in, the Year, the month, This Week, both journals, the test sheet and the drill glossary. `web/vercel.json` is its deploy config. |
| `docs/` | The project's memory. Read it in the order `CLAUDE.md` gives. |

Inside `docs/`:

| Path | What |
|---|---|
| `docs/architecture.md` | The program. Areas, blocks, ranks, patches, test battery, ball gates, load rules, weekly and daily templates. Change this first. |
| `docs/context.md` | Who this is for and how it runs. Read this before anything else if you are new. |
| `docs/decisions.md` | Decision log: pushbacks, choices, open items. Append, never rewrite. |
| `docs/status.md` | What is built, which branch is which, what is open, what comes next. Read second. |
| `docs/history/` | Session records: what was asked, what was answered, in order. One file per working session. |
| `docs/original-plan.md` | Jeff's original notes and resource links, and what changed from them. |
| `docs/rewrite-prompt.md` | The settled design for the rewrite, written before it was built. A record, not instructions. |
| `docs/journal/<year>/<month>.md` | Exported journals, month by month. Written by `bin/rails docs:export`. |
| `docs/results/<year>.md` | Exported test battery results. Written by the same task. |
| `docs/plans/<year>/<month>.md` | Exported plans and their daily cards. Written by the same task. |

## Resuming on any computer

```
git clone git@github.com:jeffthemaximum/teddy-pe.git
cd teddy-pe
```

Then read `docs/context.md`, `docs/status.md`, `docs/architecture.md`, and the latest file in `docs/history/`. That is the complete state of the project; nothing needed to continue lives outside this repo. With an AI session: open the folder (Claude Code reads `CLAUDE.md` automatically; in Cowork, connect the folder) and it has the same context. The claude.ai Project and memory hold copies for convenience; this repo wins on any disagreement.

Working convention: changes go on a branch (`feature/...`), Jeff reviews the diff, merges to `main`, and the deploys follow from there.

## Running it locally

The API:

```
cd backend
bin/setup
bin/rails content:seed     # loads backend/content/ into Postgres
bin/rails server
bundle exec rspec          # the suite
bin/rubocop                # CI gates on this
```

The shared package and the web app:

```
cd core && npm install && npx jest
cd web  && npm install && npm run dev
cd web  && npx vitest run
```

## Environment variables

| Variable | Where | What |
|---|---|---|
| `DATABASE_URL` | Fly, `teddy-pe-api` | Postgres connection string. |
| `RAILS_MASTER_KEY` | Fly, `teddy-pe-api` | Decrypts `backend/config/credentials.yml.enc`. Without it the app will not boot. |
| `WEB_ORIGIN` | Fly, `teddy-pe-api` | The web app's origin, for example `https://teddy-pe-mlfs.vercel.app`. CORS refuses every other origin, so the site cannot sign anyone in until this is set. |
| `VITE_API_URL` | Vercel, the `web` project | The API's base URL. Compiled into the bundle at build time, so changing it needs a redeploy. |

## Deploying

The API deploys to Fly from `backend/`, by hand:

```bash
cd backend && fly deploy -a teddy-pe-api
```

`bin/rails db:prepare content:seed` runs as the release command, so that deploy is what carries a YAML edit into production. Merging to `main` does not do it. CI scans, lints and tests and never talks to Fly. Deploy from a checkout of `main`, because `fly deploy` uploads the current directory as the build context and the plan YAML ships inside the image.

The web app deploys to Vercel from `web/`, using `web/vercel.json`. Every push to `main` redeploys. That half being automatic is the trap worth knowing: the site can rebuild from the newest commit and still show old program content, because the cards come from the API's database and get there only on a Fly deploy.

## The program is private

Everything about Teddy sits behind a sign-in. There is no public page and no ungated copy: the web bundle ships no program vocabulary at all, and a test in `web/` builds the app for real and reads the built output to prove it. The API answers nothing without a token, and Pundit decides what each of the three accounts may see.

## Journals

Teddy writes his own entry and chooses whether to share it with Dad. Jeff writes one entry per session date: how it went, Teddy's energy, a pain flag, a free line, and a rating for each drill that was on that day's card. Unshared athlete entries stay out of the API's responses and out of the docs export, so writing one down is safe.

Entries save through the offline queue, so a field with no signal keeps the words and replays the write when the connection comes back. Deleting an entry is a soft delete and the next export drops it from `docs/`.

Entries produce proposed plan changes, never automatic ones. See "The coach's diary" in `docs/architecture.md` for the rules.

## Recording results

Test battery, 15 rows across five windows: baseline Sep 15 to 17, then Dec 7 to 11, Mar 1 to 5, Jun 14 to 18, Aug 9 to 13.

Type the numbers into the test sheet on the **This Week** tab. Pick the window you are recording, and each number saves as you leave the box, so it is on every device. Clearing a box deletes that result. These are the year's comparison points and most of them cannot be measured a second time.

The **Progress** panel on the Year tab draws from the same data: one card per test with the latest number, the change since baseline, and a sparkline across the windows recorded so far. Each test carries a direction, so a faster sprint and a longer jump both read as progress and a shorter dead hang reads as a regression. Height is treated separately and shows a cm/year pace, flagging the growth-load protocol from `docs/architecture.md` when growth runs fast.

## Planning a month

1. Export what has been recorded since the last plan (`cd backend && bin/rails docs:export`) and read it.
2. Read `docs/architecture.md`, especially the block's weekly themes, the day roles, and the load rule.
3. Write `backend/content/program_years/<year>/plans/<month>.yml` with the same shape as `2026-09.yml`.
4. Add entries to `backend/content/program_years/<year>/drills.yml` for any drill the new block introduces. The seeder prints the blocks where nothing matched.
5. Run `cd backend && bin/rails content:seed`. It is idempotent and reports a count per table plus anything it pruned.
6. Commit on a branch. Merging to `main` seeds production.
7. Append anything that changed direction to `docs/decisions.md`.
