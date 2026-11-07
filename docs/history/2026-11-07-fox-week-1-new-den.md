# 2026-11-07: Fox week 1, New Den, and four soccer moves

**What Jeff asked.** Add kangaroo, Tazmanian devil, lizard and scissors as soccer
activities; generate next week; and say (without generating it) when the next
assessment day is.

**Answered.** Retest 1 is Monday 7 to Friday 11 December, Fox week 5: the full
battery plus height.

## The export

Declined by Jeff. Few diary notes exist; Teddy is doing strong on everything.

## What was done

- Nine glossary entries, the four moves in Jeff's descriptions.
- Fox week 1 (Nov 9 to 15) in `plans/2026-11.yml`, week 9, `block: fox` via the
  month; week 8 now carries `block: cub`.
- `ContentSeeder` reads an optional per-week `block`; spec added.
- Architecture: the four moves under Soccer, and a Fox weekly themes table.

## Checks

Local seed: 63 cards, 393 day blocks, 120 drills. `bundle exec rspec`: 321
examples, 1 failure, `spec/rails_version_spec.rb`, which was set to fail on
2026-11-07 because Rails 8.0 is out of security support. Not caused by this
branch; the Rails 8.1 upgrade is owed.

## Still to do

Merge, then from `main`: `cd backend && fly deploy -a teddy-pe-api` before
Monday 9 November. Rails 8.1 upgrade.
