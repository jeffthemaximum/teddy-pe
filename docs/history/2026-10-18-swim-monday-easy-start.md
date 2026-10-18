# 2026-10-18: swim Monday, gymnastics Tuesday, and an easy start to week 6

**What Jeff asked.** Two updates. Swim and gymnastics have switched days going
forward (swim Monday, gymnastics Tuesday), and the schedule should handle it on
every week from here. And Monday and Tuesday of this coming week should be slower
and more play based, because everyone is tired from the weekend.

## What was done

- `program.yml` day roles: Monday's organized activity is Swim, Tuesday's is
  Gymnastics, with the role notes rewritten to match.
- `docs/architecture.md`: the organized schedule table swapped, plus a paragraph
  on what the switch changes (Tuesday short on hangs and inversions, Wednesday
  watching for heavy landings after gym). `docs/context.md` updated.
- Week 6, `plans/2026-10.yml`: Monday 19 October rewritten as "Easy Hips" (60
  minutes, play first, zero high-intent efforts) and Tuesday 20 October as "Swing
  and Hook" (75 minutes, light and playful, Throw Far kept). Wednesday's dad note
  mentions gymnastics the day before. The reasoning is in `docs/decisions.md`.

## What was tried and changed

Throw Far was first moved to Wednesday to leave Tuesday with almost no efforts.
The content spec failed it: the early Challenge attempt has to be on Monday or
Tuesday. It went back to Tuesday as 4 throws.

## Checks

`bin/rails content:seed` locally: 42 cards, 281 day blocks. `bundle exec rspec`:
320 examples, 0 failures.

## Still to do

Merge, then deploy from `main` before Monday morning:
`cd backend && fly deploy -a teddy-pe-api`.
