import { all, call, getContext, put, select, takeEvery } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import { fetchTestResults } from "./api";
import { apiRequest, ApiError, isUnauthorized } from "../../services/apiClient";
import { sessionExpired } from "../auth/actions";
import { selectToken } from "../auth/selectors";
import { enqueue } from "../outbox/actions";
import * as outboxActionTypes from "../outbox/actionTypes";
import type { QueueableAction } from "../outbox/types";
import type { CoreConfig } from "../../config";
import type { TestResult } from "../../types";

// The same three-way branch the journal duck uses: offline or a timeout
// queues the write so a number typed at a test session is never lost, a
// dead token signs the app out rather than retrying forever against a
// session that cannot succeed, and anything else — a 422 most often — is a
// real, permanent rejection that would fail identically on every retry, so
// it is reported rather than queued. An explicit three-way branch, not a
// fallthrough: each direction is a decision, not a default.
function* handleSaveFailure(
  e: unknown,
  info: { window: string; testId: string },
  queueable: QueueableAction,
) {
  if (e instanceof ApiError && (e.code === "offline" || e.code === "timeout")) {
    yield put(enqueue(queueable));
    // Off the app's hands and into the outbox's: no longer "saving", and
    // not failed either, so the box's saving flag clears without an error
    // message that would tell Jeff something went wrong when nothing has,
    // yet.
    yield put(actions.saveQueued(info));
    return;
  }
  if (e instanceof ApiError && e.status === 401) {
    yield put(sessionExpired());
    return;
  }
  const message = e instanceof ApiError ? e.message : "Something went wrong.";
  yield put(actions.saveFailed({ ...info, message }));
}

function* fetchResults() {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  // Nothing here is fetchable unauthenticated, so an anonymous fetch is
  // always a bug in the caller, not a network condition to report.
  if (!token) return;

  try {
    const response: { test_results: TestResult[] } = yield call(fetchTestResults, config, token);
    yield put(actions.resultsFetched(response.test_results));
  } catch (e) {
    if (isUnauthorized(e)) {
      yield put(sessionExpired());
      return;
    }
    yield put(
      actions.fetchResultsFailed(e instanceof ApiError ? e.message : "Something went wrong."),
    );
  }
}

// `action` already carries `dedupeKey` and `request` (see actions.ts), built
// at the moment it was created. Nothing here rebuilds the request or the
// key: on failure the exact action received is the one handed to `enqueue`.
function* saveResult(action: ReturnType<typeof actions.saveResult>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  const { window, testId } = action.payload;
  try {
    const result: TestResult = yield call(apiRequest, config, { ...action.request, token });
    yield put(actions.resultSaved(result));
  } catch (e) {
    yield call(handleSaveFailure, e, { window, testId }, action);
  }
}

// The other half of the outbox story: a result queued offline eventually
// replays, and the response the server gave it — the row it actually wrote,
// numeric_value included — has to reach this duck's state somehow.
// `outbox/REPLAY_SUCCEEDED` carries the `dedupeKey` the write was queued
// under and the raw response body, forwarded verbatim; `result:` is a
// prefix only this duck assigns. Any other dedupeKey (the journal's, say)
// is not this duck's business and is left alone.
function* reconcileReplay(action: {
  type: string;
  payload: { dedupeKey: string; response: unknown };
}) {
  const { dedupeKey, response } = action.payload;
  if (!dedupeKey.startsWith("result:")) return;
  yield put(actions.resultSaved(response as TestResult));
}

export function* testResultsSaga() {
  yield all([
    takeEvery(t.FETCH_RESULTS, fetchResults),
    takeEvery(t.SAVE_RESULT, saveResult),
    takeEvery(outboxActionTypes.REPLAY_SUCCEEDED, reconcileReplay),
  ]);
}

// The tests drive one worker at a time rather than the watcher, same
// convention as every other duck: a watcher started through `runSaga` never
// resolves because `takeEvery` runs forever.
export const testResultsWorkers = {
  fetchResults,
  saveResult,
  reconcileReplay,
};
