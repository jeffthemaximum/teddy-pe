import { reducer, actions } from "../src/ducks/outbox";
import type { QueueableAction } from "../src/ducks/outbox";

// A stand-in for a real duck's save action (journal's saveAthleteEntry is
// Task 7's job, not this one's). The outbox must not need to know this
// shape: it groups queued writes on `dedupeKey` alone and replays only
// `request`, never anything it infers from `payload`.
function testWrite(dedupeKey: string, note: string): QueueableAction {
  return {
    type: "TEST/WRITE",
    payload: { note },
    dedupeKey,
    request: { path: "/test", method: "POST", body: { note } },
  };
}

describe("the outbox reducer", () => {
  it("starts empty", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({ queue: [], replaying: false });
  });

  it("keeps the action verbatim so replay is the same request", () => {
    const write = testWrite("day:2026-09-17", "Landed three.");
    const s = reducer(undefined, actions.enqueue(write));
    expect(s.queue[0]!.action).toEqual(write);
  });

  it("replaces an earlier queued write sharing a dedupeKey, keeping the later one", () => {
    // Teddy edits his entry three times offline. Replaying three writes to
    // the same upsert endpoint is three requests for one outcome, and the
    // order decides which wins. Keep the last.
    //
    // The two writes below differ only in `note`, on purpose: a dedupe test
    // whose two fixtures are otherwise identical passes whether the queue
    // holds one entry or two, as long as nobody looks at which one. The
    // second assertion is what makes that impossible to fake.
    const older = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "Landed three.")));
    const newer = reducer(older, actions.enqueue(testWrite("day:2026-09-17", "Landed five.")));

    expect(newer.queue).toHaveLength(1);
    expect((newer.queue[0]!.action.payload as { note: string }).note).toBe("Landed five.");
  });

  it("dedupes on dedupeKey alone, even when the type and payload shape differ entirely", () => {
    // A test result's payload is `{ window, testId, rawValue }` and has no
    // `date`. If the outbox ever inferred identity from payload shape, this
    // pair (different type, unrelated payload keys) would never collapse.
    const older = reducer(
      undefined,
      actions.enqueue({
        type: "TEST/RESULT_A",
        payload: { window: "2026-09", testId: "t1", rawValue: 5.2 },
        dedupeKey: "result:2026-09:t1",
        request: { path: "/results/t1", method: "PATCH", body: { rawValue: 5.2 } },
      }),
    );
    const newer = reducer(
      older,
      actions.enqueue({
        type: "TEST/RESULT_B",
        payload: { window: "2026-09", testId: "t1", rawValue: 4.9 },
        dedupeKey: "result:2026-09:t1",
        request: { path: "/results/t1", method: "PATCH", body: { rawValue: 4.9 } },
      }),
    );

    expect(newer.queue).toHaveLength(1);
    expect(newer.queue[0]!.action.type).toBe("TEST/RESULT_B");
  });

  it("keeps writes for different days separately", () => {
    const a = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const b = reducer(a, actions.enqueue(testWrite("day:2026-09-18", "y")));
    expect(b.queue).toHaveLength(2);
    // Length alone would also pass a coincidental duplication bug. Naming
    // which two entries survived, and in which order, is what rules that out.
    expect(b.queue.map((w) => w.action.dedupeKey)).toEqual(["day:2026-09-17", "day:2026-09-18"]);
    expect(b.queue.map((w) => (w.action.payload as { note: string }).note)).toEqual(["x", "y"]);
  });

  it("takes a write off the queue when it lands", () => {
    const queued = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const write = queued.queue[0]!;
    const done = reducer(
      queued,
      actions.replaySucceeded({ id: write.id, dedupeKey: write.action.dedupeKey, response: {} }),
    );
    expect(done.queue).toHaveLength(0);
  });

  it("clears replaying when the replay loop stops at a failure", () => {
    // A UI reading this flag to show a syncing spinner needs it to come back
    // down when the loop actually stops, not just to go up when it starts.
    const queued = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const id = queued.queue[0]!.id;
    const started = reducer(queued, actions.replay());
    expect(started.replaying).toBe(true);
    const stopped = reducer(started, actions.replayFailed({ id, permanent: false }));
    expect(stopped.replaying).toBe(false);
  });

  it("counts attempts, and drops a write the server permanently rejected", () => {
    // A 422 will fail identically forever. Keeping it would block everything
    // behind it and never resolve.
    const queued = reducer(undefined, actions.enqueue(testWrite("day:2026-09-17", "x")));
    const id = queued.queue[0]!.id;
    const retried = reducer(queued, actions.replayFailed({ id, permanent: false }));
    expect(retried.queue[0]!.attempts).toBe(1);
    const dropped = reducer(retried, actions.replayFailed({ id, permanent: true }));
    expect(dropped.queue).toHaveLength(0);
  });

  it("replaces the whole queue on restore, whatever storage handed back", () => {
    const restored = [
      { id: "x", action: testWrite("day:2026-09-01", "old"), queuedAt: "2026-09-01T00:00:00Z", attempts: 2 },
    ];
    const s = reducer(undefined, actions.queueRestored(restored));
    expect(s.queue).toEqual(restored);
  });
});
