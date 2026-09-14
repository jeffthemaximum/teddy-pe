import * as t from "./actionTypes";
import * as authTypes from "../auth/actionTypes";
import type { AuthAction } from "../auth/actions";
import type { OutboxAction } from "./actions";
import type { QueueableAction, QueuedWrite } from "./types";

export interface OutboxState {
  queue: QueuedWrite[];
  replaying: boolean;
  // Who is signed in, mirrored from the auth slice. A reducer cannot read
  // another slice, and stamping a write with its author has to happen in the
  // same tick the write is queued (see types.ts), so the one fact this
  // reducer needs from auth is kept here and updated by auth's own actions,
  // which every slice reducer sees. It is a mirror and never a second
  // opinion: everything that asks "who is signed in right now" for a
  // decision asks the auth slice. __tests__/outbox-reducer.test.ts walks
  // every auth action there is through both reducers and fails if the two
  // ever disagree.
  signedInUserId: number | null;
}

const initialState: OutboxState = { queue: [], replaying: false, signedInUserId: null };

// Time plus a counter, not a random string: unique across a run without
// reaching for a platform crypto API this package cannot assume every
// runtime provides (the whole point of touching no platform globals).
let counter = 0;
function makeId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

// Whether this session still has writes of its own to send. Not "is the
// queue empty": Teddy's queued note stays in the queue for as long as it
// takes him to sign back in, and a spinner on Jeff's screen must not wait
// for it.
function stillOwing(queue: QueuedWrite[], userId: number | null): boolean {
  return queue.some((w) => w.userId === userId);
}

// Read off `request.method` and nothing else, the same HTTP-level fact the
// replay worker's 404 rule already reads (see sagas.ts), and for the same
// reason: no duck's semantics can live in this file, because nothing here
// can tell a journal entry from a test result.
function isDelete(action: QueueableAction): boolean {
  return action.request.method === "DELETE";
}

// Whether a write arriving under a key may take the place of the write
// already queued under it, or has to queue behind it.
//
// Collapsing is the rule almost everywhere: three edits of one day are three
// requests for one outcome, and only the last should go. A delete is the one
// write a later save must not swallow, and the two orderings are not
// symmetric.
//
//   save then delete: one delete. He typed a day and then took it back.
//   Sending both would be an upsert and a delete racing on one row, and the
//   entry would come back if they ever replayed the other way round.
//
//   delete then save: a delete AND a save, in that order. The server
//   supports it, because the unique index on both entry tables is partial on
//   `deleted_at IS NULL`: the delete frees the day, so a new row can be
//   created for it. Collapsing this way round loses the delete, the
//   still-kept row is upserted straight back on replay with whatever the
//   save carried, `shared` included, and a day Teddy deleted with no signal
//   turns up in his dad's payload.
//
// Written as one asymmetric rule rather than by giving deletes a dedupeKey
// prefix of their own. A separate prefix would make the two orderings
// independent, and would buy the second case by giving up the first: an edit
// and a delete of one day would stop collapsing at all.
function supersedes(incoming: QueueableAction, existing: QueueableAction): boolean {
  return isDelete(incoming) || !isDelete(existing);
}

// The last write queued under this key by this person, or -1. The last, not
// the first: a key can now hold a delete with a save queued behind it, and a
// further edit of that day belongs with the save, never with the delete in
// front of it.
function lastIndexForKey(queue: QueuedWrite[], dedupeKey: string, userId: number | null): number {
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const w = queue[i]!;
    if (w.action.dedupeKey === dedupeKey && w.userId === userId) return i;
  }
  return -1;
}

