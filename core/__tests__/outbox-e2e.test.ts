import {
  createCoreStore,
  memoryStorage,
  authActions,
  authSelectors,
  journalActions,
  journalSelectors,
  outboxActions,
  outboxSelectors,
} from "../src";

// A real store, a real reducer, real sagas. The only thing mocked is
// `fetch`, exactly the seam apiRequest itself is built on. If this passes
// while a unit test elsewhere is broken, it is not testing what it claims,
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
        // The program year every write has to name: both controllers open
        // with `ProgramYear.find(entry_params.fetch(:program_year_id))`.
        programYearId: 1,
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
    // The envelope AthleteEntriesController#create actually renders:
    // `render json: { athlete_entry: serialize(entry) }`. The entry is inside
    // it, never at the top level.
    fetchMock.mockImplementation(() =>
      respond(201, {
        athlete_entry: {
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
        },
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
    // AthleteEntriesController#create opens with
    // `ProgramYear.find(entry_params.fetch(:program_year_id))`, and `fetch`
    // raises on a missing key, so a body without it is a 400 every time.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        note: "Landed three in a row on the low balance beam.",
        shared: false,
      },
    });

    // The entry now carries the id the server assigned it, learned from the
    // replay's own response, not from a second, separate re-fetch.
    const saved = journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState());
    expect(saved?.id).toBe(501);
    expect(saved?.note).toBe("Landed three in a row on the low balance beam.");
  });

  it("survives being shared before it ever reaches the server (ordering A, end to end): the note typed offline is still what gets sent, even after the toggle is flipped offline too", async () => {
    // This is the case the priority-one fix exists for, proven through the
    // real store rather than a synthetic saga harness: type a note with no
    // signal, then tap "show Dad" before either one has ever reached the
    // API. Nothing here seeds state directly: both actions go through the
    // same store a real app would use.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    store.dispatch(
      journalActions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        note: "Landed three in a row.",
        shared: false,
      }),
    );
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline note to land in the outbox queue",
    );

    store.dispatch(journalActions.setShared({ programYearId: 1, date: "2026-09-17", shared: true }));
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
        athlete_entry: {
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
        },
      }),
    );

    store.dispatch(outboxActions.replay());
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 0,
      "the replay to finish and clear the queue",
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        note: "Landed three in a row.",
        shared: true,
      },
    });

    const saved = journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState());
    expect(saved?.note).toBe("Landed three in a row.");
    expect(saved?.shared).toBe(true);
  });

  // --- The online path, which is where every one of these saves actually
  // starts. Both bugs lived here first: the request the server rejects, and
  // the envelope stored as though it were the entry.

  it("an online athlete save names its program year, unwraps what comes back, and stops the day spinning", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(() =>
      respond(201, {
        athlete_entry: {
          id: 77,
          session_date: "2026-09-17",
          program_year_id: 1,
          day_card_id: null,
          felt: null,
          best: null,
          hard: null,
          note: "Beat my own record on the ladder.",
          shared: true,
          updated_at: "2026-09-17T19:05:00Z",
        },
      }),
    );

    store.dispatch(
      journalActions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        note: "Beat my own record on the ladder.",
        shared: true,
      }),
    );
    await waitUntil(
      () => journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState()) !== null,
      "the saved entry to reach the slice under its own date",
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/api/v1/athlete_entries");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        note: "Beat my own record on the ladder.",
        shared: true,
      },
    });

    const saved = journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState());
    expect(saved?.id).toBe(77);
    expect(saved?.shared).toBe(true);
    // The spinner stops. It used to run forever, because `saving` was
    // cleared with the `session_date` of the wrapper, which is undefined.
    expect(journalSelectors.selectIsSaving("2026-09-17")(store.getState())).toBe(false);
    expect(journalSelectors.selectJournalError(store.getState())).toBeNull();
    // A 200 is not a failure, so nothing is owed to the outbox.
    expect(outboxSelectors.selectQueue(store.getState())).toHaveLength(0);
  });

  it("an online coach save sends ratings beside the entry, not inside it, and lands in the coach map", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(() =>
      respond(201, {
        coach_entry: {
          id: 9,
          session_date: "2026-09-17",
          program_year_id: 1,
          day_card_id: 12,
          overall: 4,
          energy: 3,
          flag_pain: false,
          pain_note: null,
          note: "Balance drill needs another week.",
          challenge_num: "2",
          ratings: { "cartwheel-prep": "getting" },
          updated_at: "2026-09-17T19:10:00Z",
        },
      }),
    );

    store.dispatch(
      journalActions.saveCoachEntry({
        programYearId: 1,
        date: "2026-09-17",
        note: "Balance drill needs another week.",
        overall: 4,
        energy: 3,
        flag_pain: false,
        pain_note: null,
        challenge_num: "2",
        ratings: { "cartwheel-prep": "getting" },
      }),
    );
    await waitUntil(
      () => journalSelectors.selectCoachEntryFor("2026-09-17")(store.getState()) !== null,
      "the saved coach entry to reach the slice",
    );

    const [, init] = fetchMock.mock.calls[0]!;
    // `ratings` sits at the top level of the request, not inside
    // `coach_entry`: CoachEntriesController#ratings_param reads
    // `params[:ratings]`, and entry_params does not permit it.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      coach_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        note: "Balance drill needs another week.",
        overall: 4,
        energy: 3,
        flag_pain: false,
        pain_note: null,
        challenge_num: "2",
      },
      ratings: { "cartwheel-prep": "getting" },
    });

    expect(journalSelectors.selectCoachEntryFor("2026-09-17")(store.getState())?.id).toBe(9);
    expect(journalSelectors.selectIsSaving("2026-09-17")(store.getState())).toBe(false);
  });

  // --- The reads. Without these the journal screens open empty every time,
  // because the only way an entry could reach state was saving one in that
  // same session.

  it("fills both journals from the index endpoints, and asks each one the way its controller expects", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/login")) {
        return respond(200, {
          jwt: "JEFF-TOKEN",
          user: { id: 1, email: "jeff@example.com", name: "Jeff", role: "coach" },
        });
      }
      if (url.includes("/api/v1/athlete_entries")) {
        return respond(200, {
          athlete_entries: [
            {
              id: 4,
              session_date: "2026-09-17",
              program_year_id: 1,
              day_card_id: 12,
              felt: null,
              best: null,
              hard: null,
              note: "Landed three in a row.",
              shared: true,
              updated_at: "2026-09-17T19:02:00Z",
            },
          ],
        });
      }
      return respond(200, {
        coach_entries: [
          {
            id: 9,
            session_date: "2026-09-16",
            program_year_id: 1,
            day_card_id: 11,
            overall: 4,
            energy: 3,
            flag_pain: false,
            pain_note: null,
            note: "Quick feet all session.",
            challenge_num: null,
            ratings: {},
            updated_at: "2026-09-16T19:10:00Z",
          },
        ],
      });
    });

    store.dispatch(authActions.signIn({ email: "jeff@example.com", password: "hunter2" }));
    await waitUntil(
      () => authSelectors.selectIsSignedIn(store.getState()),
      "the sign-in to finish, so the fetches go out with a token",
    );

    store.dispatch(journalActions.fetchAthleteEntries());
    store.dispatch(journalActions.fetchCoachEntries({ from: "2026-09-14", to: "2026-09-20" }));
    await waitUntil(
      () =>
        journalSelectors.selectAthleteEntries(store.getState()).length === 1 &&
        journalSelectors.selectCoachEntries(store.getState()).length === 1,
      "both journals to fill from their own endpoint",
    );

    const urls = fetchMock.mock.calls.slice(1).map(([input]) => String(input));
    // No query on the athlete index: the controller takes no parameters and
    // the Pundit scope alone decides what comes back. Both dates on the
    // coach index, because `between` only runs when it has both.
    expect(urls).toContain("https://api.test/api/v1/athlete_entries");
    expect(urls).toContain("https://api.test/api/v1/coach_entries?from=2026-09-14&to=2026-09-20");

    // Every fetch went out with the signed-in token, not anonymously.
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer JEFF-TOKEN" });
    }

    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())?.id).toBe(4);
    expect(journalSelectors.selectCoachEntryFor("2026-09-16")(store.getState())?.id).toBe(9);
    // The spinners both stop, and neither list failed.
    expect(journalSelectors.selectIsLoadingAthleteEntries(store.getState())).toBe(false);
    expect(journalSelectors.selectIsLoadingCoachEntries(store.getState())).toBe(false);
    expect(journalSelectors.selectJournalError(store.getState())).toBeNull();
  });

  it("never fetches with nobody signed in, and leaves no spinner behind when it does not", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    store.dispatch(journalActions.fetchAthleteEntries());
    store.dispatch(journalActions.fetchCoachEntries());
    await waitUntil(
      () =>
        journalSelectors.selectIsLoadingAthleteEntries(store.getState()) === false &&
        journalSelectors.selectIsLoadingCoachEntries(store.getState()) === false,
      "both loading flags to go back down without a request",
    );

    expect(fetchMock).not.toHaveBeenCalled();
    // Nothing went wrong, so nobody is told anything did.
    expect(journalSelectors.selectJournalError(store.getState())).toBeNull();
  });
});
