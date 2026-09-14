import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/outbox/actions";
import { outboxWorkers, QUEUE_KEY } from "../src/ducks/outbox/sagas";
import type { QueueableAction } from "../src/ducks/outbox/types";
import { sessionExpired } from "../src/ducks/auth/actions";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";

// A stand-in for a real duck's save action. The outbox under test here must
// never import ducks/journal or ducks/testResults, so nothing in this file
// does either: this is what any duck's queued action looks like from the
// outbox's point of view, and no more.
function write(dedupeKey: string, note: string): QueueableAction {
  return {
    type: "TEST/WRITE",
    payload: { note },
    dedupeKey,
    request: { path: "/athlete_entries", method: "PATCH", body: { athlete_entry: { note } } },
  };
}

function harness(queue: unknown[] = [], storage = memoryStorage()) {
  const dispatched: unknown[] = [];
  const config = { baseUrl: "https://api.test", storage, logger: silentLogger, timeoutMs: 15000 };
  return {
    dispatched,
    storage,
    run: (worker: unknown, action?: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c" }, outbox: { queue, replaying: false } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worker as any,
        action,
      ).toPromise(),
  };
}

describe("the outbox saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("replays oldest first, so the last edit of a day is the one that sticks", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({});
    const h = harness([
      { id: "1", action: write("day:2026-09-17", "first"), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("day:2026-09-18", "second"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    const notes = spy.mock.calls.map(
      ([, req]) => (req as { body: { athlete_entry: { note: string } } }).body.athlete_entry.note,
    );
    expect(notes).toEqual(["first", "second"]);
  });

  it("carries the write's dedupeKey and the server's response through on success", async () => {
    // The outbox's own reducer only needs the queue id to drop a landed
    // write, but the duck that enqueued it does not know that id: it knows
    // its own dedupeKey. Without both, a duck has no way to learn a
    // server-assigned id or updated_at for an entry created offline.
    jest.spyOn(client, "apiRequest").mockResolvedValue({ id: 501, updated_at: "2026-09-17T18:05:00Z" });
    const h = harness([
      { id: "1", action: write("day:2026-09-17", "first"), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    expect(h.dispatched).toContainEqual(
      actions.replaySucceeded({
        id: "1",
        dedupeKey: "day:2026-09-17",
        response: { id: 501, updated_at: "2026-09-17T18:05:00Z" },
      }),
    );
  });

  it("stops at the first offline failure instead of failing the whole queue", async () => {
    // Three queued writes against a connection still down is three timeouts
    // at fifteen seconds each and the same outcome as stopping at one.
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness([
      { id: "1", action: write("day:2026-09-17", "a"), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("day:2026-09-18", "b"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
      { id: "3", action: write("day:2026-09-19", "c"), queuedAt: "2026-09-19T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.dispatched).toContainEqual(actions.replayFailed({ id: "1", permanent: false }));
  });

  it("drops a write the server permanently rejected and carries on to the next", async () => {
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValueOnce(new ApiError(422, "invalid", "A note cannot be blank."))
      .mockResolvedValueOnce({});
    const h = harness([
      { id: "1", action: write("day:2026-09-17", ""), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("day:2026-09-18", "b"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    expect(h.dispatched).toContainEqual(actions.replayFailed({ id: "1", permanent: true }));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("stops on an expired session without dropping the write, and signs the app out", async () => {
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(401, "unauthorized", "Session expired."));
    const h = harness([
      { id: "1", action: write("day:2026-09-17", "a"), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("day:2026-09-18", "b"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.dispatched).toContainEqual(actions.replayFailed({ id: "1", permanent: false }));
    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("restores the queue from storage on boot", async () => {
    // The entry was typed at a court, the app was closed on the walk home,
    // and it has to still be there.
    const storage = memoryStorage();
    const queued = [
      { id: "1", action: write("day:2026-09-17", "Landed three."), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
    ];
    await storage.setItem(QUEUE_KEY, JSON.stringify(queued));
    const h = harness([], storage);

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored(queued));
  });

  it("survives a stored queue that is not valid JSON", async () => {
    // Same reasoning as the session key: never wedge every launch forever.
    const storage = memoryStorage();
    await storage.setItem(QUEUE_KEY, "{not json");
    const h = harness([], storage);

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored([]));
    expect(await storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("survives a stored value that is valid JSON but not the shape of a queue", async () => {
    // Parseable is not the same as usable. A plain object here would land in
    // state.outbox.queue and the next ENQUEUE, REPLAY_SUCCEEDED or
    // REPLAY_FAILED would call .findIndex/.filter/.map on it and throw,
    // wedging the outbox exactly as permanently as unparseable JSON does.
    const storage = memoryStorage();
    await storage.setItem(QUEUE_KEY, JSON.stringify({ foo: "bar" }));
    const h = harness([], storage);

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored([]));
    expect(await storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("survives a stored queue whose entries are malformed", async () => {
    // The shape a partial or interrupted write actually produces: an array,
    // but one whose entries are missing what a QueuedWrite needs.
    const storage = memoryStorage();
    await storage.setItem(QUEUE_KEY, JSON.stringify([{ foo: "bar" }]));
    const h = harness([], storage);

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored([]));
    expect(await storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("writes the queue to storage whenever it changes", async () => {
    const h = harness([
      { id: "1", action: write("day:2026-09-17", "Landed three."), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.persist);

    const stored = JSON.parse((await h.storage.getItem(QUEUE_KEY))!);
    expect(stored).toHaveLength(1);
    expect(stored[0].action.payload.note).toBe("Landed three.");
  });
});
