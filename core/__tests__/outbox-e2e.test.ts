import { createCoreStore, memoryStorage, journalActions, journalSelectors, outboxActions, outboxSelectors } from "../src";

// A real store, a real reducer, real sagas. The only thing mocked is
// `fetch`, exactly the seam apiRequest itself is built on. If this passes
// while a unit test elsewhere is broken, it is not testing what it claims —
// so nothing here reaches into a duck's internals to make it pass.

function respond(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

// Lets every microtask queued so far — a saga's `yield call`, the promise
// chain inside apiRequest, the dispatch that follows — run before the next
// assertion. redux-saga schedules continuations as native promise
// callbacks, so a handful of macrotask boundaries is enough to drain them.
async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("outbox end-to-end: a note typed offline reaches the API when the connection comes back", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("queues the note while offline, then sends exactly what was typed once fetch works again, and learns the server's id", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    // Let the outbox's own boot-time restore() finish and its watchers
    // register before anything is dispatched. restore() ends by replacing
    // the whole queue with whatever storage had (nothing, on a fresh
    // store) — dispatching first would race that replace against the
    // ENQUEUE this test causes next.
    await flush();

    const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    store.dispatch(
      journalActions.saveAthleteEntry({
        date: "2026-09-17",
        note: "Landed three in a row on the low balance beam.",
        shared: false,
      }),
    );
    await flush();

    // Nothing reached the server: the attempt was made and failed, and
    // nothing about it is recorded as saved.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())).toBeNull();

    // The entry is queued rather than lost.
    const queue = outboxSelectors.selectQueue(store.getState());
    expect(queue).toHaveLength(1);
    expect(queue[0]!.action.dedupeKey).toBe("athlete:2026-09-17");

    // Connectivity is back.
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      respond(201, {
        id: 501,
        session_date: "2026-09-17",
        program_year_id: 1,
        day_card_id: null,
        felt: null,
        best: null,
        hard: null,
        note: "Landed three in a row on the low balance beam.",
        shared: false,
        updated_at: "2026-09-17T19:05:00Z",
      }),
    );

    store.dispatch(outboxActions.replay());
    await flush();

    // The words that were typed, and nothing else, are what actually left
    // for the server.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        session_date: "2026-09-17",
        note: "Landed three in a row on the low balance beam.",
        shared: false,
      },
    });

    // The write is off the queue, and the entry now carries the id the
    // server assigned it — learned from the replay's own response, not from
    // a second, separate re-fetch.
    expect(outboxSelectors.selectQueue(store.getState())).toHaveLength(0);
    const saved = journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState());
    expect(saved?.id).toBe(501);
    expect(saved?.note).toBe("Landed three in a row on the low balance beam.");
  });
});
