import * as t from "./actionTypes";
import type { TestResultsAction } from "./actions";
import type { TestResult } from "../../types";

export interface TestResultsState {
  byWindow: Record<string, Record<string, TestResult>>;
  saving: Record<string, boolean>;
  error: string | null;
}

const initialState: TestResultsState = { byWindow: {}, saving: {}, error: null };

// One saving flag per measure per window, the same granularity as
// dedupeKey: a coach retyping t1 for 2026-09 must not spin t2's box, and
// must not spin 2026-12's t1 either.
function savingKey(window: string, testId: string): string {
  return `${window}:${testId}`;
}

function clearSaving(saving: Record<string, boolean>, key: string): Record<string, boolean> {
  if (!(key in saving)) return saving;
  const next = { ...saving };
  delete next[key];
  return next;
}

// Keyed window then test_id, per the spec. The API upserts on
// (program_year, test_date, battery_measure), so a second save of the same
// box replaces the first here too, never accumulating a second entry next
// to it.
function fold(
  byWindow: TestResultsState["byWindow"],
  result: TestResult,
): TestResultsState["byWindow"] {
  const forWindow = byWindow[result.window] ?? {};
  return { ...byWindow, [result.window]: { ...forWindow, [result.test_id]: result } };
}

export function reducer(
  state: TestResultsState = initialState,
  action: TestResultsAction | { type: string },
): TestResultsState {
  switch (action.type) {
    case t.SAVE_RESULT: {
      const { window, testId } = (
        action as Extract<TestResultsAction, { type: typeof t.SAVE_RESULT }>
      ).payload;
      return { ...state, saving: { ...state.saving, [savingKey(window, testId)]: true } };
    }

    case t.RESULT_SAVED: {
      const result = (action as Extract<TestResultsAction, { type: typeof t.RESULT_SAVED }>)
        .payload;
      return {
        ...state,
        byWindow: fold(state.byWindow, result),
        saving: clearSaving(state.saving, savingKey(result.window, result.test_id)),
      };
    }

    case t.RESULTS_FETCHED: {
      const results = (
        action as Extract<TestResultsAction, { type: typeof t.RESULTS_FETCHED }>
      ).payload;
      const byWindow = results.reduce(fold, state.byWindow);
      return { ...state, byWindow };
    }

    case t.FETCH_RESULTS_FAILED: {
      const message = (
        action as Extract<TestResultsAction, { type: typeof t.FETCH_RESULTS_FAILED }>
      ).payload;
      return { ...state, error: message };
    }

    case t.SAVE_QUEUED: {
      const { window, testId } = (
        action as Extract<TestResultsAction, { type: typeof t.SAVE_QUEUED }>
      ).payload;
      return { ...state, saving: clearSaving(state.saving, savingKey(window, testId)) };
    }

    case t.SAVE_FAILED: {
      const { window, testId, message } = (
        action as Extract<TestResultsAction, { type: typeof t.SAVE_FAILED }>
      ).payload;
      return {
        ...state,
        saving: clearSaving(state.saving, savingKey(window, testId)),
        error: message,
      };
    }

    default:
      return state;
  }
}
