import { all, call, getContext, put, select, takeEvery } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import type { SaveAthleteEntryPayload } from "./actions";
import { athleteDedupeKey, ATHLETE_PREFIX, COACH_PREFIX } from "./actions";
import { apiRequest, ApiError } from "../../services/apiClient";
import { sessionExpired } from "../auth/actions";
import { selectToken } from "../auth/selectors";
import { enqueue } from "../outbox/actions";
import * as outboxActionTypes from "../outbox/actionTypes";
import { selectQueue } from "../outbox/selectors";
import type { QueueableAction, QueuedWrite } from "../outbox/types";
import { selectAthleteEntryFor } from "./selectors";
import type { CoreConfig } from "../../config";
import type { AthleteEntry, CoachEntry } from "../../types";

// The one decision every save shares: offline or a timeout queues the write
// so it is never lost, a dead token signs the app out rather than retrying
// forever against a session that cannot succeed, and anything else — a 422
// most often — is a real, permanent rejection that would fail identically on
// every retry, so it is reported rather than queued. An explicit three-way
// branch, not a fallthrough: each direction is a decision, not a default.
function* handleSaveFailure(e: unknown, date: string, queueable: QueueableAction) {
  if (e instanceof ApiError && (e.code === "offline" || e.code === "timeout")) {
    yield put(enqueue(queueable));
    // Off the app's hands and into the outbox's: no longer "saving", and not
    // failed either, so the day's saving flag clears without an error message
    // that would tell Teddy or Jeff something went wrong when nothing has,
    // yet.
    yield put(actions.saveQueued({ date }));
    return;
  }
  if (e instanceof ApiError && e.status === 401) {
    yield put(sessionExpired());
    return;
  }
  const message = e instanceof ApiError ? e.message : "Something went wrong.";
  yield put(actions.saveFailed({ date, message }));
}

// `action` already carries `dedupeKey` and `request` (see actions.ts), built
// at the moment it was created. Nothing here rebuilds the request or the
// key: on failure the exact action received is the one handed to `enqueue`.
function* saveAthleteEntry(action: ReturnType<typeof actions.saveAthleteEntry>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  try {
    const entry: AthleteEntry = yield call(apiRequest, config, { ...action.request, token });
    yield put(actions.athleteEntrySaved(entry));
  } catch (e) {
    yield call(handleSaveFailure, e, action.payload.date, action);
  }
}

function* saveCoachEntry(action: ReturnType<typeof actions.saveCoachEntry>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  try {
    const entry: CoachEntry = yield call(apiRequest, config, { ...action.request, token });
    yield put(actions.coachEntrySaved(entry));
  } catch (e) {
    yield call(handleSaveFailure, e, action.payload.date, action);
  }
}

// The note a pending queued write carries, if there is one, under this same
// day's `dedupeKey` — this date's, specifically, not merely the first write
// in the queue. `athleteDedupeKey` is the same function `saveAthleteEntry`
// stamped onto the write when it was queued (see actions.ts): one place
// computes the key, so a lookup here can never drift from what a write was
// actually filed under. Read through the outbox's own selector rather than
// reaching into `state.outbox` directly, the same boundary `enqueue` and
// `outbox/REPLAY_SUCCEEDED` already cross. Guarded rather than cast blindly:
// nothing here assumes a queued write under an `athlete:` key is necessarily
// one this duck built.
function pendingAthleteNote(queue: QueuedWrite[], date: string): string | undefined {
  const pending = queue.find((w) => w.action.dedupeKey === athleteDedupeKey(date));
  const payload = pending?.action.payload;
  if (
    payload !== null &&
    typeof payload === "object" &&
    typeof (payload as { note?: unknown }).note === "string"
  ) {
    return (payload as { note: string }).note;
  }
  return undefined;
}

