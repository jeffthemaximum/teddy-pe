import * as t from "./actionTypes";
import * as authTypes from "../auth/actionTypes";
import type { AuthAction } from "../auth/actions";
import type { OutboxAction } from "./actions";
import type { QueuedWrite } from "./types";

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
      const idx = state.queue.findIndex(
        (w) => w.action.dedupeKey === incoming.dedupeKey && w.userId === state.signedInUserId,
      );
      if (idx >= 0) {
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
      const queue = (action as Extract<OutboxAction, { type: typeof t.QUEUE_RESTORED }>).payload;
      return { ...state, queue };
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
