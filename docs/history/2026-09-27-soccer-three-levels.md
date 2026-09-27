# 2026-09-27: three levels for the soccer receive and return

**What Jeff asked.** "Can you watch this video and then add the three levels to
the soccer activities going forward?" The video was an Instagram reel from
`@_coachjoel`, also saved as a screen recording on his desktop.

## Watching it

The screen recording is 21.6 seconds, 444×960. There was no ffmpeg on the
machine, so frames came out through a short AVFoundation script in Swift, at 4
and then 8 frames per second, laid out as timestamped contact sheets. The
recording starts partway through the reel's loop: Level 2, then Level 3, then
Level 1. The reel's caption has no instructions ("Save This Drill & Follow",
booking details), and the audio is music, so the levels were read from the
footage alone.

What the footage shows: two flat green cones a stride apart, a coach kneeling a
few metres away off to the side, rolling the ball in, and a 7 year old controlling
it just behind the cones and passing it straight back to the coach's hands. The
next ball comes in as soon as the last one lands.

- Level 1: control with one foot, pass back. Two touches.
- Level 2: the ball stopped under the sole, then passed back.
- Level 3: sole stop, then sole touches with alternating feet, then the pass.

## What was done

- **Glossary:** a new `receive-and-return` entry in `drills.yml` with the setup,
  all three levels, the 8-of-10-per-foot bar, what to watch for, a cue ("Catch
  it, squash it, send it home") and the reel as its video link. 85 drills.
- **Week 3 cards:** Tuesday 29 September's soccer block opens with the three
  levels. Wednesday 30 September adds Level 2 with firmer feeds after the Red
  Light dribble. The summary lines and Tuesday's dad note say so. Minutes and
  `hie` are unchanged.
- **Architecture:** the soccer section now describes the three levels and how
  they run from week 3 onward, so the October plan and later months carry them.
- **`drills_spec.rb`:** counts against the YAML instead of the number 84.

## Verification

- `bin/rails content:seed`: 85 drills, 21 day cards, 140 day blocks. The new drill
  links on both soccer blocks: Tuesday
  `["receive-and-return", "sole-rolls", "touch-then-pass", "toe-taps", "tick-tocks"]`,
  Wednesday `["cone-gate", "receive-and-return"]`. No new bare blocks.
- `bundle exec rspec`: 320 examples, 0 failures after the spec change. The one
  failure before it was the hardcoded 84.
- `docs/plans/2026-27/2026-09.md` was rewritten by calling only the exporter's
  plans half against the local seeded database. A full `docs:export` locally
  would have written the journal and results from a database that does not hold
  production's entries.
- Same local Ruby workaround as 21 September (`DYLD_LIBRARY_PATH` pointed at
  `zlib-ng-compat`).

## Still open

- **The read of the levels is Claude's.** Jeff watched the reel; if Level 1 or
  Level 3 looked different to him, the glossary entry and Tuesday's block change
  with it.
- **Needs a deploy before Tuesday.** Merge, then from a checkout of `main`:
  `cd backend && fly deploy -a teddy-pe-api`.
