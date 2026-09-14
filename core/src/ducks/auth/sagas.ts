import { call, getContext, put, takeLatest } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import { login, SESSION_KEY } from "./api";
import { ApiError } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { User } from "../../types";

function* signInSaga(action: ReturnType<typeof actions.signIn>) {
  const config: CoreConfig = yield getContext("config");
  try {
    const response: { jwt: string; user: User } = yield call(
      login,
      config,
      action.payload,
    );
    yield call([config.storage, "setItem"], SESSION_KEY, JSON.stringify(response));
    yield put(actions.signInSucceeded(response));
  } catch (e) {
    // Pass the API's own message through. It deliberately does not say
    // whether the email or the password was wrong, and inventing our own
    // copy here would leak exactly what it is careful not to.
    const message = e instanceof ApiError ? e.message : "Something went wrong.";
    yield put(actions.signInFailed(message));
  }
}

function* restoreSessionSaga() {
  const config: CoreConfig = yield getContext("config");
  const raw: string | null = yield call([config.storage, "getItem"], SESSION_KEY);
  if (!raw) {
    yield put(actions.restoreFinished(null));
    return;
  }
  try {
    const session = JSON.parse(raw) as { jwt: string; user: User };
    if (!session?.jwt || !session?.user) throw new Error("incomplete session");
    yield put(actions.restoreFinished(session));
  } catch {
    // Whatever is in there is not a usable session. A dead token carries the
    // API's pwd claim from before a password change and fails every request,
    // so remove it now rather than let the next launch fail the same way
    // forever.
    yield call([config.storage, "removeItem"], SESSION_KEY);
    yield put(actions.restoreFinished(null));
  }
}

function* forgetSessionSaga() {
  const config: CoreConfig = yield getContext("config");
  yield call([config.storage, "removeItem"], SESSION_KEY);
}

export function* authSaga() {
  yield takeLatest(t.SIGN_IN, signInSaga);
  yield takeLatest(t.RESTORE_SESSION, restoreSessionSaga);
  yield takeLatest([t.SIGN_OUT, t.SESSION_EXPIRED], forgetSessionSaga);
}

// The tests drive one worker at a time rather than the watcher, because a
// watcher started through `runSaga` never resolves: `takeLatest` runs
// forever. Every duck exports its workers under `<duck>Workers` for exactly
// this, so the test harness always takes a worker as its first argument.
export const authWorkers = {
  signInSaga,
  restoreSessionSaga,
  forgetSessionSaga,
};
