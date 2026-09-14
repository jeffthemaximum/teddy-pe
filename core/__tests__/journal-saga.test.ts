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
      actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: 4,
        best: "Landed three in a row.",
        hard: "Staying balanced on the low beam.",
        note: "x",
        shared: true,
      }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/athlete_entries",
        // Only the field this particular test is about. `felt`, `best` and
        // `hard` are on the real body too now (see the next test, which
        // checks the whole permitted list); `objectContaining` here on
        // purpose, so this test stays about `program_year_id` and does not
        // start failing every time another field is added to the payload.
        body: expect.objectContaining({
          athlete_entry: expect.objectContaining({
            program_year_id: 1,
            session_date: "2026-09-17",
            note: "x",
            shared: true,
          }),
        }),
      }),
    );
  });

  // The body is asserted against `entry_params.permit(:program_year_id,
  // :session_date, :felt, :best, :hard, :note, :shared)`, read straight off
  // AthleteEntriesController, not against whatever `athleteRequest` happens
  // to build today. That distinction is the whole point of this test: the
  // one it replaces asserted a body with only `program_year_id`,
  // `session_date`, `note` and `shared` on it, which passed for months
  // while `felt`, `best` and `hard` were silently dropped before the wire,
  // because that body was every field the OLD `SaveAthleteEntryPayload`
  // happened to have, not every field the controller actually permits. A
  // test built from the same narrow idea of "an athlete save" the code
  // itself held could never have caught the code being wrong about that
  // idea.
  //
  // Delete `felt`, `best` or `hard` from `athleteRequest`'s body today and
  // this fails, because the object below is the permitted list transcribed
  // by hand from the controller, not copied from `actions.ts`.
  it("sends every field AthleteEntriesController permits, felt/best/hard included, not only note and shared", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: 4,
        best: "Landed three in a row.",
        hard: "Staying balanced on the low beam.",
        note: "Good day today.",
        shared: true,
      }),
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
            felt: 4,
            best: "Landed three in a row.",
            hard: "Staying balanced on the low beam.",
            note: "Good day today.",
            shared: true,
          },
        },
      }),
    );
  });

  // A blank field is not the same as a field nobody asked about: he might
  // rate how it felt and write nothing for what was hard, and that nothing
  // has to reach the server as `null`, never as `""`, or a screen reading
  // the save back could not tell "he skipped this" from "he wrote an empty
  // string on purpose."
  it("sends null for a reflection field he left blank, not an empty string", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: "Staying balanced on the low beam.",
        note: "x",
        shared: true,
      }),
    );

    const body = spy.mock.calls[0]![1].body as {
      athlete_entry: { felt: unknown; best: unknown; hard: unknown };
    };
    expect(body.athlete_entry.felt).toBeNull();
    expect(body.athlete_entry.best).toBeNull();
    expect(body.athlete_entry.hard).toBe("Staying balanced on the low beam.");
  });

  it("sends shared exactly as given, without interpreting it, and files the entry out of its envelope", async () => {
    jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "x",
        shared: true,
      }),
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
      actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "x",
        shared: true,
      }),
    );

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "journal/ATHLETE_ENTRY_SAVED")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(
      actions.saveFailed({
        date: "2026-09-17",
        message: "That save came back in a shape this app could not read. Try again.",
      }),
    );
  });

  // --- setShared: which entry it carries forward, proved ordering by ordering ---
  //
  // The bug this whole block guards against: a note typed offline is queued
  // and has never been anywhere near the server, so it is not in
  // `selectAthleteEntryFor`'s map. That map is written only by a response
  // the server actually sent (`athleteEntrySaved`, an index fetch, or the
  // week payload). A version of `setShared` that only ever looks there falls
  // back to `""` for exactly the case that matters most (type a note
  // offline, then toggle before it ever syncs), and the toggle's own save
  // replaces the queued write with an empty note. The words are gone, having
  // never left the device. `felt`, `best` and `hard` now travel the same
  // path `note` does, so every test below carries them too, not as
  // decoration: a `setShared` that reached past a pending `felt`/`best`/
  // `hard` to a stale saved value, or invented `null` outright, would erase
  // exactly what fix 1 exists to stop losing.

  it("carries an entry forward from the outbox's pending write for THIS date (ordering A: written offline, then the toggle), the case the fix exists for", async () => {
    // A queue holding only one write cannot tell "the write for this date"
    // apart from "the first write in the queue": `queue.find(matching
    // dedupeKey)` and `queue[0]` return the same thing, and a version that
    // carries Tuesday's entry into Wednesday's would pass anyway. So this
    // queues three writes: one for a different date under the same
    // `athlete:` prefix, one for the same date but the `coach:` prefix (a
    // different person's writing on the same day), and the one that
    // actually belongs to this save, in an order where the wrong one, not
    // the right one, sits at index 0. Each of the two athlete writes carries
    // its own distinct `felt`/`best`/`hard`, not just its own note, so a
    // version of `setShared` that carried the wrong write's note forward
    // correctly but still reached for the wrong write's (or no write's)
    // reflection fields would still be caught here.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const wrongDate = actions.saveAthleteEntry({
      programYearId: 1,
      date: "2026-09-16",
      felt: 2,
      best: "Tuesday's best.",
      hard: "Tuesday's hard part.",
      note: "Tuesday's note.",
      shared: false,
    });
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
    const correctWrite = actions.saveAthleteEntry({
      programYearId: 1,
      date: "2026-09-17",
      felt: 5,
      best: "Landed three in a row.",
      hard: "Staying steady on the beam.",
      note: "Landed three.",
      shared: false,
    });
    const h = harness({
      // The entry exists ONLY here: queued, never saved. `journal.athlete`
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
            felt: 5,
            best: "Landed three in a row.",
            hard: "Staying steady on the beam.",
            note: "Landed three.",
            shared: true,
          },
        },
      }),
    );
  });

  it("prefers the pending queued entry over an older saved one, when both exist for the date", async () => {
    // The queued write is the more recent truth: it is whatever was typed
    // most recently and has not reached the server yet, so it must win over
    // a server response that is now stale, for `felt`/`best`/`hard` exactly
    // as much as for `note`.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const pendingWrite = actions.saveAthleteEntry({
      programYearId: 1,
      date: "2026-09-17",
      felt: 5,
      best: "Four in a row now.",
      hard: "Nothing, today went great.",
      note: "Four in a row now.",
      shared: false,
    });
    const h = harness({
      journal: {
        ...emptyJournal,
        athlete: {
          "2026-09-17": {
            ...savedAthleteEntry,
            felt: 3,
            best: "Landed three.",
            hard: "Wobbled on the dismount.",
            note: "Landed three.",
            shared: false,
          },
        },
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
            felt: 5,
            best: "Four in a row now.",
            hard: "Nothing, today went great.",
            note: "Four in a row now.",
            shared: true,
          },
        },
      }),
    );
  });

  it("carries a saved entry forward when there is nothing pending (ordering E: saved online, then the toggle offline)", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
    const h = harness({
      journal: {
        ...emptyJournal,
        athlete: {
          "2026-09-17": {
            ...savedAthleteEntry,
            felt: 4,
            best: "Landed three.",
            hard: "Keeping my arms straight.",
            note: "Landed three.",
            shared: false,
          },
        },
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
            felt: 4,
            best: "Landed three.",
            hard: "Keeping my arms straight.",
            note: "Landed three.",
            shared: true,
          },
        },
      }),
    );
  });

  it("sends an empty note and null reflection fields rather than inventing any of them, when nothing was saved or queued for the date at all", async () => {
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
            felt: null,
            best: null,
            hard: null,
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

    const action = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "Landed three.", shared: false });
    await h.run(journalWorkers.saveAthleteEntry, action);

    expect(h.dispatched).toContainEqual(enqueue(action));
    // And the day stops "saving": it is queued now, not in flight, and not
    // failed either.
    expect(h.dispatched).toContainEqual(actions.saveQueued({ date: "2026-09-17" }));
  });

  it("also queues on a timeout, not only a dead connection", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "timeout", "That took too long."));
    const h = harness();
    const action = actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "x", shared: false });

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
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "", shared: false }),
    );

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(actions.saveFailed({ date: "2026-09-17", message: "A note cannot be blank." }));
  });

  it("signs out on a dead token rather than queueing forever", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "x", shared: false }),
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

  it("drops a row that has a session_date and a note but no updated_at, since the fold rule has nothing to order it by", async () => {
    // Neither of the two fixtures above reaches this: `{id: 3}` fails on
    // session_date, and the plausible-looking stub below fails on note. This
    // one has everything isEntry otherwise asks for and only fails on
    // `updated_at`, which is the one check nothing else pins: deleting it
    // from isEntry (api.ts) leaves every other test in the suite green,
    // because a stampless copy would then compare as `held.updated_at >
    // undefined` (false) and always win the fold in reducer.ts, replacing a
    // real entry with a stub that has no date to prove it wrong.
    jest.spyOn(client, "apiRequest").mockResolvedValue({
      athlete_entries: [savedAthleteEntry, { session_date: "2026-09-20", note: "no stamp at all" }],
    });
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

  // ---- deleting an entry --------------------------------------------------
  //
  // The route and the answer are transcribed by hand from the Rails side, not
  // imported from anywhere in this package:
  //
  //   resources :athlete_entries, only: %i[index show create update destroy]
  //   resources :coach_entries,   only: %i[index create update destroy]
  //
  //   def destroy
  //     entry = policy_scope(AthleteEntry).find(params[:id])
  //     authorize entry
  //     entry.soft_delete!
  //     render json: { deleted: { id: entry.id, session_date: entry.session_date } }
  //   end
  //
  // so the path is /api/v1/athlete_entries/:id, the method is DELETE, there
  // is no body, and the answer is {deleted: {id, session_date}}. Every
  // expectation below is written from those five lines. Change the path in
  // actions.ts and this fails; change it in routes.rb and the backend's own
  // request specs fail.
  describe("deleting an entry", () => {
    const DELETE_ACK = { deleted: { id: 4, session_date: "2026-09-17" } };

    it("calls the id-addressed route, with no body", async () => {
      const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(DELETE_ACK);
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );

      expect(spy).toHaveBeenCalledWith(config, {
        path: "/api/v1/athlete_entries/4",
        method: "DELETE",
        token: "a.b.c",
      });
      // Spelled out separately because `toHaveBeenCalledWith` on an exact
      // object already covers it, and this is the half a future
      // objectContaining would quietly stop covering: a body would add a
      // Content-Type header to a request that carries nothing.
      expect(spy.mock.calls[0]![1]).not.toHaveProperty("body");
    });

    it("uses the coach's own route for a coach entry", async () => {
      const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({
        deleted: { id: 9, session_date: "2026-09-17" },
      });
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "coach", date: "2026-09-17", id: 9 }),
      );

      expect(spy).toHaveBeenCalledWith(
        config,
        expect.objectContaining({ path: "/api/v1/coach_entries/9", method: "DELETE" }),
      );
    });

    it("takes the entry out of state once the server says it is gone", async () => {
      jest.spyOn(client, "apiRequest").mockResolvedValue(DELETE_ACK);
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );

      expect(h.dispatched).toEqual([
        actions.entryDeleted({ side: "athlete", date: "2026-09-17" }),
      ]);
    });

    // The guard that makes the answer's shape matter. An entry envelope is
    // exactly what the other four actions on these controllers send back, so
    // this is the plausible wrong answer, not an invented one.
    it("removes nothing when the answer is not a delete acknowledgement", async () => {
      jest.spyOn(client, "apiRequest").mockResolvedValue(athleteEnvelope);
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );

      expect(h.dispatched).toEqual([
        actions.saveFailed({
          date: "2026-09-17",
          message: "That did not delete. Try again.",
        }),
      ]);
    });

    it("queues the delete when there is no connection, and still honours it here", async () => {
      jest
        .spyOn(client, "apiRequest")
        .mockRejectedValue(new ApiError(0, "offline", "No connection. Check the network and try again."));
      const h = harness();
      const action = actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 });

      await h.run(journalWorkers.deleteEntry, action);

      // The exact action, verbatim, so the queued copy cannot drift from
      // what was attempted. And the entry goes from the slice: he asked for
      // it gone, and the write is now the outbox's to deliver.
      expect(h.dispatched).toEqual([
        enqueue(action),
        actions.entryDeleted({ side: "athlete", date: "2026-09-17" }),
      ]);
    });

    it("queues it on a timeout too, which is what a sleeping server looks like", async () => {
      jest
        .spyOn(client, "apiRequest")
        .mockRejectedValue(new ApiError(0, "timeout", "That took too long. Try again."));
      const h = harness();
      const action = actions.deleteEntry({ side: "coach", date: "2026-09-20", id: 9 });

      await h.run(journalWorkers.deleteEntry, action);

      expect(h.dispatched).toEqual([
        enqueue(action),
        actions.entryDeleted({ side: "coach", date: "2026-09-20" }),
      ]);
    });

    // The scope already excludes a deleted entry, so the controller's `find`
    // raises and ApiController renders 404. That is the state he asked for,
    // reached by a second device or by a replay that actually landed, so it
    // is a success rather than something to apologise for.
    it("treats a 404 as already gone rather than as a failure", async () => {
      jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(404, "not_found", "Not found."));
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );

      expect(h.dispatched).toEqual([
        actions.entryDeleted({ side: "athlete", date: "2026-09-17" }),
      ]);
    });

    // A coach reaching for Teddy's entry is refused by the policy, not by
    // this package. Nothing is removed locally on a refusal.
    it("reports a refusal and leaves the entry where it is", async () => {
      jest
        .spyOn(client, "apiRequest")
        .mockRejectedValue(new ApiError(403, "forbidden", "You do not have access to that."));
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );

      expect(h.dispatched).toEqual([
        actions.saveFailed({ date: "2026-09-17", message: "You do not have access to that." }),
      ]);
    });

    it("signs out on a dead token rather than removing anything", async () => {
      jest
        .spyOn(client, "apiRequest")
        .mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
      const h = harness();

      await h.run(
        journalWorkers.deleteEntry,
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );

      expect(h.dispatched).toEqual([sessionExpired()]);
    });

    // Written as a comparison of two independently built keys rather than a
    // literal string, because the point is that they are the same key, not
    // what the key happens to spell.
    it("queues under the same key a save for that day uses, so the later one wins", () => {
      const save = actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "Something he then took back.",
        shared: false,
      });
      const remove = actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 });

      expect(remove.dedupeKey).toBe(save.dedupeKey);

      // And a different day never collides with either.
      const otherDay = actions.deleteEntry({ side: "athlete", date: "2026-09-18", id: 5 });
      expect(otherDay.dedupeKey).not.toBe(remove.dedupeKey);

      // Nor does the coach's own key for the same day.
      const coachSameDay = actions.deleteEntry({ side: "coach", date: "2026-09-17", id: 9 });
      expect(coachSameDay.dedupeKey).not.toBe(remove.dedupeKey);
    });

    // The replay end of the same thing. The app was closed between queueing
    // and replaying, so the entry was fetched back into state in the
    // meantime; when the delete finally lands, it has to leave again.
    it("removes the entry when a queued delete replays successfully", async () => {
      const h = harness();

      await h.run(journalWorkers.reconcileReplay, {
        type: "outbox/REPLAY_SUCCEEDED",
        payload: { id: "1", dedupeKey: "athlete:2026-09-17", response: DELETE_ACK },
      });

      expect(h.dispatched).toEqual([
        actions.entryDeleted({ side: "athlete", date: "2026-09-17" }),
      ]);
    });

    it("removes the coach's entry when his own queued delete replays", async () => {
      const h = harness();

      await h.run(journalWorkers.reconcileReplay, {
        type: "outbox/REPLAY_SUCCEEDED",
        payload: {
          id: "1",
          dedupeKey: "coach:2026-09-20",
          response: { deleted: { id: 9, session_date: "2026-09-20" } },
        },
      });

      expect(h.dispatched).toEqual([actions.entryDeleted({ side: "coach", date: "2026-09-20" })]);
    });

    it("leaves another duck's replayed delete alone", async () => {
      const h = harness();

      await h.run(journalWorkers.reconcileReplay, {
        type: "outbox/REPLAY_SUCCEEDED",
        payload: {
          id: "1",
          dedupeKey: "result:2026-09:t1",
          response: { deleted: { id: 3, session_date: "2026-09-17" } },
        },
      });

      expect(h.dispatched).toHaveLength(0);
    });
  });
});
