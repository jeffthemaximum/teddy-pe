# Working session, Monday 14 September 2026: the soft delete

Task 5 of Phase 2c. The thing Jeff asked for on the night of 13 September, owed since, and deliberately not built twice before this.

## Why it waited

Twice it was left out on purpose, for the same reason both times. An endpoint with no button gets designed against an imagined interaction. A client written against an imagined route has its test mock the call and pass while the real thing answers 404. Both journal screens exist now, so the endpoint and the button were built as one task and tested against each other.

## What Jeff decided, and was not relitigated

He and Teddy can each delete their own entries. A delete sets `deleted_at` rather than removing the row. The row keeps every word. A soft-deleted entry is excluded everywhere an unshared one is, through the same single place per layer. The export's prune becomes reachable. The repo and the database deliberately disagree: a child who deleted something did not consent to it being the memory of his year.

## What got built

**The column.** `deleted_at` on both journal tables, nullable. The unique index on `(user_id, program_year_id, session_date)` became partial on `deleted_at IS NULL`, which was not optional: that triple is what `upsert_for` addresses an entry by, so without it a deleted entry still owned its day and writing about that day again would either violate the index or reopen the deleted row and overwrite the words the delete had just promised to keep.

**One scope per model.** `AthleteEntry.kept` and `CoachEntry.kept`. The Pundit scopes apply it once above their branches, so the API and the week payload both honour it by the line that already decides sharing. Nothing writes the condition a second time beside them.

**The exporter is the deliberate exception, one level up.** An unshared entry still marks a month as lived and contributes nothing; a deleted entry must not, or the month's file would keep being written empty and the prune would never fire. So `kept` sits on the two loads that decide which entries exist at all, and the `shared` filter below still decides which of those get written down. That is what makes the prune reachable: delete the only entry in a month and the file goes.

**The endpoints.** `DELETE /api/v1/athlete_entries/:id` and the coach equivalent. `policy_scope` then `authorize`, the same two steps `update` takes, so a second delete of the same entry is a 404 rather than a second stamp and the moment the person decided stays the one on the row. They answer `{deleted: {id, session_date}}` rather than an entry envelope, because every other action on those controllers answers with the entry and a client handed that back would fold what it just deleted straight into its own state.

**The policy.** Each person deletes only their own. The coach can read an entry Teddy shared, so the scope hands him the record and `destroy?` is the only thing between him and deleting his son's writing. There is a spec that reads it as him first, so the refusal is proven to be the policy rather than an entry he could never see.

**`core/`.** A `deleteEntry` action, a saga worker and one reducer case. On the public surface, narrowed the way every other duck is: `deleteEntry` is there because a person taps it, `entryDeleted` is not.

**The button.** On both journal screens, only on an entry the signed-in person owns and only on one the server actually has. Teddy's screen is open to Jeff as well, and what he sees there is whatever Teddy shared with him, so it offers him no delete control.

## The two decisions worth arguing with

**A delete queues offline, under the same dedupe key a save for that day uses, and is honoured locally straight away.** It queues because a delete is a write and the outbox exists so a write made with no signal is still owed. It shares the key because the outbox keeps only the last queued write per key, so an edit made offline and then deleted is replaced rather than racing the delete on one row. And the entry leaves the app's state the moment the write is queued rather than when the server answers, because he asked for it gone and showing a child the words he just took back, with no way to tell whether the app heard him, is the wrong direction to fail in. If the replay is refused for good, the server still has the row and the next fetch puts it back.

**The button confirms, in two steps, in the page.** It is the only control on a 7-year-old's screen that removes his own writing, it cannot be undone from there, and it sits on the same page as Save. So it lives outside the form and last on the page, the confirm is a different button in a different place from the one that opened the question, and "Keep it" comes first. A `window.confirm` was the alternative and it is a wall of adult text in a box a child has no reason to trust, as well as a global that a test can only check by stubbing the same thing the code calls.

## Found while building

- **The coach journal could not have seen a queued delete.** Its is-it-queued check read a session date out of a queued write's request body, and a delete has no body at all. It would have said "nothing is queued" for exactly the write a person most needs told about. It now reads `selectIsEntryQueued`, which matches the dedupe key every journal write carries.
- **`core/`'s exact-set surface test never looked inside a narrowed namespace.** It asserts the names `index.ts` exports, so `journalActions` gaining or losing an action changed nothing either assertion read, which is the whole of what the narrowing is. That object now has its own exact set, written by hand.

## How it was tested

Every "a deleted entry does not appear" spec uses two entries and deletes one, because an empty result looks identical whether the filter picked the right row or removed everything it was given. The read-path specs set `deleted_at` straight onto the row through a factory trait rather than through the endpoint or the model method, so they are not asserting the hiding against the code that hides. The request shapes in `core/` are transcribed by hand from the controllers and `routes.rb`.

Both directions were checked by breaking them: neutering `kept` fails 13 of the new backend specs, opening `destroy?` fails the spec that refuses the coach, and dropping the role check on Teddy's screen fails the one that offers Dad no delete.

The two packages were then checked against each other rather than against an idea of each other. The path strings `core/` builds, `/api/v1/athlete_entries/77` and `/api/v1/coach_entries/77`, were handed to the real Rails router, which recognises both as `destroy` on their own controllers. An end-to-end test in `core/` drives the real store and the real sagas with only `fetch` mocked, and asserts the URL and the method that actually go out.

## The one thing that came back for a fix

A queued delete that 404s on replay was reported with the words a refused save gets: "That entry did not save." The realistic cause of that 404 is the row already being gone, which is what the delete asked for. Teddy deletes an entry at a court with no signal, it queues, the replay fires at home, the row is already gone, and he is told his entry did not save about a delete that worked perfectly.

Two fixes were considered and both declined. Threading the method through the outbox's failure action for the journal's benefit puts journal semantics in a duck that must not know what a journal is. Giving deletes their own key prefix gives up the dedupe the whole design rests on.

The fix taken is that the replay path applies the same rule the live path already applied: a 404 in response to a DELETE means the thing is gone, so the write succeeded. That is a property of DELETE rather than anything about journals, and the queued action already carries its own `request.method`, so the outbox can see it is a delete without knowing what was deleted. Everything else keeps its behaviour: a 404 to anything else is still a permanent rejection, a 401 still stops the queue and signs out, and offline still leaves every write where it is.

Two fixtures, because a single queued delete that 404s proves nothing on its own: the queue empties whether the write was treated as a success or dropped and forgotten. One asserts the duck that queued it is told it succeeded and is not told it failed; the other asserts a 404 to a POST is still permanent. Proved by widening the rule to every 404 regardless of method and watching the POST test fail.

## Left open

- Nothing recovers a deleted entry from inside the app. That is deliberate and it is Jeff's console.
