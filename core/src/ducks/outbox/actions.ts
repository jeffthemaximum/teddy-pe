import * as t from "./actionTypes";
import type { QueueableAction, QueuedWrite } from "./types";

// The only action a duck needs to enqueue a write: the action itself,
// carrying its own `dedupeKey` and `request`. The outbox does not build
// either of those; see types.ts.
export const enqueue = (action: QueueableAction) =>
  ({ type: t.ENQUEUE, payload: action }) as const;

// Dispatched by the app when connectivity is believed to be back. Takes no
// payload: the saga reads the current queue itself.
export const replay = () => ({ type: t.REPLAY }) as const;

export const replaySucceeded = (id: string) =>
  ({ type: t.REPLAY_SUCCEEDED, payload: id }) as const;

export const replayFailed = (info: { id: string; permanent: boolean }) =>
  ({ type: t.REPLAY_FAILED, payload: info }) as const;

// Dispatched once on boot, whatever storage returned: the real queue, or an
// empty one if there was nothing there or what was there could not be read.
export const queueRestored = (queue: QueuedWrite[]) =>
  ({ type: t.QUEUE_RESTORED, payload: queue }) as const;

export type OutboxAction =
  | ReturnType<typeof enqueue>
  | ReturnType<typeof replay>
  | ReturnType<typeof replaySucceeded>
  | ReturnType<typeof replayFailed>
  | ReturnType<typeof queueRestored>;
