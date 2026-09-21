# 2026-09-21: this week's card was a sketch, and so was next week's

**What Jeff asked.** "This week's activities seem incomplete, can you see what's
needed."

## What was wrong

`backend/content/program_years/2026-27/plans/2026-09.yml` held three weeks. Week 1
was written in full on 14 September. Weeks 2 and 3 had never been finished:

| Week | Days | Blocks per day | Dad note |
|---|---|---|---|
| 1 (Sep 14-20) | 7 | 7 to 11 | all 7 |
| 2 (Sep 21-27) | 7 | 0 | none |
| 3 (Sep 28 - Oct 4) | 7 | 0 | none |

Every day of both weeks had a name, a role, a minutes range, an intensity, an
`hie` number and four to six summary lines. None had the `blocks` array, which is
the session itself: the timed pieces, the prose, the rep counts, the cues.

The app was doing the right thing with what it had. `TodayCard.tsx:81` and
`DayCard.tsx:61` both render blocks only when a day has them, because Game Day is
a real card with two blocks and Saturday needs to say so. So Today on 21 September
showed the role, the minutes, the theme and four bullets, and stopped.

Three things went with it:

- **No drill was tappable all week.** `drill_slugs` are tokenized out of block
  prose by the seeder, so a day with no blocks links to nothing in the glossary.
- **The Notes page had no ratings to collect.** Its rating chips are built from
  that day's drill slugs, which is the work `feature/notes-drills-by-day` did on
  14 September. A sketch week gives it an empty list.
- **The export recorded the week as bullets.** `docs_exporter.rb:216` writes
  blocks where they exist and falls back to summary lines where they do not, so
  this repo's memory of the week would have been the sketch.

## What was done

Both weeks written in full, in the shape of week 1: 7 or 8 blocks a day, a dad
note on every card, cues in Teddy's language, minutes summing inside each day's
declared range.

Week 2, Stick It: 30cm box landings to 10 of 10, cartwheel step 2 both sides,
rings to 5 passes, a 10-in-a-row wall pass streak each foot, drop feeds and a
15-ball rally, jump stop and pivot, keeper scoop and W-catch, and a Sunday patch
check on Power & Landing.

Week 3, Brake: the 3-step stop at jog speed on Monday and at sprint speed on
Wednesday, cartwheel step 3, split step into a shuffle in front of every drop
feed, step-and-throw 10 of 10 both arms, defensive slides, keeper set position on
Dad's cue, and a Sunday patch check on Speed.

The rulings are in `docs/decisions.md` under today's date. The one worth naming
here: week 2's challenge was Broad Jump & Stick attempted Monday and Friday, and a
maximal broad jump is a high-intent effort on a day the rules give zero. It is now
Statue Stick, which costs nothing and is the week's own sub-target, and the broad
jump became Wednesday's challenge block on the day already built for it. Week 3
had the same collision in one word, and "Sprint on green" became "Run on green".

## Verification

- `bin/rails content:seed`: 21 day cards, 139 day blocks, up from 51. The bare
  block report is back to the four kinds week 1 also leaves bare: `Test: Height`,
  `Play`, `Home program`, `Review`.
- `bundle exec rspec`: 320 examples, 0 failures. Two tests replace the one that
  asserted week 2 had no full cards. The second is new and holds the load rules
  across every week: inside the budget, zero on Monday and Sunday, 5 or fewer on
  Friday. Nothing asserted the budget before today.
- `bin/rails docs:export` rewrote `docs/plans/2026-27/2026-09.md` from the seeded
  content.

## Still open

- **The export against production did not run.** `CLAUDE.md` asks for
  `bin/rails docs:export` before planning, and the journal and the results live in
  the Fly database. Both routes to it, reading `DATABASE_URL` off the machine and
  running the task on the machine, were refused by this session's sandbox as
  production reads. `docs/results/2026-27.md` in the repo still shows an empty
  baseline column, which is either a stale export or a baseline that was never
  typed in. Jeff confirmed the numbers should be in production, so the file is
  stale and the export is owed.
- **The `hie` numbers are still Claude's.** Unchanged from the sketches at 39 of
  40 in both weeks, and still the open item the Phase 1 gate left.
- **This needs a deploy to reach Teddy.** The cards ship inside the image and the
  release command seeds them:

  ```bash
  cd backend && fly deploy -a teddy-pe-api
  ```

  Run from a checkout of `main` after merging. The Fly app was on v10 as of
  09:21Z today.
- **The local Ruby cannot boot without help.** Homebrew has replaced `zlib` with
  `zlib-ng-compat` and `/opt/homebrew/opt/zlib/lib/libz.1.dylib` is gone, so
  `bin/rails` dies in `config/boot.rb`. Everything above was run with
  `DYLD_LIBRARY_PATH=/opt/homebrew/opt/zlib-ng-compat/lib` and by invoking
  `ruby ./bin/rails` and `ruby -rbundler/setup -S rspec` directly, because SIP
  strips `DYLD_*` from anything launched through `/usr/bin/env`. Nothing on the
  machine was changed to work around it. A symlink at `/opt/homebrew/opt/zlib` or
  a Ruby rebuild is the real fix, and it is Jeff's machine and Jeff's call.
