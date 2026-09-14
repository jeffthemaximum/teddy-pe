# Working session, Monday 14 September 2026: the delete a share tap could undo

A Critical and a related Important off the Phase 2c review, plus a Minor sitting on the same path and one test that had been passing for the wrong reason.

## What was asked

Fix the Critical the reviewer traced against a real store: deleting an entry offline and then tapping share gives it to Dad. Fix the Important beside it: `AthleteJournal` still guesses whether a save is queued. Decide what to do about the Minor: a 404 on a replayed delete never takes the entry out of the slice, though the function's own comment claims it does.

## The Critical, as it actually happened

Teddy deletes an entry at a court with no signal. The delete queues. The share toggle stays rendered and enabled even though the entry has left the slice, so he taps it. The toggle's own save queues under the same dedupe key the delete used, the outbox keeps only the last write per key, and the save replaces the delete. When the connection comes back the replay upserts the still-kept row to `shared: true` with the words blanked out, and a day he deleted appears in his dad's payload.

Both decisions that produced this were right on their own and both are in `docs/decisions.md`. The shared key exists so an edit made offline and then deleted is replaced rather than racing the delete on one row. Keeping the row exists so his words survive. In the reverse order they cancel.

## What got built

**The duck half.** The outbox's collapse rule is now asymmetric, read off `request.method` and nothing else, which is the same HTTP-level fact the replay worker's 404 rule already reads and the only thing a duck-agnostic reducer is allowed to act on.

- save then delete: one delete, unchanged.
- delete then save: a delete and a save, in that order.

The server takes both. The unique index on each entry table is partial on `deleted_at IS NULL` and `upsert_for` looks through `kept`, so the delete frees the day and the save starts a new row. Giving deletes their own key prefix was considered again and declined again for the reason already recorded: it would buy this ordering by giving up the other one.

Two things follow from a key being able to hold two writes. The collapse looks for the **last** write under a key rather than the first, so an edit made after a delete belongs with the save behind it rather than the delete in front of it. And `QUEUE_RESTORED` takes the same rule, so a save typed while the read of storage was still open cannot discard a delete that read brings back. The journal's own carry-forward lookup for the share toggle reads the last write for the day too.

**The screen half.** `journalSelectors.selectIsDeleteQueued(side, date)` asks whether the last write queued for a day is a delete. The screen cannot work that out for itself: a queued delete and a queued save of a day the server has never seen both leave no entry in the slice and one write in the queue, so they look identical from outside. A day that answers yes gets no form, no toggle and no Save, and two lines instead. Saying nothing would look exactly like a day he has not written in yet, which is the one thing it must not look like. The notice sits ahead of the loading and hydration branches, so reopening the screen offline answers him about the day he took back rather than with a fetch error.

**The Minor, made true rather than corrected.** `outbox/REPLAY_SUCCEEDED` now carries the write's `method` beside its `dedupeKey` and `response`. A replayed DELETE answered 404 got the state it asked for and resolves with no body at all, so the journal had nothing to read as a delete, dropped it as unreadable, and left the entry sitting on screen. This is not the move declined when the 404 rule was first written: no journal semantics enter the outbox, which forwards `request.method` verbatim the same way it already forwards a response it never looks inside.

**The Important.** `AthleteJournal`'s waiting-to-send line was inferred from `saving` clearing with the entry unchanged. That is true of a queued write and of a write the server threw away alike, so a permanently rejected save told a 7-year-old his words were saved on his device with the outbox empty. It reads `selectIsEntryQueued` now, the same line `CoachJournal` was moved onto when the soft delete was built.

## The test that was passing for the wrong reason

`athlete-journal.test.tsx` asserted `felt`, `best`, `hard` and `note` out of the save payload and never `shared`, so a screen sending `shared: true` on every save passed all 22 tests in the file. It is the single assertion that guards the promise the whole screen exists to keep. It is asserted now from three fixtures that disagree with each other: an empty day saves unshared, an entry Teddy kept to himself stays unshared, and one he had shared stays shared. The expectation comes from the fixture the store was seeded with, never from anything the screen computed.

Two more in the same file were the same shape. The fixture proving a queued write said so dispatched `SAVE_QUEUED` with nothing in the outbox, and passed only because the screen was watching for "nothing changed"; it enqueues a real `QueueableAction` now. And it has a partner that drives that write off the queue with a permanent rejection and checks the message goes away, which is the failure the Important is about.

## How it was tested

Every new assertion was checked against a deliberately wrong implementation before being kept.

- Collapse always: the three new reducer fixtures and the delete-then-save end-to-end test fail.
- Collapse never: the two save-collapse fixtures, the delete-replaces-an-edit fixture and the older share-before-send test fail.
- First matching write instead of last: the two-saves-behind-a-delete fixture fails, and nothing else does.
- No `method` on `REPLAY_SUCCEEDED`: the two 404 fixtures fail.
- No deleted-day branch on the screen: the ordering test and the delete-is-waiting test fail.
- The old waiting-to-send guess: the new permanent-rejection test fails and the old one passes, which is exactly why the old one was not enough.
- `shared: true` always: the empty-day save and the unshared-entry save fail. `shared: false` always: the shared-entry save fails.

The ordering that broke is proven on the screen, through the real store and the real sagas with only `fetch` mocked: delete offline, find nothing to share, let the replay run, and one request leaves the device. It is the delete, no row is created, and nothing that went out mentions sharing at all.

Suites after: `core/` 257, `web/` 237, `backend/` 249, all green. Two commits on `feature/rails-react-rewrite`.

## After the report: the seam nobody owned

The coordinator found one thing that had fallen between this task and the one that fixed the route roles, and verified it rather than assuming it.

That task left `/journal` open to both roles, correctly: `athlete_entries#index` answers a coach 200, so Jeff can read what Teddy shared. It then recorded that the live write controls were a within-screen concern belonging to `AthleteJournal.tsx`. This task gated the **delete** on `role === "athlete"` and gated the form, the Save button and the share toggle on nothing at all. Jeff signed in, opened `/journal`, and got a live textarea, a live Save and a button reading "Let Dad see this". All three 403 at the API and the last is the app telling Dad about Dad. The comment in this file describing the situation stopped one line short of acting on it.

**What Jeff gets now.** A heading carrying the athlete's name, read from `/api/v1/me` at runtime and never written into the file, because a name typed into a heading is shipped in the bundle to everyone who loads the site. A line under it saying what the page is. A shared day laid out as four labelled things to read, his son's questions read back as labels rather than asked again. And nothing to press: no form, no Save, no toggle, no delete, proven by role rather than by label so a control added later under a different name is caught too. The branch is `role !== "athlete"` rather than `role === "coach"`, so the page with nothing on it is the default.

**The half that matters.** A day Teddy kept to himself renders exactly the same markup as a day he never wrote. There is one empty message and one branch, and the line explaining what the page is stands whether or not there is an entry, so its presence carries no signal either. The screen also drops an unshared entry itself rather than trusting the Pundit scope, because the journal slice is fed by the week payload's inline `athlete_entry` as well as by the index endpoint, so a serializer that ever leaked one would land it here with nothing else in the way.

The fixture seeds the unshared entry into the store rather than filtering it out on the way in, and compares the rendered markup byte for byte against the never-written render. A screen printing "nothing shared today" beside "nothing written today" fails both new tests; a screen that stopped dropping the unshared entry fails the first. `web/` is 244 after it.
