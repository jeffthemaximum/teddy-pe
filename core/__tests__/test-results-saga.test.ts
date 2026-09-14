import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/testResults/actions";
import { testResultsWorkers } from "../src/ducks/testResults/sagas";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import { sessionExpired } from "../src/ducks/auth/actions";
import { enqueue } from "../src/ducks/outbox/actions";

const config = { baseUrl: "https://api.test", storage: memoryStorage(), logger: silentLogger, timeoutMs: 15000 };

function harness() {
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (worker: unknown, action: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c" } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worker as any,
        action,
      ).toPromise(),
  };
}

const save = actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "4.42" });

// Every real column, numeric_value a string per the serializer
// (`result.numeric_value&.to_s`), recorded_at included alongside updated_at.
const savedResult = {
  id: 1,
  test_id: "t1",
  window: "2026-09",
  raw_value: "4.42",
  numeric_value: "4.42",
  recorded_at: "z",
  updated_at: "z",
};

describe("the test results saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("posts the raw value the coach typed, not a parsed one, along with the year it belongs to", async () => {
    // The API stores raw_value and parses numeric_value itself. A range like
    // "15 to 18" is a real thing to type, and parsing on the client would
    // either lose it or disagree with the server about what it means.
    //
    // The controller does `result_params.fetch(:program_year_id)`, a fetch
    // that raises on a missing key, and the field is `value`, not
    // `raw_value` — TestResultsController#create permits exactly
    // (:program_year_id, :window, :test_id, :value).
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ test_result: savedResult });
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/test_results",
        body: { test_result: { program_year_id: 1, window: "2026-09", test_id: "t1", value: "4.42" } },
      }),
    );
    expect(h.dispatched).toContainEqual(actions.resultSaved(savedResult));
  });

  it("removes the measure from state when the coach clears the box", async () => {
    // Clearing a box deletes the row server-side, and the controller answers
    // with a different shape: {deleted: true, test_id, window}, not a row.
    // Proving the delete path means proving the measure is actually gone
    // from state, not merely that the call resolved — see the reducer test
    // for the "gone from state" half of this.
    const clear = actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "" });
    jest.spyOn(client, "apiRequest").mockResolvedValue({ deleted: true, test_id: "t1", window: "2026-09" });
    const h = harness();

    await h.run(testResultsWorkers.saveResult, clear);

    expect(h.dispatched).toContainEqual(actions.resultDeleted({ window: "2026-09", testId: "t1" }));
    // And it did not also fabricate a save: a saga that folded the delete
    // response in as if it were a row would dispatch both.
    expect(h.dispatched.filter((a) => (a as { type: string }).type === "testResults/RESULT_SAVED")).toHaveLength(0);
  });

  it("queues the number instead of losing it when there is no connection", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched).toContainEqual(enqueue(save));
    // Off the app's hands and into the outbox's: the box stops "saving",
    // and no error is recorded either, because nothing has actually gone
    // wrong yet.
    expect(h.dispatched).toContainEqual(actions.saveQueued({ window: "2026-09", testId: "t1" }));
  });

  it("also queues on a timeout, not only a dead connection", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "timeout", "That took too long."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched).toContainEqual(enqueue(save));
  });

  it("does not queue a value the server rejected on its merits", async () => {
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(422, "invalid", "That is not a number."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(
      actions.saveFailed({ window: "2026-09", testId: "t1", message: "That is not a number." }),
    );
  });

  it("signs out on a dead token", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched).toContainEqual(sessionExpired());
    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).not.toContainEqual(
      actions.saveFailed({ window: "2026-09", testId: "t1", message: "Invalid or missing token." }),
    );
  });

  it("fetches the battery's results for the year that is open", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ test_results: [savedResult] });
    const h = harness();

    await h.run(testResultsWorkers.fetchResults, actions.fetchResults(1));

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ path: "/api/v1/test_results?program_year_id=1" }),
    );
    expect(h.dispatched).toContainEqual(actions.resultsFetched([savedResult]));
  });

  it("signs out on a dead token while fetching, rather than reporting it as a fetch error", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(testResultsWorkers.fetchResults, actions.fetchResults(1));

    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("folds a replayed result's server response into state", async () => {
    // The write was queued offline with no server id yet. This is how the
    // duck learns the real row, without a second round trip to re-fetch it.
    const h = harness();

    await h.run(testResultsWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "result:2026-09:t1", response: { test_result: savedResult } },
    });

    expect(h.dispatched).toContainEqual(actions.resultSaved(savedResult));
  });

  it("folds a replayed delete the same way a live one is handled", async () => {
    // A clear made offline (typed a number, cleared it, then lost signal)
    // replays through the same outbox path as any other write, and the
    // response is still whichever of the two shapes the controller sends.
    const h = harness();

    await h.run(testResultsWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: {
        id: "1",
        dedupeKey: "result:2026-09:t1",
        response: { deleted: true, test_id: "t1", window: "2026-09" },
      },
    });

    expect(h.dispatched).toContainEqual(actions.resultDeleted({ window: "2026-09", testId: "t1" }));
  });

  it("ignores a replayed write that belongs to some other duck", async () => {
    // A journal entry's queued write replays too, and it is not this duck's
    // business. Recognizing only its own `result:` prefix is what keeps it
    // that way.
    const h = harness();

    await h.run(testResultsWorkers.reconcileReplay, {
      type: "outbox/REPLAY_SUCCEEDED",
      payload: { id: "1", dedupeKey: "athlete:2026-09-17", response: { anything: true } },
    });

    expect(h.dispatched).toHaveLength(0);
  });
});
