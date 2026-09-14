import { createSelector } from "@reduxjs/toolkit";
import type { AuthState } from "../auth/reducer";
import type { OutboxState } from "./reducer";

interface WithOutbox {
  outbox: OutboxState;
}

// The queue is read against auth as well as its own slice, because "whose
// write is this" only means anything next to "who is signed in".
interface WithAuthAndOutbox extends WithOutbox {
  auth: AuthState;
}

// Every queued write, whoever typed it. Deliberately not on the package's
// public surface (see src/index.ts): this exists for the one job that
// genuinely owns the whole queue, which is writing it to storage. Storage
// belongs to the device, not to the session, so persisting only the signed-in
// person's writes would erase Teddy's queued words the first time Jeff's
// session saved the queue.
export const selectAllQueuedWrites = (s: WithOutbox) => s.outbox.queue;

const selectSignedInUserId = (s: WithAuthAndOutbox) => s.auth.user?.id ?? null;

// The queue as the signed-in person may see it, and as replay may send it.
// A queued write holds the raw words Teddy typed, in plaintext, and it
// outlives his session on purpose. Filtering here rather than at each
// caller is what makes that safe: a pending-writes screen, a sync indicator
// and the journal's own carry-forward lookup all read through this, so none
// of them has to remember, and a write with no recorded author (see
// types.ts) belongs to nobody and is shown to nobody.
//
// Memoized because it builds a new array: an unmemoized filter handed to
// useSelector returns a fresh reference on every dispatched action and
// re-renders whatever reads it, every time.
export const selectQueue = createSelector(
  [selectAllQueuedWrites, selectSignedInUserId],
  (queue, userId) => queue.filter((w) => w.userId === userId),
);

export const selectReplaying = (s: WithOutbox) => s.outbox.replaying;

// What a sync indicator counts down. The signed-in person's own writes, for
// the same reason selectQueue is scoped: a count that included Teddy's
// queued note would tell Jeff something is pending that he can neither see
// nor send, and would never reach zero for him.
export const selectPendingCount = (s: WithAuthAndOutbox) => selectQueue(s).length;
