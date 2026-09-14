import {
  createCoreStore,
  memoryStorage,
  journalActions,
  journalSelectors,
  outboxActions,
  outboxSelectors,
} from "../src";

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

// A condition-based wait rather than a fixed number of ticks: it polls the
// one thing the test actually cares about and returns the moment that's
// true, so it does not go stale the day a worker gains or loses a yield
// (the failure mode a fixed-count spin has no way to notice). It still
// needs a ceiling, so a genuine regression fails with a clear message
// instead of hanging the test run.
async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`outbox-e2e: timed out waiting for ${label}`);
}

describe("outbox end-to-end: a note typed offline reaches the API when the connection comes back", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("queues the note while offline, then sends exactly what was typed once fetch works again, and learns the server's id", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });

    const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    store.dispatch(
      journalActions.saveAthleteEntry({
        date: "2026-09-17",
        note: "Landed three in a row on the low balance beam.",
        shared: false,
      }),
    );
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline save to land in the outbox queue",
    );

    // Nothing reached the server: the attempt was made and failed, and
    // nothing about it is recorded as saved.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())).toBeNull();

    // The entry is queued rather than lost.
    const queue = outboxSelectors.selectQueue(store.getState());
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
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 0,
      "the replay to finish and clear the queue",
    );

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

    // The entry now carries the id the server assigned it — learned from the
    // replay's own response, not from a second, separate re-fetch.
    const saved = journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState());
    expect(saved?.id).toBe(501);
    expect(saved?.note).toBe("Landed three in a row on the low balance beam.");
  });

  it("survives being shared before it ever reaches the server (ordering A, end to end): the note typed offline is still what gets sent, even after the toggle is flipped offline too", async () => {
    // This is the case the priority-one fix exists for, proven through the
    // real store rather than a synthetic saga harness: type a note with no
    // signal, then tap "show Dad" before either one has ever reached the
    // API. Nothing here seeds state directly — both actions go through the
    // same store a real app would use.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    store.dispatch(
      journalActions.saveAthleteEntry({
        date: "2026-09-17",
        note: "Landed three in a row.",
        shared: false,
      }),
    );
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline note to land in the outbox queue",
    );

    store.dispatch(journalActions.setShared({ date: "2026-09-17", shared: true }));
    // The toggle's own save also queues (still offline) and, since it shares
    // the note save's dedupeKey, replaces the queued write in place rather
    // than adding a second one.
    await waitUntil(
      () =>
        outboxSelectors.selectQueue(store.getState()).length === 1 &&
        (outboxSelectors.selectQueue(store.getState())[0]!.action.payload as { shared: boolean }).shared === true,
      "the toggle's own save to replace the queued write",
    );

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
        note: "Landed three in a row.",
        shared: true,
        updated_at: "2026-09-17T19:05:00Z",
      }),
    );

    store.dispatch(outboxActions.replay());
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 0,
      "the replay to finish and clear the queue",
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: { session_date: "2026-09-17", note: "Landed three in a row.", shared: true },
    });

    const saved = journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState());
    expect(saved?.note).toBe("Landed three in a row.");
    expect(saved?.shared).toBe(true);
  });
});
