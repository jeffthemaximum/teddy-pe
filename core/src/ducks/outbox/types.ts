import type { HttpMethod } from "../../types";

// A write any duck can hand to the outbox. The outbox never inspects
// `payload` to work out what this is or how to send it: `dedupeKey` is what
// groups a later edit with an earlier one so the queue holds the last one
// rather than stacking every one, and `request` is already the exact call
// apiRequest should make to replay it. Both are set by whichever duck builds
// the action; the outbox only reads them, and never derives either from the
// payload's shape (a payload as thin as `{ window, testId, rawValue }`, for
// a test result, has no `date` to guess from and no request to reconstruct).
export interface QueueableAction {
  type: string;
  payload?: unknown;
  dedupeKey: string;
  request: {
    path: string;
    method?: HttpMethod;
    body?: unknown;
  };
}

export interface QueuedWrite {
  id: string;
  action: QueueableAction;
  queuedAt: string;
  attempts: number;
}
