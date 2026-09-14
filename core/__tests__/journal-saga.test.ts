import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/journal/actions";
import { journalWorkers } from "../src/ducks/journal/sagas";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import { sessionExpired } from "../src/ducks/auth/actions";
import { enqueue } from "../src/ducks/outbox/actions";
import type { JournalState } from "../src/ducks/journal";
import type { OutboxState } from "../src/ducks/outbox";
import type { Week } from "../src/types";

const config = { baseUrl: "https://api.test", storage: memoryStorage(), logger: silentLogger, timeoutMs: 15000 };

const emptyJournal: JournalState = {
  coach: {},
  athlete: {},
  saving: {},
  loading: { athlete: false, coach: false },
  error: null,
};
// `signedInUserId` and each write's `userId` are the outbox's own
// author-stamping (see ducks/outbox/types.ts). They matter here because
// `setShared` reads the queue through `selectQueue`, which shows only the
// signed-in person's writes: a fixture whose writes belonged to nobody would
// look empty to the very lookup these tests are about.
const SIGNED_IN_USER = 3;
const emptyOutbox: OutboxState = { queue: [], replaying: false, signedInUserId: SIGNED_IN_USER };

function harness(
  overrides: { journal?: JournalState; outbox?: OutboxState; token?: string | null } = {},
) {
  const journal = overrides.journal ?? emptyJournal;
  const outbox = overrides.outbox ?? emptyOutbox;
  const token = overrides.token === undefined ? "a.b.c" : overrides.token;
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (worker: unknown, action?: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          // `auth.user` is here because the outbox scopes its queue to
          // whoever is signed in (outbox/selectors.ts reads `auth.user?.id`),
          // and `setShared` looks a pending write up through that selector. A
          // harness with a token but no user would hide every queued write
          // from the lookup these tests exist to check.
          getState: () => ({
            auth: { token, user: token ? { id: SIGNED_IN_USER } : null },
            journal,
            outbox,
          }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worker as any,
        action,
      ).toPromise(),
  };
}

// Every real column, the same reasoning as the reducer test's fixture: a
// response missing program_year_id/day_card_id/felt/best/hard is not a shape
// the API can actually send.
const savedAthleteEntry = {
  id: 4,
  session_date: "2026-09-17",
  program_year_id: 1,
  day_card_id: 12,
  felt: null,
  best: null,
  hard: null,
  note: "x",
  shared: true,
  updated_at: "2026-09-17T19:02:00Z",
};

const savedCoachEntry = {
  id: 9,
  session_date: "2026-09-17",
  program_year_id: 1,
  day_card_id: 12,
  overall: 4,
  energy: 3,
  flag_pain: false,
  pain_note: null,
  note: "Good balance today.",
  challenge_num: null,
  ratings: { "cartwheel-prep": "getting" as const },
  updated_at: "2026-09-17T19:10:00Z",
};

// What the controllers actually render. `render json: { athlete_entry:
// serialize(entry) }` and `render json: { coach_entry: serialize(entry) }`,
// for create, update and the replayed copy of either. Mocking the bare entry
// here is what let this suite stay green while every save in the package
// filed its result under the key "undefined".
const athleteEnvelope = { athlete_entry: savedAthleteEntry };
const coachEnvelope = { coach_entry: savedCoachEntry };

