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

const config = { baseUrl: "https://api.test", storage: memoryStorage(), logger: silentLogger, timeoutMs: 15000 };

const emptyJournal: JournalState = { coach: {}, athlete: {}, saving: {}, error: null };

function harness(journal: JournalState = emptyJournal) {
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (worker: unknown, action: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c" }, journal }),
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
  updated_at: "z",
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
  updated_at: "z",
};

describe("the journal saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends shared exactly as given, without interpreting it", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(savedAthleteEntry);
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        body: { athlete_entry: { session_date: "2026-09-17", note: "x", shared: true } },
      }),
    );
    expect(h.dispatched).toContainEqual(actions.athleteEntrySaved(savedAthleteEntry));
  });

  it("saves a coach entry to its own endpoint, ratings included", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue(savedCoachEntry);
    const h = harness();
    const payload = {
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
            session_date: "2026-09-17",
            note: "Good balance today.",
            overall: 4,
            energy: 3,
            flag_pain: false,
            pain_note: null,
            challenge_num: null,
          },
          ratings: { "cartwheel-prep": "getting" },
        },
      }),
    );
    expect(h.dispatched).toContainEqual(actions.coachEntrySaved(savedCoachEntry));
  });

  it("carries the already-saved note forward when only the shared toggle changes", async () => {
    // A bare {shared} body would be enough for the API but not for the
    // outbox: replacing an earlier, fuller queued write for the same day
    // with a partial one would mean the note in that earlier write never
    // reaches the server at all. So setShared has to know the note already
    // on record, not just the new value of the switch.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ ...savedAthleteEntry, shared: true });
    const h = harness({
      ...emptyJournal,
      athlete: { "2026-09-17": { ...savedAthleteEntry, note: "Landed three.", shared: false } },
    });

    await h.run(journalWorkers.setShared, actions.setShared({ date: "2026-09-17", shared: true }));

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        body: { athlete_entry: { session_date: "2026-09-17", note: "Landed three.", shared: true } },
      }),
    );
  });

  it("sends an empty note rather than inventing one, when nothing was saved for the date yet", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ ...savedAthleteEntry, note: "", shared: true });
    const h = harness();

    await h.run(journalWorkers.setShared, actions.setShared({ date: "2026-09-17", shared: true }));

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        body: { athlete_entry: { session_date: "2026-09-17", note: "", shared: true } },
      }),
    );
  });

  it("queues the entry instead of losing it when there is no connection", async () => {
    // This is the failure the rewrite exists partly to fix. A tennis court is
    // exactly where it happens, and the old page dropped the entry on the
    // floor.
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness();

    const action = actions.saveAthleteEntry({ date: "2026-09-17", note: "Landed three.", shared: false });
    await h.run(journalWorkers.saveAthleteEntry, action);

    expect(h.dispatched).toContainEqual(enqueue(action));
    // And the day stops "saving": it is queued now, not in flight, and not
    // failed either.
    expect(h.dispatched).toContainEqual(actions.saveQueued({ date: "2026-09-17" }));
  });

  it("also queues on a timeout, not only a dead connection", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "timeout", "That took too long."));
    const h = harness();
    const action = actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false });

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
      actions.saveAthleteEntry({ date: "2026-09-17", note: "", shared: false }),
    );

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(actions.saveFailed({ date: "2026-09-17", message: "A note cannot be blank." }));
  });

  it("signs out on a dead token rather than queueing forever", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }),
    );

    expect(h.dispatched).toContainEqual(sessionExpired());
    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).not.toContainEqual(
      actions.saveFailed({ date: "2026-09-17", message: "Invalid or missing token." }),
    );
  });

  it("folds a replayed athlete write's server response into state, id included", async () => {
    // The write was queued offline with a placeholder id it never had a real
    // one for. This is how the duck learns the real one, without a second
    // round trip to re-fetch it.
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "athlete:2026-09-17", response: savedAthleteEntry },
    });

    expect(h.dispatched).toContainEqual(actions.athleteEntrySaved(savedAthleteEntry));
  });

  it("folds a replayed coach write the same way, into the coach map", async () => {
    const h = harness();

    await h.run(journalWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "coach:2026-09-17", response: savedCoachEntry },
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
});
