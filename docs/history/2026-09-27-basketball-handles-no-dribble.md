# 2026-09-27: six no-dribble handle drills for basketball

**What Jeff asked.** "Add these drills and progressions to the basketball
program. Add them as additional volume, don't remove anything else. Also, please
confirm with me that your descriptions of each drill are correct." The video was
a 55 second screen recording of the "U10 Handle Foundation" reel by
@skillsacademy12.

## Watching it

Frames came out through the same AVFoundation script as the soccer reel that
morning: a 1 per second overview, then 4 per second contact sheets for each drill.
The reel names its drills on screen, under a title card reading "This is where
handles begin: 6 drills, no dribbling": 1 Touch Roll, 2 Pass Through, 3 Figure 8
Roll, 4 Spider Move, 5 Clap Tap, 6 Ball Glide Roll. Pass Through, Figure 8 Roll
and Spider Move each have a "Backward" segment.

## Confirming the descriptions

Having got the soccer levels wrong that morning, Claude sent Jeff all six
descriptions before editing anything, and flagged the three it was least sure of.
Jeff corrected two:

- **Clap tap.** Claude read it as fingertip tipping the ball hand to hand from the
  waist to overhead. Jeff: walking while holding the ball, drop it, clap above it,
  recatch it.
- **Spider move.** Claude read it as hands alternating taps in front of and behind
  the legs, with the ball low. Jeff: holding the ball between the legs and walking,
  drop it, take a step, recatch it between the legs.

The other four stood as described.

## What was done

- **Glossary:** six entries in `drills.yml`, 91 drills. Backward is a step in the
  three drills that have it.
- **Week 3 cards,** each a new block beside the day's existing basketball work:
  - Mon 28 Sep, 10 min: touch roll, figure 8 roll, ball glide roll.
  - Thu 1 Oct, 5 min: touch roll recap, pass through 2 × 10m.
  - Sun 4 Oct, 5 min: first try at spider move and clap tap, 10 catches each.
- **Architecture:** the basketball section describes all six drills, the order,
  and how they run from week 3 onward, so October and later months carry them.
- **Thursday's size** was the one question Jeff did not answer. It was already at
  115 of 100 to 120, so the block is 5 minutes and the day sums to 120.

## Verification

- `bin/rails content:seed`: 91 drills, 143 day blocks (up 3), no new bare blocks.
  The first seed linked Monday's block to `sole-rolls` and `figure-8` as well, off
  the words "rolls" and "figure 8s". Reworded, the three blocks now link exactly:
  Monday `touch-roll, figure-8-roll, ball-glide-roll`, Thursday
  `touch-roll, pass-through`, Sunday `spider-move, clap-tap`.
- Day sums in week 3: Mon 86 (60 to 90), Thu 120 (100 to 120), Sun 43 (30 to 45).
- `bundle exec rspec`: 320 examples, 0 failures.
- `docs/plans/2026-27/2026-09.md` rewritten from the plans half of the exporter
  only, as that morning.

## Still open

- **Needs a merge and a deploy before Monday 28 September**, from `main`:
  `cd backend && fly deploy -a teddy-pe-api`.
- The reel's URL, if Jeff wants it in the six entries' video field.