describe("the journal saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("names the program year on an athlete save, because a save without one is a 400", async () => {
    // AthleteEntriesController#create opens with
    // `ProgramYear.find(entry_params.fetch(:program_year_id))`. `fetch`
    // raises ParameterMissing on a missing key, which ApiController renders
    // as 400, so a body without this field never reached the database at
    // all. The deployed API answers the old body with:
    // {"error":{"code":"bad_request","message":"param is missing or the
    // value is empty or invalid: program_year_id"}}
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "x", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/athlete_entries",
        body: {
          athlete_entry: {
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "x",
            shared: true,
          },
        },
      }),
    );
  });

  it("sends shared exactly as given, without interpreting it, and files the entry out of its envelope", async () => {
    jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "x", shared: true }),
    );

    // The entry, not the wrapper around it. `athleteEntrySaved(envelope)`
    // would key the day under `undefined` and leave its spinner running.
    expect(h.dispatched).toContainEqual(actions.athleteEntrySaved(savedAthleteEntry));
  });

  it("saves a coach entry to its own endpoint, program year and ratings included", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(coachEnvelope);
    const h = harness();
    const payload = {
      programYearId: 1,
      date: "2026-09-17",
      note: "Good balance today.",
      overall: 4,
      energy: 3,
      flag_pain: false,
      pain_note: null,
      challenge_num: null,
      ratings: { "cartwheel-prep": "getting" as const },
    };

    await h.run(journalWorkers.saveCoachEntry, actions.saveCoachEntry(payload));

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/coach_entries",
        body: {
          coach_entry: {
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "Good balance today.",
            overall: 4,
            energy: 3,
            flag_pain: false,
            pain_note: null,
            challenge_num: null,
          },
          // Beside the entry, not inside it: ratings_param reads
          // `params[:ratings]` and entry_params does not permit it.
          ratings: { "cartwheel-prep": "getting" },
        },
      }),
    );
    expect(h.dispatched).toContainEqual(actions.coachEntrySaved(savedCoachEntry));
  });

  it("refuses a save response it cannot read as an entry, rather than filing the wrapper and spinning forever", async () => {
    // The exact shape the duck used to accept: an entry with no envelope
    // around it, which is not what either controller sends. Whatever this
    // is, it is not an entry this duck can key by date, so the day stops
    // saving and says so instead of going quiet.
    jest.spyOn(client, "apiRequest").mockResolvedValue(savedAthleteEntry);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "x", shared: true }),
    );

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "journal/ATHLETE_ENTRY_SAVED")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(
      actions.saveFailed({
        date: "2026-09-17",
        message: "That save came back in a shape this app could not read. Try again.",
      }),
    );
  });

  // --- setShared: which note it carries forward, proved ordering by ordering ---
  //
  // The bug this whole block guards against: a note typed offline is queued
  // and has never been anywhere near the server, so it is not in
  // `selectAthleteEntryFor`'s map. That map is written only by a response
  // the server actually sent (`athleteEntrySaved`, an index fetch, or the
  // week payload). A version of `setShared` that only ever looks there falls
  // back to `""` for exactly the case that matters most (type a note
  // offline, then toggle before it ever syncs), and the toggle's own save
  // replaces the queued write with an empty note. The words are gone, having
  // never left the device.

  it("carries a note forward from the outbox's pending write for THIS date (ordering A: note typed offline, then the toggle), the case the fix exists for", async () => {
    // A queue holding only one write cannot tell "the write for this date"
    // apart from "the first write in the queue": `queue.find(matching
    // dedupeKey)` and `queue[0]` return the same thing, and a version that
    // carries Tuesday's note into Wednesday's entry would pass anyway. So
    // this queues three writes: one for a different date under the same
    // `athlete:` prefix, one for the same date but the `coach:` prefix (a
    // different person's writing on the same day), and the one that
    // actually belongs to this save, in an order where the wrong one, not
    // the right one, sits at index 0.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const wrongDate = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-16", note: "Tuesday's note.", shared: false });
    const wrongPrefixSameDate = actions.saveCoachEntry({
      programYearId: 1,
      date: "2026-09-17",
      note: "Jeff's note, not Teddy's.",
      overall: null,
      energy: null,
      flag_pain: false,
      pain_note: null,
      challenge_num: null,
      ratings: {},
    });
    const correctWrite = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "Landed three.", shared: false });
    const h = harness({
      // The note exists ONLY here: queued, never saved. `journal.athlete`
      // stays empty, unlike the old version of this test, which seeded the
      // note through `athleteEntrySaved` and so could never have caught this.
      outbox: {
        queue: [
          { id: "0", action: wrongDate, queuedAt: "2026-09-16T18:00:00Z", attempts: 0, userId: SIGNED_IN_USER },
          { id: "2", action: wrongPrefixSameDate, queuedAt: "2026-09-17T18:05:00Z", attempts: 0, userId: SIGNED_IN_USER },
          { id: "1", action: correctWrite, queuedAt: "2026-09-17T18:00:00Z", attempts: 0, userId: SIGNED_IN_USER },
        ],
        replaying: false,
        signedInUserId: SIGNED_IN_USER,
      },
    });

    await h.run(
      journalWorkers.setShared,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        body: {
          athlete_entry: {
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "Landed three.",
            shared: true,
          },
        },
      }),
    );
  });

  it("prefers the pending queued note over an older saved entry, when both exist for the date", async () => {
    // The queued write is the more recent truth: it is whatever was typed
    // most recently and has not reached the server yet, so it must win over
    // a server response that is now stale.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const pendingWrite = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "Four in a row now.", shared: false });
    const h = harness({
      journal: {
        ...emptyJournal,
        athlete: { "2026-09-17": { ...savedAthleteEntry, note: "Landed three.", shared: false } },
      },
      outbox: {
        queue: [{ id: "1", action: pendingWrite, queuedAt: "2026-09-17T18:00:00Z", attempts: 0, userId: SIGNED_IN_USER }],
        replaying: false,
        signedInUserId: SIGNED_IN_USER,
      },
    });

    await h.run(
      journalWorkers.setShared,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        body: {
          athlete_entry: {
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "Four in a row now.",
            shared: true,
          },
        },
      }),
    );
  });

  it("carries a saved entry's note forward when there is nothing pending (ordering E: note saved online, then the toggle offline)", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness({
      journal: {
        ...emptyJournal,
        athlete: { "2026-09-17": { ...savedAthleteEntry, note: "Landed three.", shared: false } },
      },
    });

    await h.run(
      journalWorkers.setShared,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        body: {
          athlete_entry: {
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "Landed three.",
            shared: true,
          },
        },
      }),
    );
  });

  it("sends an empty note rather than inventing one, when nothing was saved or queued for the date at all", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({
      athlete_entry: { ...savedAthleteEntry, note: "", shared: true },
    });
    const h = harness();

    await h.run(
      journalWorkers.setShared,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        body: {
          athlete_entry: {
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "",
            shared: true,
          },
        },
      }),
    );
  });

  it("carries the program year through the toggle, so flipping the switch is not a 400 either", async () => {
    // setShared builds a full saveAthleteEntry, so it needs the year the
    // same way a note save does. It is passed in rather than read off an
    // entry in state, because offline there may be no entry in state at all.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness();

    await h.run(
      journalWorkers.setShared,
      actions.setShared({ programYearId: 7, date: "2026-09-17", shared: true }),
    );

    const body = spy.mock.calls[0]![1].body as { athlete_entry: { program_year_id: number } };
    expect(body.athlete_entry.program_year_id).toBe(7);
  });

  it("queues the entry instead of losing it when there is no connection", async () => {
    // This is the failure the rewrite exists partly to fix. A tennis court is
    // exactly where it happens, and the old page dropped the entry on the
    // floor.
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness();

    const action = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "Landed three.", shared: false });
    await h.run(journalWorkers.saveAthleteEntry, action);

    expect(h.dispatched).toContainEqual(enqueue(action));
    // And the day stops "saving": it is queued now, not in flight, and not
    // failed either.
    expect(h.dispatched).toContainEqual(actions.saveQueued({ date: "2026-09-17" }));
  });

  it("also queues on a timeout, not only a dead connection", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "timeout", "That took too long."));
    const h = harness();
    const action = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "x", shared: false });

    await h.run(journalWorkers.saveAthleteEntry, action);

    expect(h.dispatched).toContainEqual(enqueue(action));
  });

  it("does not queue a rejection the server actually made a decision about", async () => {
    // A 422 will fail again identically on replay, so queueing it would retry
    // forever and hide a real problem.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(422, "invalid", "A note cannot be blank."));
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "", shared: false }),
    );

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(actions.saveFailed({ date: "2026-09-17", message: "A note cannot be blank." }));
  });

  it("signs out on a dead token rather than queueing forever", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", note: "x", shared: false }),
    );

    expect(h.dispatched).toContainEqual(sessionExpired());
    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).not.toContainEqual(
      actions.saveFailed({ date: "2026-09-17", message: "Invalid or missing token." }),
    );
    // handleSaveFailure dispatches nothing else on this branch: it relies on
    // the reducer clearing `saving[date]` when SESSION_EXPIRED itself lands
    // (see journal-reducer.test.ts), not on a second dispatch from here.
  });

  // --- The two reads. Without them the journal screens open empty. ---

  it("asks the athlete index for nothing but the list, because that controller takes no parameters", async () => {
    // AthleteEntriesController#index is `policy_scope(AthleteEntry)
    // .order(:session_date)` and nothing else. A query string it does not
    // read would be a client inventing a filter the server does not have.
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockResolvedValue({ athlete_entries: [savedAthleteEntry] });
    const h = harness();

    await h.run(journalWorkers.fetchAthleteEntries, actions.fetchAthleteEntries());

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ path: "/api/v1/athlete_entries", token: "a.b.c" }),
    );
    // The list out of its envelope, the same unwrap a save goes through.
    expect(h.dispatched).toContainEqual(actions.athleteEntriesFetched([savedAthleteEntry]));
  });

  it("sends both ends of the range to the coach index, or neither", async () => {
    // `entries.between(params[:from], params[:to]) if params[:from] &&
    // params[:to]`: one date alone is silently ignored by the controller, so
    // this never sends one alone.
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockResolvedValue({ coach_entries: [savedCoachEntry] });
    const h = harness();

    await h.run(
      journalWorkers.fetchCoachEntries,
      actions.fetchCoachEntries({ from: "2026-09-14", to: "2026-09-20" }),
    );
    await h.run(journalWorkers.fetchCoachEntries, actions.fetchCoachEntries());

    expect(spy.mock.calls.map((c) => c[1].path)).toEqual([
      "/api/v1/coach_entries?from=2026-09-14&to=2026-09-20",
      "/api/v1/coach_entries",
    ]);
    expect(h.dispatched).toContainEqual(actions.coachEntriesFetched([savedCoachEntry]));
  });

  it("drops a row from a list that is not an entry, rather than keying it under undefined", async () => {
    // One bad row costs that row, not the screen. `{id: 3}` has no
    // session_date, so there is no date to file it under.
    jest
      .spyOn(client, "apiRequest")
      .mockResolvedValue({ athlete_entries: [savedAthleteEntry, { id: 3 }] });
    const h = harness();

    await h.run(journalWorkers.fetchAthleteEntries, actions.fetchAthleteEntries());

    expect(h.dispatched).toContainEqual(actions.athleteEntriesFetched([savedAthleteEntry]));
  });

  it("never fetches with nobody signed in, and puts the loading flag back when it does not", async () => {
    // Nothing about Teddy is fetchable unauthenticated, so an anonymous
    // fetch is a bug in the calling screen. It must not leave a spinner
    // running, and must not tell a person anything failed.
    const spy = jest.spyOn(client, "apiRequest");
    const h = harness({ token: null });

    await h.run(journalWorkers.fetchAthleteEntries, actions.fetchAthleteEntries());
    await h.run(journalWorkers.fetchCoachEntries, actions.fetchCoachEntries());

    expect(spy).not.toHaveBeenCalled();
    expect(h.dispatched).toEqual([
      actions.fetchEntriesSkipped({ side: "athlete" }),
      actions.fetchEntriesSkipped({ side: "coach" }),
    ]);
  });

  it("signs out when the index says the token is dead", async () => {
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(journalWorkers.fetchAthleteEntries, actions.fetchAthleteEntries());

    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("reports a failed read against the side that failed, so the other list keeps its own state", async () => {
    // A cold Fly machine times out at 6.6 to 7.6 seconds and that is normal
    // here. It is reported, not signed out, and only the coach list stops
    // loading.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(0, "timeout", "That took too long. Try again."));
    const h = harness();

    await h.run(journalWorkers.fetchCoachEntries, actions.fetchCoachEntries());

    expect(h.dispatched).toEqual([
      actions.fetchEntriesFailed({ side: "coach", message: "That took too long. Try again." }),
    ]);
  });

  // --- The week payload's inline copies ---

  it("folds the week payload's own entries into the journal slice, so a day card and the journal cannot disagree", async () => {
    // `week_payload.rb` serializes `coach_entry` and `athlete_entry` inline
    // on each day card, through the same two serializers the entry endpoints
    // use. That is a second copy of a row this slice owns. One rule: the
    // journal slice is where an entry lives, and the week's copies are
    // folded into it here the moment the week loads.
    const h = harness();
    const weekPayload = {
      days: [
        { date: "2026-09-16", athlete_entry: null, coach_entry: savedCoachEntry },
        { date: "2026-09-17", athlete_entry: savedAthleteEntry, coach_entry: null },
        // A day with neither, which is most of them.
        { date: "2026-09-18" },
      ],
    } as unknown as Week;

    await h.run(journalWorkers.foldWeekEntries, { type: "week/SUCCEEDED", payload: weekPayload });

    expect(h.dispatched).toContainEqual(actions.athleteEntriesFetched([savedAthleteEntry]));
    expect(h.dispatched).toContainEqual(actions.coachEntriesFetched([savedCoachEntry]));
  });

  it("dispatches nothing for a week with no entries on it at all", async () => {
    // Which is every week before anyone writes in it. A screen must not see
    // an empty fold as a list arriving.
    const h = harness();
    const weekPayload = {
      days: [{ date: "2026-09-16", athlete_entry: null, coach_entry: null }],
    } as unknown as Week;

    await h.run(journalWorkers.foldWeekEntries, { type: "week/SUCCEEDED", payload: weekPayload });

    expect(h.dispatched).toHaveLength(0);
  });

  // --- The replay path, which comes from the same controller ---

  it("folds a replayed athlete write's server response into state, id included", async () => {
    // The write was queued offline with no real id. This is how the duck
    // learns the real one, without a second round trip to re-fetch it. The
    // response came from the same controller a live save did, so it arrives
    // in the same envelope and goes through the same unwrap.
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "athlete:2026-09-17", response: athleteEnvelope },
    });

    expect(h.dispatched).toContainEqual(actions.athleteEntrySaved(savedAthleteEntry));
  });

  it("folds a replayed coach write the same way, into the coach map", async () => {
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "coach:2026-09-17", response: coachEnvelope },
    });

    expect(h.dispatched).toContainEqual(actions.coachEntrySaved(savedCoachEntry));
  });

  it("ignores a replayed write that belongs to some other duck", async () => {
    // A test result's queued write replays too, and it is not this duck's
    // business. Recognizing only its own two prefixes is what keeps it that
    // way.
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "result:2026-09:t1", response: { anything: true } },
    });

    expect(h.dispatched).toHaveLength(0);
  });

  it("ignores a replayed write whose response is not a journal entry at all, even under its own prefix", async () => {
    // A malformed or unrelated body under an `athlete:`/`coach:` key must not
    // get filed under the literal key "undefined": session_date is what
    // makes something an entry at all.
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "athlete:2026-09-17", response: { error: "nope" } },
    });

    expect(h.dispatched).toHaveLength(0);
  });

  it("ignores a plausible-looking stub inside a real envelope, rather than overwriting a real entry with it", async () => {
    // `{athlete_entry: {session_date: "2026-09-17"}}` has the right wrapper
    // and a real-looking key and nothing else. Folding it in would replace
    // whatever real entry was on record for that date with a stub carrying
    // no note, no id, nothing. `note` may legitimately be `null` on a real
    // entry (that is still accepted), but it must be present for something
    // to count as an entry at all.
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: {
        id: "1",
        dedupeKey: "athlete:2026-09-17",
        response: { athlete_entry: { session_date: "2026-09-17" } },
      },
    });

    expect(h.dispatched).toHaveLength(0);
  });

  // --- A replay the server rejected for good ---

  it("says so when a replayed entry is rejected for good, instead of letting the pending count read as sent", async () => {
    // The loss this guards against: Teddy queues a note at a court with no
    // signal, the queue replays, the server rejects it permanently, the
    // write is dropped, and the pending count falls to zero. Nothing else in
    // the app distinguishes that from a successful send.
    const h = harness();

    await h.run(journalWorkers.reconcileReplayFailure, {
      type: "outbox/REPLAY_FAILED",
      payload: {
        id: "1",
        dedupeKey: "athlete:2026-09-17",
        permanent: true,
        message: "A note cannot be blank.",
      },
    });

    expect(h.dispatched).toEqual([
      actions.saveFailed({
        date: "2026-09-17",
        message: "That entry did not save. A note cannot be blank.",
      }),
    ]);
  });

  it("reports a rejected coach write against its own date too", async () => {
    const h = harness();

    await h.run(journalWorkers.reconcileReplayFailure, {
      type: "outbox/REPLAY_FAILED",
      payload: {
        id: "1",
        dedupeKey: "coach:2026-09-20",
        permanent: true,
        message: "Overall must be between 1 and 5.",
      },
    });

    expect(h.dispatched).toEqual([
      actions.saveFailed({
        date: "2026-09-20",
        message: "That entry did not save. Overall must be between 1 and 5.",
      }),
    ]);
  });

  it("says nothing when the write is still owed", async () => {
    // Offline, a timeout, or a dead token: the write stays on the queue and
    // goes out later. Telling somebody their entry failed when it is only
    // waiting for signal is the same mistake `saveQueued` exists to avoid.
    const h = harness();

    await h.run(journalWorkers.reconcileReplayFailure, {
      type: "outbox/REPLAY_FAILED",
      payload: {
        id: "1",
        dedupeKey: "athlete:2026-09-17",
        permanent: false,
        message: "No connection. Check the network and try again.",
      },
    });

    expect(h.dispatched).toHaveLength(0);
  });

  it("leaves another duck's rejected write to that duck", async () => {
    const h = harness();

    await h.run(journalWorkers.reconcileReplayFailure, {
      type: "outbox/REPLAY_FAILED",
      payload: {
        id: "1",
        dedupeKey: "result:2026-09:t1",
        permanent: true,
        message: "That value is not a number.",
      },
    });

    expect(h.dispatched).toHaveLength(0);
  });

  it("still accepts a real entry whose note is genuinely null", async () => {
    // The guard must reject a missing `note`, not merely a falsy one: a
    // coach entry saved before Jeff writes anything is `note: null` and is a
    // real row, not a stub.
    const h = harness();
    const nullNoteEntry = { ...savedCoachEntry, note: null };

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "coach:2026-09-17", response: { coach_entry: nullNoteEntry } },
    });

    expect(h.dispatched).toContainEqual(actions.coachEntrySaved(nullNoteEntry));
  });
});
