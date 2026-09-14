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

// TestResultsController#create answers one of two shapes for the same
// endpoint, depending on whether the value it was sent was empty:
// `{test_result: {...}}` for a save, `{deleted: true, test_id, window}` for
// a clear. Both this saga and the outbox replay path (below) see either one,
// so both check this rather than assuming a save every time.
interface DeletedResponse {
  deleted: true;
  test_id: string;
  window: string;
}

function isDeletedResponse(body: unknown): body is DeletedResponse {
  return typeof body === "object" && body !== null && (body as { deleted?: unknown }).deleted === true;
}

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

function* fetchResults(action: ReturnType<typeof actions.fetchResults>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  // Nothing here is fetchable unauthenticated, so an anonymous fetch is
  // always a bug in the caller, not a network condition to report.
  if (!token) return;

  try {
    const response: { test_results: TestResult[] } = yield call(
      fetchTestResults,
      config,
      token,
      action.payload.programYearId,
    );
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
//
// The response is read as `unknown` first and branched on shape, not typed
// straight to TestResult: an empty box sent through this same action comes
// back as a delete, never a row.
function* saveResult(action: ReturnType<typeof actions.saveResult>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  const { window, testId } = action.payload;
  try {
    const response: unknown = yield call(apiRequest, config, { ...action.request, token });
    if (isDeletedResponse(response)) {
      yield put(actions.resultDeleted({ window: response.window, testId: response.test_id }));
      return;
    }
    const { test_result } = response as { test_result: TestResult };
    yield put(actions.resultSaved(test_result));
  } catch (e) {
    yield call(handleSaveFailure, e, { window, testId }, action);
  }
}

// The other half of the outbox story: a result queued offline eventually
// replays, and the response the server gave it has to reach this duck's
// state somehow. `outbox/REPLAY_SUCCEEDED` carries the `dedupeKey` the write
// was queued under and the raw response body, forwarded verbatim; `result:`
// is a prefix only this duck assigns. Any other dedupeKey (the journal's,
// say) is not this duck's business and is left alone.
//
// A cleared box queued offline (someone typed a number, then cleared it,
// then lost signal) replays through this same path and needs the same
// shape check a live save does: the response is still whichever of the two
// shapes the controller actually sent, not necessarily a row.
function* reconcileReplay(action: {
  type: string;
  payload: { dedupeKey: string; response: unknown };
}) {
  const { dedupeKey, response } = action.payload;
  if (!dedupeKey.startsWith("result:")) return;
  if (isDeletedResponse(response)) {
    yield put(actions.resultDeleted({ window: response.window, testId: response.test_id }));
    return;
  }
  const { test_result } = response as { test_result: TestResult };
  yield put(actions.resultSaved(test_result));
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