// Not its own request path. `{ session_date, shared }` alone would satisfy
// the API — AthleteEntry#assign_attributes only touches keys it is handed —
// but not the outbox: two writes queued for the same day collapse to
// whichever was queued last, so a bare `{shared}` queued after a fuller note
// save would replace it in the queue and the note would never reach the
// server at all. So this carries a note forward alongside the new `shared`,
// through the same worker and the same `dedupeKey` a note save uses, and
// never touches `shared` itself beyond passing it on.
//
// Which note, though, matters more than it first looks. `selectAthleteEntryFor`
// is written only by a server response (`athleteEntrySaved`/`coachEntrySaved`);
// a note typed offline has never been anywhere near the server and is not in
// there — it exists only as a pending write in the outbox's own queue, under
// this same day's `dedupeKey`. Falling back straight to that selector (and
// from there to `""`) is exactly the bug this comment used to describe
// fixing: offline, type a note, then toggle shared, and the toggle's own
// save would carry forward an empty note and replace the queued one — the
// words are gone, having never left the device. So the pending queued write
// is checked first; only when there is neither a pending write nor a saved
// entry does this fall back to an empty note, and even then only because
// there is genuinely nothing to preserve.
function* setShared(action: ReturnType<typeof actions.setShared>) {
  const { date, shared } = action.payload;
  const queue: QueuedWrite[] = yield select(selectQueue);
  const pendingNote = pendingAthleteNote(queue, date);
  const existing: AthleteEntry | null = yield select(selectAthleteEntryFor(date));
  const note = pendingNote ?? existing?.note ?? "";
  const payload: SaveAthleteEntryPayload = { date, note, shared };
  yield call(saveAthleteEntry, actions.saveAthleteEntry(payload));
}

// The other half of the outbox story: a write queued offline eventually
// replays, and the response the server gave it — carrying the id and
// updated_at the entry did not have when it was created offline — has to
// reach this duck's state somehow. `outbox/REPLAY_SUCCEEDED` carries the
// `dedupeKey` the write was queued under and the raw response body,
// forwarded verbatim; this is the one place that means anything, because
// `athlete:`/`coach:` is a prefix only this duck assigns. Any other
// dedupeKey (a test result's, say) is not this duck's business and is left
// alone.
// A response with no `session_date` is not a journal entry at all — filing
// it anyway would key it under the literal string "undefined" and it would
// sit there forever, matching no real date. Guarded rather than trusted,
// since `response` crossed the outbox as `unknown` and was never this duck's
// to begin with until this check says otherwise.
//
// `session_date` alone is not enough, either: `{session_date: "2026-09-17"}`
// on its own is a plausible-looking stub, not a real entry, and folding it in
// would overwrite a real one with that stub. `note` is required on every
// entry this duck's own serializers send (it may legitimately be `null` —
// CoachEntry#note and AthleteEntry#note both are — but the key must be
// present), so its presence is what tells a stub apart from the real thing.
function isEntryResponse(value: unknown): value is { session_date: string; note: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { session_date?: unknown; note?: unknown };
  if (typeof v.session_date !== "string") return false;
  return v.note === null || typeof v.note === "string";
}

function* reconcileReplay(action: { type: string; payload: { dedupeKey: string; response: unknown } }) {
  const { dedupeKey, response } = action.payload;
  if (!isEntryResponse(response)) return;
  if (dedupeKey.startsWith(ATHLETE_PREFIX)) {
    yield put(actions.athleteEntrySaved(response as AthleteEntry));
    return;
  }
  if (dedupeKey.startsWith(COACH_PREFIX)) {
    yield put(actions.coachEntrySaved(response as CoachEntry));
  }
}

export function* journalSaga() {
  yield all([
    takeEvery(t.SAVE_ATHLETE_ENTRY, saveAthleteEntry),
    takeEvery(t.SAVE_COACH_ENTRY, saveCoachEntry),
    takeEvery(t.SET_SHARED, setShared),
    takeEvery(outboxActionTypes.REPLAY_SUCCEEDED, reconcileReplay),
  ]);
}

// The tests drive one worker at a time rather than the watcher, same
// convention as every other duck: a watcher started through `runSaga` never
// resolves because `takeEvery` runs forever.
export const journalWorkers = {
  saveAthleteEntry,
  saveCoachEntry,
  setShared,
  reconcileReplay,
};
