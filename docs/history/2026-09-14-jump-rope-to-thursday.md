# Working session, Monday 14 September 2026: the jump rope test moves to Thursday

## What was asked

No jump rope in the house this week. Move the jump rope test off Tuesday to Wednesday, Thursday or Friday.

## What was answered

Thursday 17 September, and the reason it was not a free choice is the baseline window.

`docs/architecture.md` sets the battery's baseline at Sep 15-17. Friday is the 18th, so putting it there would have recorded one of the ten tests outside its own window and meant changing that line. Thursday keeps the battery whole and needs no doc change at all.

Wednesday was inside the window and still wrong. It is the only high-impact home day and already carries the 20m sprint, the broad jump, the single-leg hop and the line-touch. Jump rope is repeated jumping, and adding it there piles jump volume onto the one day the effort rules protect.

Thursday is Wall Day. Its dad note already read "high-intent efforts stay near zero today", which is the description of a day with room for an 8-minute rhythm test. The rope goes in second, right after Wake Up, so it is measured fresh rather than after 30 minutes of drop-feed tennis.

## What got built

One file of content, `backend/content/program_years/2026-27/plans/2026-09.yml`, and the two specs that were pinned to Thursday's card.

- Tuesday loses the 8-minute block and the words "jump rope" from its summary line. Blocks drop from 86 minutes to 78, still inside the 75 to 90 that Rings Day is fixed at, so its declared range is unchanged.
- Thursday gains the block at position 1, a summary line, and a range of 115-125 to match its 125 minutes of blocks.
- Thursday's dad note opens with what to watch on the rope: a practice minute to find the rhythm before the three counted tries.
- `hie` is untouched on both days. A rope test is rhythm and coordination, not a high-intent effort, so the week still spends 28 of its 40.

The seeder printed `pruned day_blocks: 1` when it ran, which is Tuesday's block leaving, reported rather than done quietly. `bin/rails docs:export` then rewrote `docs/plans/2026-27/2026-09.md`, and its diff is exactly the move: one line off Tuesday, one line onto Thursday, the minutes, and the dad note.

## The specs

Two were already pinned to Thursday's real content and failed honestly: a block count of 9 and a dad note starting "Form over volume". Both were updated to the new truth, along with the test-tagged block count, which went from 2 to 3.

One was added, because nothing yet guarded the thing Jeff actually asked for. It asserts the rope is on Thursday **and** absent from Tuesday. A one-sided check would pass a card that gained the test while Tuesday kept it, which is the failure that would matter: the same test twice in one week. It was run against the old content before being kept, and failed there on the line it was written for.

`backend/` 306 examples, 0 failures.

## A note on where this landed

The Phase 3 cutover merged the same afternoon (PR #21), so the old JSON pipeline and `build.py` are gone and `backend/content/` is the only place a day card lives. Jeff had already answered "just the new data" before that was visible in this session, and it turned out to be the only option rather than a preference.
