import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/outbox/actions";
import { outboxWorkers, QUEUE_KEY } from "../src/ducks/outbox/sagas";
import type { QueueableAction, QueuedWrite } from "../src/ducks/outbox/types";
import { enqueue } from "../src/ducks/outbox/actions";
import { sessionExpired } from "../src/ducks/auth/actions";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import {
  authActions,
  authSelectors,
  createCoreStore,
  memoryStorage,
  outboxActions,
  outboxSelectors,
} from "../src";
import { silentLogger } from "../src/services/logger";
import type { User } from "../src/types";

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

// A queued write as it sits in state. `userId` is who typed it: every
// fixture below says so explicitly rather than leaving it off, because "who
// owns this write" is the thing most of these tests turn on and a field
// nobody names is a field nobody checked.
function queued(id: string, dedupeKey: string, note: string, userId: number | null): QueuedWrite {
  return {
    id,
    action: write(dedupeKey, note),
    queuedAt: "2026-09-17T18:00:00Z",
    attempts: 0,
    userId,
  };
}

interface HarnessOptions {
  storage?: ReturnType<typeof memoryStorage>;
  // Who is signed in while the worker runs. Null is a signed-out app, which
  // is also what every write with no recorded author belongs to.
  userId?: number | null;
}

function harness(queue: unknown[] = [], options: HarnessOptions = {}) {
  const dispatched: unknown[] = [];
  const storage = options.storage ?? memoryStorage();
  const userId = options.userId === undefined ? null : options.userId;
  const user = userId === null ? null : { id: userId, email: "x@y.z", name: "X", role: "athlete" };
  const config = { baseUrl: "https://api.test", storage, logger: silentLogger, timeoutMs: 15000 };
  return {
    dispatched,
    storage,
    run: (worker: unknown, action?: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c", user }, outbox: { queue, replaying: false } }),
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
      queued("1", "day:2026-09-17", "first", null),
      queued("2", "day:2026-09-18", "second", null),
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
    const h = harness([queued("1", "day:2026-09-17", "first", null)]);

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
      queued("1", "day:2026-09-17", "a", null),
      queued("2", "day:2026-09-18", "b", null),
      queued("3", "day:2026-09-19", "c", null),
    ]);

    await h.run(outboxWorkers.replay);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.dispatched).toContainEqual(
      actions.replayFailed({
        id: "1",
        dedupeKey: "day:2026-09-17",
        permanent: false,
        message: "No connection.",
      }),
    );
  });

  it("tells the duck that queued it when the server rejects a write for good", async () => {
    // The failure this whole outbox exists to prevent, arriving by another
    // road: a 422 drops the write, the pending count falls to zero, and
    // Teddy reads that as "sent". It was not sent and it is gone. So the
    // rejection has to carry enough for the duck that queued it to
    // recognise its own write and say something true about it: the
    // `dedupeKey` (whose prefix names the owner, the same way
    // REPLAY_SUCCEEDED is already recognised) and the server's own message.
    // `id` alone is the outbox's private bookkeeping and means nothing to
    // any duck.
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValueOnce(new ApiError(422, "invalid", "A note cannot be blank."))
      .mockResolvedValueOnce({});
    const h = harness([
      queued("1", "athlete:2026-09-17", "", null),
      queued("2", "athlete:2026-09-18", "b", null),
    ]);

    await h.run(outboxWorkers.replay);

    expect(h.dispatched).toContainEqual(
      actions.replayFailed({
        id: "1",
        dedupeKey: "athlete:2026-09-17",
        permanent: true,
        message: "A note cannot be blank.",
      }),
    );
    // And the next write still goes, rather than blocking behind the
    // rejected one.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("stops on an expired session without dropping the write, and signs the app out", async () => {
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(401, "unauthorized", "Session expired."));
    const h = harness([
      queued("1", "day:2026-09-17", "a", null),
      queued("2", "day:2026-09-18", "b", null),
    ]);

    await h.run(outboxWorkers.replay);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.dispatched).toContainEqual(
      actions.replayFailed({
        id: "1",
        dedupeKey: "day:2026-09-17",
        permanent: false,
        message: "Session expired.",
      }),
    );
    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("sends only the signed-in person's writes, and leaves everyone else's queued", async () => {
    // One iPad, two people. Teddy's write is still owed to the server and
    // must not be dropped; it must also not go out under Jeff's token,
    // which is exactly what reading the current token at replay time used
    // to do.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({});
    const h = harness(
      [
        queued("1", "athlete:2026-09-17", "Teddy's words", 7),
        queued("2", "coach:2026-09-17", "Jeff's words", 1),
      ],
      { userId: 1 },
    );

    await h.run(outboxWorkers.replay);

    const notes = spy.mock.calls.map(
      ([, req]) => (req as { body: { athlete_entry: { note: string } } }).body.athlete_entry.note,
    );
    expect(notes).toEqual(["Jeff's words"]);
    // Skipped, not failed and not dropped: nothing at all is dispatched
    // about Teddy's write, so the reducer never takes it off the queue.
    const aboutTeddy = h.dispatched.filter(
      (a) => (a as { payload?: { id?: string } }).payload?.id === "1",
    );
    expect(aboutTeddy).toEqual([]);
  });

  it("restores the queue from storage on boot", async () => {
    // The entry was typed at a court, the app was closed on the walk home,
    // and it has to still be there.
    const storage = memoryStorage();
    const stored = [queued("1", "day:2026-09-17", "Landed three.", 7)];
    await storage.setItem(QUEUE_KEY, JSON.stringify(stored));
    const h = harness([], { storage });

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored(stored));
  });

  it("restores a write stored before writes recorded an author as belonging to nobody", async () => {
    // Fail closed. A write with no recorded author is never sent under
    // whoever happens to be signed in, and never shown to them either, so
    // the one shape this package cannot vouch for is the one shape that
    // gets the most careful treatment rather than the least.
    const storage = memoryStorage();
    await storage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        {
          id: "1",
          action: write("day:2026-09-17", "Landed three."),
          queuedAt: "2026-09-17T18:00:00Z",
          attempts: 0,
        },
      ]),
    );
    const h = harness([], { storage });

    await h.run(outboxWorkers.restore);

    const restored = h.dispatched.find(
      (a) => (a as { type: string }).type === "outbox/QUEUE_RESTORED",
    ) as { payload: QueuedWrite[] };
    expect(restored.payload).toHaveLength(1);
    expect(restored.payload[0]!.userId).toBeNull();
  });

  it("survives a stored queue that is not valid JSON", async () => {
    // Same reasoning as the session key: never wedge every launch forever.
    const storage = memoryStorage();
    await storage.setItem(QUEUE_KEY, "{not json");
    const h = harness([], { storage });

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
    const h = harness([], { storage });

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored([]));
    expect(await storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("survives a stored queue whose entries are malformed", async () => {
    // The shape a partial or interrupted write actually produces: an array,
    // but one whose entries are missing what a QueuedWrite needs.
    const storage = memoryStorage();
    await storage.setItem(QUEUE_KEY, JSON.stringify([{ foo: "bar" }]));
    const h = harness([], { storage });

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored([]));
    expect(await storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("writes every queued write to storage, not just the signed-in person's", async () => {
    // Storage is the device's, not the session's. Persisting only what the
    // person signed in right now can see would erase Teddy's queued words
    // the first time Jeff's session saved the queue, which is the same
    // destruction this duck exists to prevent.
    const h = harness(
      [
        queued("1", "athlete:2026-09-17", "Landed three.", 7),
        queued("2", "coach:2026-09-17", "Good session.", 1),
      ],
      { userId: 1 },
    );

    await h.run(outboxWorkers.persist);

    const stored = JSON.parse((await h.storage.getItem(QUEUE_KEY))!) as QueuedWrite[];
    expect(stored).toHaveLength(2);
    expect(stored.map((w) => w.userId)).toEqual([7, 1]);
    expect((stored[0]!.action.payload as { note: string }).note).toBe("Landed three.");
  });
});

// ---------------------------------------------------------------------------
// The shared iPad, end to end through a real store.
// ---------------------------------------------------------------------------

function respond(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`outbox: timed out waiting for ${label}`);
}

// For the assertions that nothing happened. A predicate cannot wait for an
// absence, so this gives the saga a generous number of turns to do the wrong
// thing before the test claims it did not.
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const TEDDY: User = { id: 7, email: "teddy@example.test", name: "Teddy", role: "athlete" };
const JEFF: User = { id: 1, email: "jeff@example.test", name: "Jeff", role: "coach" };
const SECRET = "Landed three in a row. Don't tell Dad yet.";

// The action journal/SAVE_ATHLETE_ENTRY hands the outbox when a save finds no
// signal, written out here rather than imported: this file owes nothing to
// ducks/journal, and the outbox's own behaviour is what is on trial. What
// matters is that it is a real write, queued through the real store, with
// real words in it.
const secretWrite: QueueableAction = {
  type: "journal/SAVE_ATHLETE_ENTRY",
  payload: { date: "2026-09-17", note: SECRET, shared: false },
  dedupeKey: "athlete:2026-09-17",
  request: {
    path: "/api/v1/athlete_entries",
    method: "POST",
    body: { athlete_entry: { session_date: "2026-09-17", note: SECRET, shared: false } },
  },
};

// Everything the package's public surface will hand back about the outbox,
// for one state. Object.values, not a hand-written list: a selector added to
// the surface later is covered by this the day it is added, which a list
// naming today's three selectors would not be.
function everythingTheSurfaceShows(state: unknown): string {
  const values = Object.values(outboxSelectors).map((selector) =>
    (selector as (s: unknown) => unknown)(state),
  );
  return JSON.stringify(values);
}

describe("one iPad, two people: a queued write belongs to whoever typed it", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps Teddy's queued words out of Jeff's session, off Jeff's token, and still owed to the server", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));

    async function signIn(user: User, jwt: string) {
      fetchMock.mockImplementationOnce(() => respond(200, { jwt, user }));
      store.dispatch(authActions.signIn({ email: user.email, password: "correct-horse" }));
      await waitUntil(
        () => authSelectors.selectUser(store.getState())?.id === user.id,
        `${user.name} to be signed in`,
      );
    }

    // Two identities, each one signed in through the real auth saga against
    // its own login response, each holding its own token. A single-user
    // version of this test could not tell a working scope from no scope at
    // all.
    await signIn(TEDDY, "TEDDY-TOKEN");
    expect(authSelectors.selectUser(store.getState())).toEqual(TEDDY);

    // Teddy types his note at a court with no signal. The save fails, the
    // duck hands the write to the outbox, and the words sit in the queue.
    store.dispatch(enqueue(secretWrite));
    await waitUntil(
      () => store.getState().outbox.queue.length === 1,
      "the offline write to land in the queue",
    );
    expect(store.getState().outbox.queue[0]!.userId).toBe(TEDDY.id);

    // While Teddy is the one signed in, his own pending write is his to see.
    // Without this, every assertion below would pass against a selector that
    // simply returned nothing to anybody.
    expect(everythingTheSurfaceShows(store.getState())).toContain(SECRET);
    expect(outboxSelectors.selectPendingCount(store.getState())).toBe(1);

    store.dispatch(authActions.signOut());
    await waitUntil(
      () => authSelectors.selectUser(store.getState()) === null,
      "the sign-out to land",
    );

    await signIn(JEFF, "JEFF-TOKEN");
    expect(authSelectors.selectUser(store.getState())).toEqual(JEFF);

    // The whole point. Nothing the package exposes hands Jeff the words.
    expect(everythingTheSurfaceShows(store.getState())).not.toContain(SECRET);
    expect(outboxSelectors.selectQueue(store.getState())).toEqual([]);
    expect(outboxSelectors.selectPendingCount(store.getState())).toBe(0);

    // Invisible to Jeff, and still owed to the server: Teddy's words are
    // kept, not quietly thrown away because the wrong person is holding the
    // iPad.
    expect(store.getState().outbox.queue).toHaveLength(1);

    // Jeff's app reconnects and replays. Teddy's write must not go out
    // under Jeff's credentials, and must not be consumed by the attempt.
    fetchMock.mockClear();
    store.dispatch(outboxActions.replay());
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState().outbox.queue).toHaveLength(1);
    expect(store.getState().outbox.queue[0]!.attempts).toBe(0);
    // And no spinner left running over a queue this session cannot send.
    expect(outboxSelectors.selectReplaying(store.getState())).toBe(false);

    // Teddy comes back to his own iPad, and his words finally go, under his
    // own token.
    store.dispatch(authActions.signOut());
    await waitUntil(
      () => authSelectors.selectUser(store.getState()) === null,
      "Jeff's sign-out to land",
    );
    await signIn(TEDDY, "TEDDY-TOKEN-2");

    fetchMock.mockClear();
    fetchMock.mockImplementation(() =>
      respond(201, {
        athlete_entry: {
          id: 501,
          session_date: "2026-09-17",
          note: SECRET,
          shared: false,
          updated_at: "2026-09-17T19:05:00Z",
        },
      }),
    );

    store.dispatch(outboxActions.replay());
    await waitUntil(
      () => store.getState().outbox.queue.length === 0,
      "Teddy's own replay to clear the queue",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/api/v1/athlete_entries");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer TEDDY-TOKEN-2");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: { session_date: "2026-09-17", note: SECRET, shared: false },
    });
  });
});
