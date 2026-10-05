# 2026-10-05: week 4 cards, Upside Down

**What Jeff asked.** "Can you generate cards and training sessions for this
week." Monday 5 October, the first day of Cub week 4.

## What was there

Week 4 was a row in the architecture's Cub theme table: Upside Down, with six
sub-targets (wall handstand 5s, cartwheel with straighter legs, rings inversion
with spot, forehand finish over the shoulder 10 of 10, basketball figure 8 eyes up
10 each way, soccer sole rolls and pull-backs) and Hang Time, a dead hang PR, as
the Challenge of the Week. No `2026-10.yml` existed, so Today had nothing to show.

## The export did not run

`docs:export` against production comes first, so the plan can read the diary.
The Fly machine was stopped, and starting it to read production was refused by
the session's permission settings. The cards were written without the diary
ratings from 18 September onward. Everything that a rating would have moved is
written conservatively and listed in `docs/decisions.md` for 5 October.

## What was done

- **`backend/content/program_years/2026-27/plans/2026-10.yml`:** week 4, seven
  cards, 46 blocks, a dad note on every day.
  - Mon, Feet in the Sky, 83 min, 0 HIE: Hang Time first, cartwheel step 4,
    donkey kicks and wall handstand, basketball figure 8 and 200 dribbles, the
    floor handles and pass through.
  - Tue, Upside Down on the Rings, 80 min, 6 HIE: rings passes and the spotted
    inversion, strength, soccer receive and return then sole rolls and
    pull-backs, about 300 touches.
  - Wed, Fast Feet, Upside Down, 108 min, 22 HIE: cartwheel and handstand first,
    6 clap starts to a 3-step stop, box sticks, single-leg hops, 3 broad jumps,
    pull-backs at speed, soccer game.
  - Thu, Finish High, 116 min, 6 HIE: the forehand finish target in sets of 10,
    rally to 20, basketball figure 8 and footwork, pass through, spider move and
    clap tap. No dead hangs, to keep Friday's grip fresh.
  - Fri, Skate & Hang, 107 min, 3 HIE: Hang Time round 2, skate park, keeper set
    position and catching, the week's handstand number.
  - Sat off. Sun, 38 min, soccer Sunday: patch check on Strength, preview of
    Skip & Bound.
- **Glossary:** `cartwheel-step-4` and `rings-inversion`. 93 drills.
- **Architecture:** the Cub coordination line now names step 4, the wall
  handstand holds and the rings inversion.
- **Specs:** three assumed one plan file and now read the directory.

## Verification

- `bin/rails content:seed`: 28 day cards, 189 day blocks, 93 drills, 2 month
  plans. The only week 4 blocks with no drill link are Wednesday's and Friday's
  Play and Saturday's Home program, the same kinds every week leaves bare. Three
  blocks were reworded after the first seed so they link the right entry: the box
  sticks to `stick-landing`, Thursday's tennis to `finish-over-the-shoulder`, and
  Friday's keeper block to `keeper-ready-position` rather than the tennis
  `ready-position`.
- `bundle exec rspec`: 320 examples, 0 failures.
- `docs/plans/2026-27/2026-10.md` written from the exporter's plans half only,
  against the local database. September's prose is unchanged.
- Same local Ruby workaround as before (`DYLD_LIBRARY_PATH` at `zlib-ng-compat`).

## Still open

- **Needs a merge and a deploy today, or Today stays empty this week.** From a
  checkout of `main`: `cd backend && fly deploy -a teddy-pe-api`.
- **The export is owed.** Run `bin/rails docs:export` after the deploy and read the
  weeks 2 and 3 diary entries. Anything rated owns it three sessions running is a
  proposal against this week's cards.
