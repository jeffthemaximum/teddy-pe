import * as t from "./actionTypes";
import type { TestResult } from "../../types";
import type { QueueableAction } from "../outbox/types";

// What a save actually sends: which year, which measure, which window, and
// the value exactly as the coach typed it. The API stores raw_value and
// derives numeric_value itself; a range like "15 to 18" is a real thing to
// type into a balance test, and parsing it on the client would either lose
// it or disagree with the server about what it means, and the server is
// the one that charts it.
//
// `programYearId` is required, not inferred: TestResultsController#create
// does `result_params.fetch(:program_year_id)`, a `fetch` that raises on a
// missing key, so there is no such thing as a valid write without it.
//
// An empty `rawValue` is not a smaller write: TestResultsController#create
// treats an empty value as "delete this row", so a coach clearing a
// mistyped box uses this same action with `rawValue: ""` rather than a
// separate one.
export interface SaveResultPayload {
  programYearId: number;
  window: string;
  testId: string;
  rawValue: string;
}

function resultRequest(payload: SaveResultPayload): QueueableAction["request"] {
  return {
    path: "/api/v1/test_results",
    method: "POST",
    body: {
      test_result: {
        program_year_id: payload.programYearId,
        window: payload.window,
        test_id: payload.testId,
        value: payload.rawValue,
      },
    },
  };
}

// GET /api/v1/test_results filters by program_year_id when it is present;
// this always sends one rather than relying on that being optional.
export const fetchResults = (programYearId: number) =>
  ({ type: t.FETCH_RESULTS, payload: { programYearId } }) as const;

export const resultsFetched = (results: TestResult[]) =>
  ({ type: t.RESULTS_FETCHED, payload: results }) as const;

export const fetchResultsFailed = (message: string) =>
  ({ type: t.FETCH_RESULTS_FAILED, payload: message }) as const;

// Built as a full QueueableAction at the moment it is created, not patched
// together later inside the saga, the same discipline the journal duck
// uses: dedupeKey and request already sit on the action a component
// dispatches, so enqueuing on failure is `enqueue(action)`, the same
// action, verbatim.
//
// One write per measure per window, `result:2026-09:t1`, because that is
// what a person corrects when they retype a number: a single box on the
// sheet, not the whole test date. The key deliberately leaves out
// `programYearId`: only one year is ever open on a phone at a time, and a
// key it also has to carry would be one more way this and the queued copy
// could drift apart.
export const saveResult = (payload: SaveResultPayload) =>
  ({
    type: t.SAVE_RESULT,
    payload,
    dedupeKey: `result:${payload.window}:${payload.testId}`,
    request: resultRequest(payload),
  }) as const;

export const resultSaved = (result: TestResult) =>
  ({ type: t.RESULT_SAVED, payload: result }) as const;

// The other half of "clearing a box deletes the row": the controller
// answers a delete with `{deleted: true, test_id, window}`, not a row, so
// there is nothing here to fold into byWindow. Only enough to find the row
// and take it back out.
export const resultDeleted = (info: { window: string; testId: string }) =>
  ({ type: t.RESULT_DELETED, payload: info }) as const;

// Dispatched once a save is off the app's hands and into the outbox: not
// saved, not failed, waiting for signal. Clears the measure's saving flag
// without touching `error`, so a queued write does not spin that box
// forever until the next direct save happens to land.
export const saveQueued = (info: { window: string; testId: string }) =>
  ({ type: t.SAVE_QUEUED, payload: info }) as const;

export const saveFailed = (info: { window: string; testId: string; message: string }) =>
  ({ type: t.SAVE_FAILED, payload: info }) as const;

export type TestResultsAction =
  | ReturnType<typeof fetchResults>
  | ReturnType<typeof resultsFetched>
  | ReturnType<typeof fetchResultsFailed>
  | ReturnType<typeof saveResult>
  | ReturnType<typeof resultSaved>
  | ReturnType<typeof resultDeleted>
  | ReturnType<typeof saveQueued>
  | ReturnType<typeof saveFailed>;
