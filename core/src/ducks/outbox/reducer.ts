import * as t from "./actionTypes";
import type { OutboxAction } from "./actions";
import type { QueuedWrite } from "./types";

export interface OutboxState {
  queue: QueuedWrite[];
  replaying: boolean;
}

const initialState: OutboxState = { queue: [], replaying: false };

// Time plus a counter, not a random string: unique across a run without
// reaching for a platform crypto API this package cannot assume every
// runtime provides (the whole point of touching no platform globals).
let counter = 0;
function makeId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export function reducer(
  state: OutboxState = initialState,
  action: OutboxAction | { type: string },
): OutboxState {
  switch (action.type) {
    case t.ENQUEUE: {
      const incoming = (action as Extract<OutboxAction, { type: typeof t.ENQUEUE }>).payload;
      const idx = state.queue.findIndex((w) => w.action.dedupeKey === incoming.dedupeKey);
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
      };
      return { ...state, queue: [...state.queue, write] };
    }

    case t.REPLAY:
      return { ...state, replaying: true };

    case t.REPLAY_SUCCEEDED: {
      // `dedupeKey` and `response` on this payload are for whichever duck
      // enqueued the write to read; the outbox itself only needs `id` to
      // take the write off its own queue.
      const { id } = (action as Extract<OutboxAction, { type: typeof t.REPLAY_SUCCEEDED }>).payload;
      const queue = state.queue.filter((w) => w.id !== id);
      return { ...state, queue, replaying: queue.length > 0 ? state.replaying : false };
    }

    case t.REPLAY_FAILED: {
      const { id, permanent } = (
        action as Extract<OutboxAction, { type: typeof t.REPLAY_FAILED }>
      ).payload;
      if (permanent) {
        // A 422 will fail identically forever. Keeping it would block every
        // write behind it and never resolve, so it comes off the queue.
        const queue = state.queue.filter((w) => w.id !== id);
        return { ...state, queue, replaying: queue.length > 0 ? state.replaying : false };
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

    default:
      return state;
  }
}
