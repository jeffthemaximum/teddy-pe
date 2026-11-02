# 2026-11-02: week 8, Cub Trials

**What Jeff asked.** Add workouts for this week.

## The export

Refused by the session's permission settings when it tried to read production
through `fly ssh console`. The machine was already started. Week 8 was written
from the architecture's Trials row, the Cub patch list and the week 7 cards, with
every patch and gate block written to be skipped if already earned.

## What was done

- **Week 8, Cub Trials (Nov 2 to 8)** in a new `plans/2026-11.yml`, `trials: true`.
- Half-volume cards: Mon 30 to 45, Tue 40 to 45, Wed and Thu 50 to 60, Fri 45 to
  60, Sat off, Sun quick card with the rank-up ceremony and packing for the move.
- Patch attempts by day: Coordination and Basketball Mon; Strength and Soccer Tue;
  Speed, Power & Landing, Throw & Catch Wed; Tennis and Compete & Mindset Thu;
  second tries Fri.
- Challenge: Beat a Week 1 Number (jump rope, cone weave or wall passes).
- Spec fix in `spec/services/content_seeder_spec.rb` for a third plan file.

## Checks

Local seed: 56 cards, 352 day blocks, 111 drills, no new unmatched blocks apart
from Sunday's Pack. `bundle exec rspec`: 320 examples, 0 failures.

## Still to do

Merge and deploy today: `cd backend && fly deploy -a teddy-pe-api` from `main`.
Export the diary before writing Fox week 1, and record the patches awarded.
