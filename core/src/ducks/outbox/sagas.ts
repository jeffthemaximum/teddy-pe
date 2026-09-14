import { all, call, getContext, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import { apiRequest, ApiError, isUnauthorized } from "../../services/apiClient";
import { sessionExpired } from "../auth/actions";
import { selectToken } from "../auth/selectors";
import { selectQueue } from "./selectors";
import type { CoreConfig } from "../../config";
import type { QueuedWrite } from "./types";

export const QUEUE_KEY = "outbox/queue";

function* persist() {
  const config: CoreConfig = yield getContext("config");
  const queue: QueuedWrite[] = yield select(selectQueue);
  yield call([config.storage, "setItem"], QUEUE_KEY, JSON.stringify(queue));
}

function* restore() {
  const config: CoreConfig = yield getContext("config");
  const raw: string | null = yield call([config.storage, "getItem"], QUEUE_KEY);
  if (!raw) {
    yield put(actions.queueRestored([]));
    return;
  }
  try {
    const queue = JSON.parse(raw) as QueuedWrite[];
    yield put(actions.queueRestored(queue));
  } catch {
    // Whatever is in there cannot be replayed. Clear it now rather than let
    // every future launch fail to parse it the same way forever: the same
    // reasoning as a corrupt session key.
    yield call([config.storage, "removeItem"], QUEUE_KEY);
    yield put(actions.queueRestored([]));
  }
}

function* replay() {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  const queue: QueuedWrite[] = yield select(selectQueue);

  for (const write of queue) {
    try {
      yield call(apiRequest, config, { ...write.action.request, token });
      yield put(actions.replaySucceeded(write.id));
    } catch (e) {
      if (isUnauthorized(e)) {
        // The token is dead, not the write. Leave it queued for the next
        // replay after signing in again, and stop: nothing behind it can
        // succeed against the same expired session either.
        yield put(actions.replayFailed({ id: write.id, permanent: false }));
        yield put(sessionExpired());
        return;
      }
      if (e instanceof ApiError && e.status !== 0) {
        // The server answered, and answered with a rejection that will be
        // identical on every retry (a 422, most often). Drop it and move on
        // to the next write rather than block behind it forever.
        yield put(actions.replayFailed({ id: write.id, permanent: true }));
        continue;
      }
      // No response came back at all: offline or a timeout. Everything
      // behind this write would fail the same way for the same reason, so
      // stop here rather than pay for a timeout per queued write against a
      // connection that is still down.
      yield put(actions.replayFailed({ id: write.id, permanent: false }));
      return;
    }
  }
}

export function* outboxSaga() {
  // Runs to completion before the watchers start, so the very first persist
  // they might trigger is never racing the read it depends on.
  yield call(restore);
  yield all([
    takeEvery([t.ENQUEUE, t.REPLAY_SUCCEEDED, t.REPLAY_FAILED, t.QUEUE_RESTORED], persist),
    takeLatest(t.REPLAY, replay),
  ]);
}

// The tests drive one worker at a time, the same convention as every other
// duck: a watcher started through `runSaga` never resolves.
export const outboxWorkers = {
  persist,
  restore,
  replay,
};
