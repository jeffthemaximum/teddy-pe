import * as t from "./actionTypes";
import type { HttpMethod } from "../../types";
import type { QueueableAction, QueuedWrite } from "./types";

// The only action a duck needs to enqueue a write: the action itself,
// carrying its own `dedupeKey` and `request`. The outbox does not build
// either of those; see types.ts.
export const enqueue = (action: QueueableAction) =>
  ({ type: t.ENQUEUE, payload: action }) as const;

// Dispatched by the app when connectivity is believed to be back. Takes no
// payload: the saga reads the current queue itself.
export const replay = () => ({ type: t.REPLAY }) as const;

// Carries the queue id (so the outbox itself can remove the write), the
// write's own `dedupeKey` (so whatever duck enqueued it can recognize which
// of its own local records this was, since the queue id is the outbox's own
// bookkeeping and never reaches the duck otherwise), and the raw response
// body apiRequest resolved with. The outbox does not look inside `response`;
// it is forwarded verbatim, the same way `request` was, so a duck can
// reconcile a server-assigned id or updated_at on an entry that was created
// offline without a second round trip to re-fetch it.
//
// `method` is the write's own `request.method`, forwarded for the same
// reason: what a write asked for is something only the duck that queued it
// can interpret, and there is one success it cannot interpret from
// `response` alone. A DELETE answered 404 got the state it wanted and
// resolves here with no body at all (see sagas.ts), so a duck reading only
// the response has nothing telling it an entry is gone. It is optional
// because `request.method` itself is: a write that names no method is a GET,
// and no duck queues one.
export const replaySucceeded = (info: {
  id: string;
  dedupeKey: string;
  response: unknown;
  method?: HttpMethod;
}) => ({ type: t.REPLAY_SUCCEEDED, payload: info }) as const;

// Carries `dedupeKey` and `message` for the same reason REPLAY_SUCCEEDED
// carries `dedupeKey` and `response`: `id` is the outbox's own bookkeeping
// and means nothing to the duck that queued the write. A permanent rejection
// takes the write off the queue for good, and a duck that never hears about
// it leaves its own error null while the pending count drops to zero, which
// reads as "sent" and is the exact loss this outbox exists to prevent. The
// key's prefix (`athlete:`, `coach:`, `result:`) is how a duck recognizes
// its own, and `message` is the server's own words, already in voice.
export const replayFailed = (info: {
  id: string;
  dedupeKey: string;
  permanent: boolean;
  message: string;
}) => ({ type: t.REPLAY_FAILED, payload: info }) as const;

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
