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
  // Who typed it, recorded when it was queued rather than worked out when it
  // is sent. One iPad, three accounts: Teddy types an unshared note at a
  // court with no signal, his token dies on the walk home, and Jeff signs in
  // before the connection comes back. The queue is deliberately the one
  // slice a sign-out does not clear (words already typed are still owed to
  // the server), so without this field the write has no author at all by the
  // time it goes out, and the only thing standing between it and Jeff's
  // credentials is a Pundit rule on the server that core neither references
  // nor knows about. With it, replay sends only the signed-in person's own
  // writes and the selectors show only theirs.
  //
  // `null` means nobody: a write queued with no session, or restored from
  // storage written before this field existed. Those are never sent under
  // anyone's token and never shown to anyone signed in, because the safe
  // reading of "we do not know whose this is" is not "it must be yours".
  userId: number | null;
}
