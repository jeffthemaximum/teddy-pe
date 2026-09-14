import type { OutboxState } from "./reducer";

interface WithOutbox {
  outbox: OutboxState;
}

export const selectQueue = (s: WithOutbox) => s.outbox.queue;
export const selectReplaying = (s: WithOutbox) => s.outbox.replaying;
export const selectPendingCount = (s: WithOutbox) => s.outbox.queue.length;
