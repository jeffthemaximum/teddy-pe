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

const TEDDY_LOGIN = {
  jwt: "TEDDY-TOKEN",
  user: { id: 2, email: "teddy@example.com", name: "Teddy", role: "athlete" as const },
};

const JEFF_LOGIN = {
  jwt: "JEFF-TOKEN-ONLINE",
  user: { id: 1, email: "jeff@example.com", name: "Jeff", role: "coach" as const },
};

// Signs a store in against a mocked /auth/login response, then waits for it
// to land. Every online save below needs a real token to send, or an
// assertion that it sent one proves nothing.
async function signInFor(
  store: ReturnType<typeof createCoreStore>,
  login: typeof TEDDY_LOGIN | typeof JEFF_LOGIN,
): Promise<void> {
  store.dispatch(authActions.signIn({ email: login.user.email, password: "hunter2" }));
  await waitUntil(
    () => authSelectors.selectIsSignedIn(store.getState()),
    `${login.user.name} to be signed in`,
  );
}

describe("outbox end-to-end: a note typed offline reaches the API when the connection comes back", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("queues the note while offline, then sends exactly what was typed once fetch works again, and learns the server's id", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });

    // Signed in before the note is ever typed. A queued write with no
    // recorded author is never replayed (see ducks/outbox/selectors.ts), so
    // a fixture that stayed signed out here would only prove the package can
    // send a write nobody owns, which fix 1 says it must not.
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/api/v1/auth/login")
        ? respond(200, TEDDY_LOGIN)
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    store.dispatch(authActions.signIn({ email: "teddy@example.com", password: "hunter2" }));
    await waitUntil(
      () => authSelectors.selectIsSignedIn(store.getState()),
      "the sign-in to finish, so the queued write has a real author",
    );

    store.dispatch(
      journalActions.saveAthleteEntry({
        // The program year every write has to name: both controllers open
        // with `ProgramYear.find(entry_params.fetch(:program_year_id))`.
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "Landed three in a row on the low balance beam.",
        shared: false,
      }),
    );
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline save to land in the outbox queue",
    );

    // Nothing reached the server: the attempt was made and failed, and
    // nothing about it is recorded as saved. One call for the sign-in, one
    // for the /me check the sign-in saga now makes right after (it fails
    // offline too, the same as everything else here, and signs no one out
    // for it), and one for the failed save.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())).toBeNull();

    // The entry is queued rather than lost, and it is Teddy's.
    const queue = outboxSelectors.selectQueue(store.getState());
    expect(queue[0]!.action.dedupeKey).toBe("athlete:2026-09-17");
    expect(queue[0]!.userId).toBe(TEDDY_LOGIN.user.id);

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
    // for the server, under Teddy's own token: a write with a real author is
    // never sent anonymously.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TEDDY_LOGIN.jwt}`);
    // AthleteEntriesController#create opens with
    // `ProgramYear.find(entry_params.fetch(:program_year_id))`, and `fetch`
    // raises on a missing key, so a body without it is a 400 every time.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
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
    // Signed in first, the same reason as the test above: an unattributed
    // write is never replayed, so proving this ordering while signed out
    // would only reach it by accident.
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/api/v1/auth/login")
        ? respond(200, TEDDY_LOGIN)
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    store.dispatch(authActions.signIn({ email: "teddy@example.com", password: "hunter2" }));
    await waitUntil(
      () => authSelectors.selectIsSignedIn(store.getState()),
      "the sign-in to finish, so the queued write has a real author",
    );

    store.dispatch(
      journalActions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: 5,
        best: "Landed three in a row.",
        hard: "Staying steady on the beam.",
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
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TEDDY_LOGIN.jwt}`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        // Carried forward from the pending write the toggle replaced, the
        // same way the note is: reaching past it to nothing (or to a stale
        // saved value) is exactly the loss fix 1 exists to stop.
        felt: 5,
        best: "Landed three in a row.",
        hard: "Staying steady on the beam.",
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

  it("an online athlete save names its program year, unwraps what comes back, stops the day spinning, and goes out under the signed-in athlete's own token", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/login")) return respond(200, TEDDY_LOGIN);
      // The sign-in saga's own /me check, right after login. A distinct
      // branch on purpose: answering it with the save's own response body
      // (as a single catch-all branch would) folds a made-up athlete and
      // current_program_year_id into state, and hides the real save behind
      // the wrong call index below.
      if (url.endsWith("/api/v1/me")) {
        return respond(200, { user: TEDDY_LOGIN.user, athlete: null, current_program_year_id: 1 });
      }
      return respond(201, {
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
      });
    });
    await signInFor(store, TEDDY_LOGIN);

    store.dispatch(
      journalActions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "Beat my own record on the ladder.",
        shared: true,
      }),
    );
    await waitUntil(
      () => journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState()) !== null,
      "the saved entry to reach the slice under its own date",
    );

    // Call 0 is login, call 1 is the sign-in saga's own /me check; the save
    // itself is call 2.
    const [url, init] = fetchMock.mock.calls[2]!;
    expect(String(url)).toBe("https://api.test/api/v1/athlete_entries");
    const headers = (init as RequestInit).headers as Record<string, string>;
    // A save with nobody signed in is a bug in the calling screen (see
    // fetchAthleteEntries's own guard), but the save path itself does not
    // check, so this is the only place proving it actually carries the
    // signed-in person's token rather than going out silently anonymous.
    expect(headers.Authorization).toBe(`Bearer ${TEDDY_LOGIN.jwt}`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      athlete_entry: {
        program_year_id: 1,
        session_date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
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

  it("an online coach save sends ratings beside the entry, not inside it, lands in the coach map, and goes out under the signed-in coach's own token", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/login")) return respond(200, JEFF_LOGIN);
      // See the athlete-save test above for why /me gets its own branch
      // rather than falling into the save's response.
      if (url.endsWith("/api/v1/me")) {
        return respond(200, { user: JEFF_LOGIN.user, athlete: null, current_program_year_id: 1 });
      }
      return respond(201, {
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
      });
    });
    await signInFor(store, JEFF_LOGIN);

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

    // Call 0 is login, call 1 is the sign-in saga's own /me check; the save
    // itself is call 2.
    const [, init] = fetchMock.mock.calls[2]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${JEFF_LOGIN.jwt}`);
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
    // Same date on purpose: Teddy and Jeff can both write about the same
    // session, and a fixture that gave each side its own date would let a
    // bug that crossed the two lists hide behind "no entry landed at that
    // key", not a real check that the right content landed in the right
    // map. Full-object equality below, not just an id, is what closes the
    // other half: a swap that happened to preserve an id would still be
    // caught by every other field disagreeing.
    const SHARED_DATE = "2026-09-17";
    const athleteEntry = {
      id: 4,
      session_date: SHARED_DATE,
      program_year_id: 1,
      day_card_id: 12,
      felt: null,
      best: null,
      hard: null,
      note: "Landed three in a row.",
      shared: true,
      updated_at: "2026-09-17T19:02:00Z",
    };
    const coachEntry = {
      id: 9,
      session_date: SHARED_DATE,
      program_year_id: 1,
      day_card_id: 11,
      overall: 4,
      energy: 3,
      flag_pain: false,
      pain_note: null,
      note: "Quick feet all session.",
      challenge_num: null,
      ratings: {},
      updated_at: "2026-09-17T19:10:00Z",
    };

    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/login")) {
        return respond(200, {
          jwt: "JEFF-TOKEN",
          user: { id: 1, email: "jeff@example.com", name: "Jeff", role: "coach" },
        });
      }
      // The sign-in saga's own check, right after login: a distinct branch
      // so it does not fall into the coach_entries catch-all below and get
      // counted as one of "the endpoints below" in the assertions past it.
      if (url.endsWith("/api/v1/me")) {
        return respond(200, {
          user: { id: 1, email: "jeff@example.com", name: "Jeff", role: "coach" },
          athlete: null,
          current_program_year_id: 1,
        });
      }
      if (url.includes("/api/v1/athlete_entries")) {
        return respond(200, { athlete_entries: [athleteEntry] });
      }
      return respond(200, { coach_entries: [coachEntry] });
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

    // Skip login (call 0) and the sign-in saga's own /me check (call 1):
    // neither is one of "the endpoints" these two assertions are about.
    const urls = fetchMock.mock.calls.slice(2).map(([input]) => String(input));
    // No query on the athlete index: the controller takes no parameters and
    // the Pundit scope alone decides what comes back. Both dates on the
    // coach index, because `between` only runs when it has both.
    expect(urls).toContain("https://api.test/api/v1/athlete_entries");
    expect(urls).toContain("https://api.test/api/v1/coach_entries?from=2026-09-14&to=2026-09-20");

    // Every fetch went out with the signed-in token, not anonymously. /me
    // included, this time, since it carries the same token.
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer JEFF-TOKEN" });
    }

    // The whole entry, not just its id: a fixture bug (or a duck bug) that
    // put the right id under the wrong side's fields would fail here even
    // though an id-only check would have missed it.
    expect(journalSelectors.selectAthleteEntryFor(SHARED_DATE)(store.getState())).toEqual(
      athleteEntry,
    );
    expect(journalSelectors.selectCoachEntryFor(SHARED_DATE)(store.getState())).toEqual(coachEntry);
    // And each map holds only its own one entry: neither side's fetch also
    // landed in the other's.
    expect(journalSelectors.selectAthleteEntries(store.getState())).toEqual([athleteEntry]);
    expect(journalSelectors.selectCoachEntries(store.getState())).toEqual([coachEntry]);
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

  it("tells the journal when a replayed entry is thrown away, rather than letting the queue quietly empty", async () => {
    // The whole reason the outbox exists is that words typed at a court are
    // not lost. A write the server rejects for good is lost anyway; what
    // must not happen is losing it silently, with the pending count falling
    // to zero and nothing on screen saying otherwise.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(() =>
      respond(200, {
        jwt: "TEDDY-TOKEN",
        user: { id: 2, email: "teddy@example.com", name: "Teddy", role: "athlete" },
      }),
    );

    // Signed in first, so the queued write has an author and replay will
    // actually send it (see ducks/outbox/types.ts).
    store.dispatch(authActions.signIn({ email: "teddy@example.com", password: "hunter2" }));
    await waitUntil(
      () => authSelectors.selectIsSignedIn(store.getState()),
      "the sign-in to finish",
    );

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    store.dispatch(
      journalActions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "",
        shared: false,
      }),
    );
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline save to land in the outbox queue",
    );

    // The connection is back, and the server has an opinion about this entry
    // that will be the same every time it is asked.
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      respond(422, { error: { code: "invalid", message: "A note cannot be blank." } }),
    );

    store.dispatch(outboxActions.replay());
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 0,
      "the replay to drop the rejected write",
    );

    // The queue is empty, so something has to be true on screen.
    expect(journalSelectors.selectJournalError(store.getState())).toBe(
      "That entry did not save. A note cannot be blank.",
    );
    // And no entry was invented for the day it failed on.
    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())).toBeNull();
  });

  // The delete, through the real store and the real sagas, with only fetch
  // mocked. The URL and the method asserted at the bottom are the whole
  // reason this test exists: everything between the button and the wire gets
  // to be wrong here, and the one thing a unit test mocking apiRequest can
  // never check is what actually goes out.
  it("queues a delete made with no signal, honours it on screen, and sends it to the id-addressed route when the connection returns", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/api/v1/auth/login")
        ? respond(200, TEDDY_LOGIN)
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    await signInFor(store, TEDDY_LOGIN);

    // Two entries already on record, and only one of them is deleted. One
    // entry would make an empty journal look like a working delete.
    const entry = (id: number, date: string, best: string) => ({
      id,
      session_date: date,
      program_year_id: 1,
      day_card_id: null,
      felt: 4,
      best,
      hard: null,
      note: "x",
      shared: false,
      updated_at: "2026-09-17T19:00:00Z",
    });
    store.dispatch({
      type: "journal/ATHLETE_ENTRIES_FETCHED",
      payload: [
        entry(501, "2026-09-16", "The wall rally"),
        entry(502, "2026-09-17", "The one he took back"),
      ],
    });

    store.dispatch(journalActions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 502 }));
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline delete to land in the outbox queue",
    );

    // He asked for it gone, so it is gone here, even though the server has
    // not heard about it yet. The day beside it is untouched.
    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())).toBeNull();
    expect(journalSelectors.selectAthleteEntryFor("2026-09-16")(store.getState())?.best).toBe(
      "The wall rally",
    );

    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      respond(200, { deleted: { id: 502, session_date: "2026-09-17" } }),
    );

    store.dispatch(outboxActions.replay());
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 0,
      "the replay to send the delete and clear the queue",
    );

    // Transcribed from routes.rb and the controller, not from anything in
    // this package: DELETE /api/v1/athlete_entries/:id, no body.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/api/v1/athlete_entries/502");
    expect((init as RequestInit).method).toBe("DELETE");
    expect((init as RequestInit).body).toBeUndefined();
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TEDDY_LOGIN.jwt}`,
    );

    // Still gone, and nothing was reported as having failed.
    expect(journalSelectors.selectAthleteEntryFor("2026-09-17")(store.getState())).toBeNull();
    expect(journalSelectors.selectAthleteEntryFor("2026-09-16")(store.getState())).not.toBeNull();
    expect(journalSelectors.selectJournalError(store.getState())).toBeNull();
  });

  // The dedupe rule, end to end. Offline he edits a day and then deletes it:
  // one write goes out, and it is the delete.
  it("replaces a pending edit of a day with the delete of that same day", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/api/v1/auth/login")
        ? respond(200, TEDDY_LOGIN)
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    await signInFor(store, TEDDY_LOGIN);

    store.dispatch(
      journalActions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: 3,
        best: "Something he then thought better of.",
        hard: null,
        note: "Something he then thought better of.",
        shared: false,
      }),
    );
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 1,
      "the offline edit to queue",
    );

    store.dispatch(journalActions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 502 }));
    await waitUntil(
      () =>
        outboxSelectors.selectQueue(store.getState())[0]?.action.request.method === "DELETE",
      "the delete to replace the queued edit",
    );
    expect(outboxSelectors.selectQueue(store.getState())).toHaveLength(1);

    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      respond(200, { deleted: { id: 502, session_date: "2026-09-17" } }),
    );
    store.dispatch(outboxActions.replay());
    await waitUntil(
      () => outboxSelectors.selectQueue(store.getState()).length === 0,
      "the replay to finish",
    );

    // One request, and it is the delete. The edit never reaches the server,
    // which is right: he took the day back after typing it.
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.test/api/v1/athlete_entries/502");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});