export function reducer(
  state: OutboxState = initialState,
  action: OutboxAction | AuthAction | { type: string },
): OutboxState {
  switch (action.type) {
    case t.ENQUEUE: {
      const incoming = (action as Extract<OutboxAction, { type: typeof t.ENQUEUE }>).payload;
      // Matched on author as well as key. `athlete:2026-09-17` is one key
      // per day, not one key per day per person, and the schema already
      // allows a second athlete: letting one person's write collapse into
      // another's would destroy the first person's words in the name of
      // deduping them.
      const idx = lastIndexForKey(state.queue, incoming.dedupeKey, state.signedInUserId);
      // `supersedes` is what keeps a queued delete from being swallowed by a
      // save for the same day. Without it, Teddy deleting an entry with no
      // signal and then touching that day again replaced the delete in place,
      // and the row he had asked to be gone came back on replay.
      if (idx >= 0 && supersedes(incoming, state.queue[idx]!.action)) {
        // Same logical write, edited again. Keep its place and its id, but
        // replace the content and reset attempts: the last edit is the one
        // that should reach the server, not the first, and it hasn't failed
        // yet in this new form.
        const existing = state.queue[idx]!;
        const write: QueuedWrite = {
          id: existing.id,
          action: incoming,
          queuedAt: existing.queuedAt,
          attempts: 0,
          userId: existing.userId,
        };
        const queue = [...state.queue];
        queue[idx] = write;
        return { ...state, queue };
      }
      // Either nothing is queued for this day, or what is queued is a delete
      // this write is not allowed to replace. Both end the same way: on the
      // back of the queue, so a save made after a delete goes out after it
      // rather than instead of it.
      const write: QueuedWrite = {
        id: makeId(),
        action: incoming,
        queuedAt: new Date().toISOString(),
        attempts: 0,
        userId: state.signedInUserId,
      };
      return { ...state, queue: [...state.queue, write] };
    }

    case t.REPLAY:
      // Only if this session actually has something to send. An app is told
      // to dispatch replay() whenever connectivity returns, so a flag raised
      // unconditionally here is a syncing spinner pinned on forever the
      // first time the connection comes back with an empty queue: nothing
      // else can lower it, and a sign-out does not either, since the outbox
      // is exempt from the root reset.
      return { ...state, replaying: stillOwing(state.queue, state.signedInUserId) };

    case t.REPLAY_SUCCEEDED: {
      // `dedupeKey` and `response` on this payload are for whichever duck
      // enqueued the write to read; the outbox itself only needs `id` to
      // take the write off its own queue.
      const { id } = (action as Extract<OutboxAction, { type: typeof t.REPLAY_SUCCEEDED }>).payload;
      const queue = state.queue.filter((w) => w.id !== id);
      return { ...state, queue, replaying: stillOwing(queue, state.signedInUserId) };
    }

    case t.REPLAY_FAILED: {
      const { id, permanent } = (
        action as Extract<OutboxAction, { type: typeof t.REPLAY_FAILED }>
      ).payload;
      if (permanent) {
        // A 422 will fail identically forever. Keeping it would block every
        // write behind it and never resolve, so it comes off the queue. The
        // duck that queued it hears about it through this same action's
        // `dedupeKey`, so the words are not simply gone with nobody told.
        const queue = state.queue.filter((w) => w.id !== id);
        return { ...state, queue, replaying: stillOwing(queue, state.signedInUserId) };
      }
      // Offline, a timeout, or a dead session: the write stays, and the
      // saga stops here rather than burn through everything behind it
      // against a connection that is still down.
      return {
        ...state,
        replaying: false,
        queue: state.queue.map((w) => (w.id === id ? { ...w, attempts: w.attempts + 1 } : w)),
      };
    }

    case t.QUEUE_RESTORED: {
      const restored = (action as Extract<OutboxAction, { type: typeof t.QUEUE_RESTORED }>).payload;
      // Merged under whatever is already queued, never dropped on top of it.
      // Storage is read once, asynchronously, at boot, and Teddy can type an
      // entry and save it before that read answers: a tennis court with no
      // signal is exactly where he does. Replacing the queue here erased the
      // write he had just made, with no error and nothing left owed, which
      // is the one failure this whole duck exists to prevent.
      //
      // Position decides the order, not `queuedAt`. Everything already in
      // `state.queue` was typed during this launch, after the read of
      // storage began; everything in `restored` was on disk before it. So
      // disk first is oldest first by causality, which is what replay wants,
      // and it stays right when a device's clock has moved. Sorting on
      // `queuedAt` would also lean on a field the corruption guard never
      // checks (see sagas.ts), letting a stored write that happens to be
      // missing it decide replay order by accident.
      //
      // A collision keeps the in-memory write and discards the restored one:
      // the restored one is an earlier edit of the same logical write, and
      // the last edit is the one that should reach the server, the same
      // ruling ENQUEUE makes above. Matched on author as well as key for the
      // same reason ENQUEUE matches on both: `athlete:2026-09-17` is one key
      // per day, not one key per day per person, so collapsing on the key
      // alone would destroy one person's words in the name of deduping them.
      //
      // `supersedes` guards that ruling for the reason it exists on ENQUEUE:
      // an in-memory save must not discard a restored delete for the same
      // day. Disk holds what he did before this launch, so a delete found
      // there with a save typed since is the delete-then-save ordering
      // arriving by another road, and dropping the delete here would lose it
      // exactly as silently as collapsing it would.
      const kept = restored.filter(
        (r) =>
          !state.queue.some(
            (w) =>
              w.action.dedupeKey === r.action.dedupeKey &&
              w.userId === r.userId &&
              supersedes(w.action, r.action),
          ),
      );
      return { ...state, queue: [...kept, ...state.queue] };
    }

    // The auth transitions, mirrored. Only who is signed in is read from
    // them; the queue itself is untouched, because a queued write outlives
    // the session that made it on purpose.
    case authTypes.SIGN_IN_SUCCEEDED: {
      const { user } = (action as Extract<AuthAction, { type: typeof authTypes.SIGN_IN_SUCCEEDED }>)
        .payload;
      return { ...state, signedInUserId: user.id };
    }

    case authTypes.RESTORE_FINISHED: {
      const session = (action as Extract<AuthAction, { type: typeof authTypes.RESTORE_FINISHED }>)
        .payload;
      return { ...state, signedInUserId: session ? session.user.id : null };
    }

    case authTypes.SIGN_IN_FAILED:
    case authTypes.SIGN_OUT:
    case authTypes.SESSION_EXPIRED:
      return { ...state, signedInUserId: null };

    default:
      return state;
  }
}
