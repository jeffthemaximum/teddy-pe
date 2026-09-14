import { all, call, getContext, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import { apiRequest, ApiError, isUnauthorized } from "../../services/apiClient";
import { sessionExpired } from "../auth/actions";
import { selectToken } from "../auth/selectors";
import { selectAllQueuedWrites, selectQueue } from "./selectors";
import type { CoreConfig } from "../../config";
import type { QueuedWrite } from "./types";

export const QUEUE_KEY = "outbox/queue";

function* persist() {
  const config: CoreConfig = yield getContext("config");
  // The whole queue, everyone's. Storage is the iPad's, and a write that
  // belongs to whoever is not signed in right now is still owed to the
  // server; saving only this session's writes would quietly delete the rest.
  const queue: QueuedWrite[] = yield select(selectAllQueuedWrites);
  yield call([config.storage, "setItem"], QUEUE_KEY, JSON.stringify(queue));
}

// Valid JSON is not enough: `JSON.stringify({foo:"bar"})` parses cleanly and
// is still not a queue. Restoring it as one puts a plain object where every
// other worker expects an array, and the next ENQUEUE, REPLAY_SUCCEEDED or
// REPLAY_FAILED throws calling .findIndex/.filter/.map on it, wedging the
// outbox exactly as permanently as a stored value that never parsed at all.
// So shape is checked too, entry by entry, not just "is this an array".
function isQueue(value: unknown): value is StoredWrite[] {
  return Array.isArray(value) && value.every(isQueuedWrite);
}

// What storage can hand back: a QueuedWrite, or one written before writes
// recorded an author. A missing `userId` is accepted rather than treated as
// corruption, because throwing the queue away would destroy the very words
// the queue exists to protect. It is normalized to `null` below, which means
// nobody owns it: never sent under anyone's token, never shown to anyone.
type StoredWrite = Omit<QueuedWrite, "userId"> & { userId?: number | null };

function isQueuedWrite(value: unknown): value is StoredWrite {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Partial<StoredWrite>;
  return (
    typeof w.id === "string" &&
    typeof w.action === "object" &&
    w.action !== null &&
    typeof w.attempts === "number" &&
    (w.userId === undefined || w.userId === null || typeof w.userId === "number")
  );
}

function* restore() {
  const config: CoreConfig = yield getContext("config");
  const raw: string | null = yield call([config.storage, "getItem"], QUEUE_KEY);
  if (!raw) {
    yield put(actions.queueRestored([]));
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isQueue(parsed)) {
      // Parsed fine, but it isn't a queue (or an entry in it is missing what
      // every entry needs). Treated the same as unparseable JSON below.
      throw new Error("stored outbox queue is not the shape of a queue");
    }
    // Every write in state carries an explicit author, so nothing downstream
    // has to keep asking what a missing one would have meant.
    yield put(actions.queueRestored(parsed.map((w) => ({ ...w, userId: w.userId ?? null }))));
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
  // The signed-in person's own writes, not the whole queue. `token` is
  // whoever is holding the iPad now, and anything else in the queue was
  // typed by somebody else: sending it here would put one person's words on
  // the server under another person's credentials, with nothing but a server
  // policy this package never references standing in the way. Somebody
  // else's write is skipped, not dropped and not failed, so it stays exactly
  // where it is and goes out when its own author signs back in.
  const queue: QueuedWrite[] = yield select(selectQueue);

  for (const write of queue) {
    try {
      const response: unknown = yield call(apiRequest, config, { ...write.action.request, token });
      yield put(
        actions.replaySucceeded({
          id: write.id,
          dedupeKey: write.action.dedupeKey,
          response,
          method: write.action.request.method,
        }),
      );
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong.";
      if (isUnauthorized(e)) {
        // The token is dead, not the write. Leave it queued for the next
        // replay after signing in again, and stop: nothing behind it can
        // succeed against the same expired session either.
        yield put(
          actions.replayFailed({
            id: write.id,
            dedupeKey: write.action.dedupeKey,
            permanent: false,
            message,
          }),
        );
        yield put(sessionExpired());
        return;
      }
      // A DELETE answered 404 asked for a thing to be gone and found it
      // already gone. That is the state the write wanted, so it succeeded.
      //
      // This is a property of DELETE, not of anything the outbox knows about
      // what was deleted: the queued action carries its own `request.method`
      // (see types.ts), which is the whole of what this reads. No duck's
      // semantics are in here, and none can be, because nothing here can
      // tell a journal entry from a test result.
      //
      // It matters because the alternative is the exact failure this outbox
      // exists to prevent, told backwards. Teddy deletes an entry with no
      // signal, it queues, the replay fires at home, the row is already gone,
      // and the branch below would report a permanent rejection to whichever
      // duck queued it, which reads on screen as "that did not save" about a
      // delete that worked perfectly.
      //
      // `response` is undefined on purpose. A 404 carried an error envelope,
      // not a result, and inventing a body here would be this duck deciding
      // what a delete's answer looks like. Undefined is what apiRequest
      // already resolves with for a successful response that has no body,
      // and a duck reconciling this sees exactly what it would see then.
      //
      // Which is why `method` goes with it. An undefined response tells a
      // duck nothing, so on this one path the only thing saying an entry is
      // gone is that the write asked for it to be. Without it the journal
      // read this as a reply it could not parse, dropped it, and left the
      // deleted entry sitting on screen forever.
      if (e instanceof ApiError && e.status === 404 && write.action.request.method === "DELETE") {
        yield put(
          actions.replaySucceeded({
            id: write.id,
            dedupeKey: write.action.dedupeKey,
            response: undefined,
            method: write.action.request.method,
          }),
        );
        continue;
      }
      if (e instanceof ApiError && e.status !== 0) {
        // The server answered, and answered with a rejection that will be
        // identical on every retry (a 422, most often). Drop it and move on
        // to the next write rather than block behind it forever.
        yield put(
          actions.replayFailed({
            id: write.id,
            dedupeKey: write.action.dedupeKey,
            permanent: true,
            message,
          }),
        );
        continue;
      }
      // No response came back at all: offline or a timeout. Everything
      // behind this write would fail the same way for the same reason, so
      // stop here rather than pay for a timeout per queued write against a
      // connection that is still down.
      yield put(
        actions.replayFailed({
          id: write.id,
          dedupeKey: write.action.dedupeKey,
          permanent: false,
          message,
        }),
      );
      return;
    }
  }
}

export function* outboxSaga() {
  // Runs to completion before the watchers start, so the very first persist
  // they might trigger is never racing the read it depends on.
  yield call(restore);
  // A write made while that read was still open reached the reducer before
  // the persist watcher below existed, so nothing has written it to disk.
  // QUEUE_RESTORED merges rather than replaces, so it is still in memory;
  // this is what keeps it if the app is closed before the next queue
  // change. Skipped on an empty queue, so a stored queue that was just
  // cleared for being corrupt stays cleared rather than being replaced with
  // an empty one.
  const merged: QueuedWrite[] = yield select(selectAllQueuedWrites);
  if (merged.length > 0) {
    yield call(persist);
  }
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
