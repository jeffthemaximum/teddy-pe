import { all, call, getContext, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import type { JournalSide, SaveAthleteEntryPayload } from "./actions";
import { athleteDedupeKey, dateFromDedupeKey, ATHLETE_PREFIX, COACH_PREFIX } from "./actions";
import * as journalApi from "./api";
import { asEntry, unwrapEntry } from "./api";
import { apiRequest, ApiError, isUnauthorized } from "../../services/apiClient";
import { sessionExpired } from "../auth/actions";
import { selectToken } from "../auth/selectors";
import { enqueue } from "../outbox/actions";
import * as outboxActionTypes from "../outbox/actionTypes";
import { selectQueue } from "../outbox/selectors";
import type { QueueableAction, QueuedWrite } from "../outbox/types";
import { selectAthleteEntryFor } from "./selectors";
import { week as weekDuck } from "../week";
import type { CoreConfig } from "../../config";
import type { AthleteEntry, CoachEntry, Week } from "../../types";

// What a person is told when the server answers a save with something this
// duck cannot read as an entry. Rare, and it used to be silent: the wrapper
// went into state as though it were the entry, the day's spinner never
// stopped, and nothing said so.
const UNREADABLE_SAVE = "That save came back in a shape this app could not read. Try again.";

// The one decision every save shares: offline or a timeout queues the write
// so it is never lost, a dead token signs the app out rather than retrying
// forever against a session that cannot succeed, and anything else (a 422
// most often) is a real, permanent rejection that would fail identically on
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
//
// The response is read as `unknown` and handed to `unwrapEntry`, never typed
// straight to AthleteEntry. Both controllers render `{ athlete_entry: ... }`
// / `{ coach_entry: ... }`, and taking the wrapper for the entry is what
// filed a saved day under the key "undefined" and left its spinner running.
// api.ts owns that unwrap; every path in this file that receives an entry
// goes through it.
function* saveAthleteEntry(action: ReturnType<typeof actions.saveAthleteEntry>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  const { date } = action.payload;
  try {
    const body: unknown = yield call(apiRequest, config, { ...action.request, token });
    const entry = unwrapEntry("athlete", body);
    if (!entry) {
      yield put(actions.saveFailed({ date, message: UNREADABLE_SAVE }));
      return;
    }
    yield put(actions.athleteEntrySaved(entry));
  } catch (e) {
    yield call(handleSaveFailure, e, date, action);
  }
}

function* saveCoachEntry(action: ReturnType<typeof actions.saveCoachEntry>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  const { date } = action.payload;
  try {
    const body: unknown = yield call(apiRequest, config, { ...action.request, token });
    const entry = unwrapEntry("coach", body);
    if (!entry) {
      yield put(actions.saveFailed({ date, message: UNREADABLE_SAVE }));
      return;
    }
    yield put(actions.coachEntrySaved(entry));
  } catch (e) {
    yield call(handleSaveFailure, e, date, action);
  }
}

// The note a pending queued write carries, if there is one, under this same
// day's `dedupeKey`: this date's, specifically, not merely the first write
// in the queue. `athleteDedupeKey` is the same function `saveAthleteEntry`
// stamped onto the write when it was queued (see actions.ts), so one place
// computes the key and a lookup here can never drift from what a write was
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
// the API (AthleteEntry#assign_attributes only touches keys it is handed)
// but not the outbox: two writes queued for the same day collapse to
// whichever was queued last, so a bare `{shared}` queued after a fuller note
// save would replace it in the queue and the note would never reach the
// server at all. So this carries a note forward alongside the new `shared`,
// through the same worker and the same `dedupeKey` a note save uses, and
// never touches `shared` itself beyond passing it on.
//
// Which note, though, matters more than it first looks. `selectAthleteEntryFor`
// is written only by a server response (`athleteEntrySaved`, an index fetch,
// or the week payload); a note typed offline has never been anywhere near
// the server and is not in there. It exists only as a pending write in the
// outbox's own queue, under this same day's `dedupeKey`. Falling back
// straight to that selector (and from there to `""`) is exactly the bug this
// comment used to describe fixing: offline, type a note, then toggle shared,
// and the toggle's own save would carry forward an empty note and replace
// the queued one, so the words are gone, having never left the device. The
// pending queued write is checked first; only when there is neither a
// pending write nor a saved entry does this fall back to an empty note, and
// even then only because there is genuinely nothing to preserve.
function* setShared(action: ReturnType<typeof actions.setShared>) {
  const { programYearId, date, shared } = action.payload;
  const queue: QueuedWrite[] = yield select(selectQueue);
  const pendingNote = pendingAthleteNote(queue, date);
  const existing: AthleteEntry | null = yield select(selectAthleteEntryFor(date));
  const note = pendingNote ?? existing?.note ?? "";
  const payload: SaveAthleteEntryPayload = { programYearId, date, note, shared };
  yield call(saveAthleteEntry, actions.saveAthleteEntry(payload));
}

// The two reads. Both follow the read ducks' shape: the FETCH action sets
// the side's loading flag, an anonymous fetch never goes out, a 401 signs
// the app out rather than being reported as a network problem, and every
// other failure lands as a message a screen can show.
function* fetchAthleteEntries() {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  // Nothing about Teddy is fetchable unauthenticated, so an anonymous fetch
  // is always a bug in the caller rather than a network condition. Say so by
  // putting the loading flag back and reporting nothing to a person.
  if (!token) {
    yield put(actions.fetchEntriesSkipped({ side: "athlete" }));
    return;
  }
  try {
    const entries: AthleteEntry[] = yield call(journalApi.fetchAthleteEntries, config, token);
    yield put(actions.athleteEntriesFetched(entries));
  } catch (e) {
    yield call(reportFetchFailure, e, "athlete");
  }
}

function* fetchCoachEntries(action: ReturnType<typeof actions.fetchCoachEntries>) {
  const config: CoreConfig = yield getContext("config");
  const token: string | null = yield select(selectToken);
  if (!token) {
    yield put(actions.fetchEntriesSkipped({ side: "coach" }));
    return;
  }
  try {
    const entries: CoachEntry[] = yield call(
      journalApi.fetchCoachEntries,
      config,
      token,
      action.payload,
    );
    yield put(actions.coachEntriesFetched(entries));
  } catch (e) {
    yield call(reportFetchFailure, e, "coach");
  }
}

// A 401 means the token is dead, and that is the only thing that signs
// someone out here. A timeout from a sleeping Fly machine is normal in this
// app (6.6 to 7.6 seconds cold) and must not be treated the same way, or a
// slow connection would look identical to a dead session.
function* reportFetchFailure(e: unknown, side: JournalSide) {
  if (isUnauthorized(e)) {
    yield put(sessionExpired());
    return;
  }
  const message = e instanceof ApiError ? e.message : "Something went wrong.";
  yield put(actions.fetchEntriesFailed({ side, message }));
}

// The other half of the outbox story: a write queued offline eventually
// replays, and the response the server gave it (carrying the id and
// updated_at the entry did not have when it was created offline) has to
// reach this duck's state somehow. `outbox/REPLAY_SUCCEEDED` carries the
// `dedupeKey` the write was queued under and the raw response body,
// forwarded verbatim; this is the one place that means anything, because
// `athlete:`/`coach:` is a prefix only this duck assigns. Any other
// dedupeKey (a test result's, say) is not this duck's business and is left
// alone.
//
// The response came from the same controller a live save did, so it carries
// the same envelope and goes through the same `unwrapEntry`. Anything that
// is not an entry inside that envelope is dropped rather than filed: it
// would key under the literal string "undefined", or overwrite a real entry
// with a stub.
function* reconcileReplay(action: {
  type: string;
  payload: { dedupeKey: string; response: unknown };
}) {
  const { dedupeKey, response } = action.payload;
  if (dedupeKey.startsWith(ATHLETE_PREFIX)) {
    const entry = unwrapEntry("athlete", response);
    if (entry) yield put(actions.athleteEntrySaved(entry));
    return;
  }
  if (dedupeKey.startsWith(COACH_PREFIX)) {
    const entry = unwrapEntry("coach", response);
    if (entry) yield put(actions.coachEntrySaved(entry));
  }
}

// The other end of a replay, and the one that matters most to a 7-year-old.
// `outbox/REPLAY_FAILED` with `permanent: true` means the server answered and
// answered with a rejection that will be identical every time, so the write
// is off the queue for good. Until this worker existed, nothing reduced that
// action at all: the pending count fell to zero, `journal.error` stayed null,
// and Teddy read that as "sent" when his words had just been thrown away.
//
// Only a permanent failure is reported. A 401 is followed by a sign-out,
// which resets this slice anyway and has its own message; offline and a
// timeout leave the write exactly where it is, still owed, and telling
// somebody a save failed when it is simply waiting for signal is the same
// mistake `saveQueued` exists to avoid.
//
// It reports through `saveFailed`, the same action a live rejection uses, so
// there is one way a rejected journal write reaches state. The message is the
// server's own words with the one thing they cannot know added in front:
// this was not a save happening now, it was one the person believed had
// already gone.
const REPLAY_REJECTED = "That entry did not save.";

function* reconcileReplayFailure(action: {
  type: string;
  payload: { dedupeKey: string; permanent: boolean; message: string };
}) {
  const { dedupeKey, permanent, message } = action.payload;
  if (!permanent) return;
  const date = dateFromDedupeKey(dedupeKey);
  // Not this duck's write. A test result's queued save replays through the
  // same action and is reported by its own duck.
  if (date === null) return;
  yield put(actions.saveFailed({ date, message: `${REPLAY_REJECTED} ${message}` }));
}

// The week payload carries `coach_entry` and `athlete_entry` inline on every
// day card, serialized by the same two serializers the entry endpoints use.
// That is a second copy of a row this slice already owns, and two copies of
// one entry is how a day card goes stale the moment it is saved.
//
// So there is one rule, and this is where it is applied: the journal slice
// is the only place an entry is read from, and the week payload's copies are
// folded into it here as soon as the week loads. Screens read
// `selectAthleteEntryFor(date)` / `selectCoachEntryFor(date)` and never
// `day.athlete_entry`. Which copy survives is the reducer's fold rule
// (reducer.ts), by `updated_at`, so a week fetch that was in flight while a
// save landed cannot roll that save back.
//
// The entries go in through the same two FETCHED actions an index fetch
// uses. They are the same thing from the same serializer, and giving them
// their own action would be a second way to fold an entry, which is the
// shape of the problem rather than the fix.
function* foldWeekEntries(action: { type: string; payload: Week }) {
  const days = action.payload?.days ?? [];
  const athlete: AthleteEntry[] = [];
  const coach: CoachEntry[] = [];
  for (const day of days) {
    // Inline on the day card, not wrapped, so this is `asEntry` rather than
    // `unwrapEntry`. Same guard underneath either way.
    const a = asEntry("athlete", day.athlete_entry);
    if (a) athlete.push(a);
    const c = asEntry("coach", day.coach_entry);
    if (c) coach.push(c);
  }
  if (athlete.length > 0) yield put(actions.athleteEntriesFetched(athlete));
  if (coach.length > 0) yield put(actions.coachEntriesFetched(coach));
}

export function* journalSaga() {
  yield all([
    takeEvery(t.SAVE_ATHLETE_ENTRY, saveAthleteEntry),
    takeEvery(t.SAVE_COACH_ENTRY, saveCoachEntry),
    takeEvery(t.SET_SHARED, setShared),
    // takeLatest for the reads, the same as every read duck: two fetches of
    // one list in flight together can only land in an order nobody chose.
    takeLatest(t.FETCH_ATHLETE_ENTRIES, fetchAthleteEntries),
    takeLatest(t.FETCH_COACH_ENTRIES, fetchCoachEntries),
    takeEvery(outboxActionTypes.REPLAY_SUCCEEDED, reconcileReplay),
    takeEvery(outboxActionTypes.REPLAY_FAILED, reconcileReplayFailure),
    takeEvery(weekDuck.types.SUCCEEDED, foldWeekEntries),
  ]);
}

// The tests drive one worker at a time rather than the watcher, same
// convention as every other duck: a watcher started through `runSaga` never
// resolves because `takeEvery` runs forever.
export const journalWorkers = {
  saveAthleteEntry,
  saveCoachEntry,
  setShared,
  fetchAthleteEntries,
  fetchCoachEntries,
  reconcileReplay,
  reconcileReplayFailure,
  foldWeekEntries,
};
