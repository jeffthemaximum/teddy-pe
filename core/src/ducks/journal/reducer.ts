import * as t from "./actionTypes";
import type { JournalAction, JournalSide } from "./actions";
import type { AthleteEntry, CoachEntry } from "../../types";

export interface JournalState {
  coach: Record<string, CoachEntry>;
  athlete: Record<string, AthleteEntry>;
  saving: Record<string, boolean>;
  // One flag per side, not one for the journal as a whole: the two lists
  // come from two endpoints with two policies, and a coach screen loading
  // both must be able to show one arriving without the other.
  loading: Record<JournalSide, boolean>;
  error: string | null;
}

const initialState: JournalState = {
  coach: {},
  athlete: {},
  saving: {},
  loading: { athlete: false, coach: false },
  error: null,
};

function clearSaving(saving: Record<string, boolean>, date: string): Record<string, boolean> {
  if (!(date in saving)) return saving;
  const next = { ...saving };
  delete next[date];
  return next;
}

// Drops one date from one side's map, leaving the map alone if it was not
// holding that date. Same shape as clearSaving above, and same reason: an
// untouched map keeps its identity, so a selector memoized on it does not
// rebuild and a screen showing an unrelated day does not re-render.
function without<T>(map: Record<string, T>, date: string): Record<string, T> {
  if (!(date in map)) return map;
  const next = { ...map };
  delete next[date];
  return next;
}

function setLoading(
  loading: JournalState["loading"],
  side: JournalSide,
  value: boolean,
): JournalState["loading"] {
  if (loading[side] === value) return loading;
  return { ...loading, [side]: value };
}

// THE ONE RULE FOR WHERE A JOURNAL ENTRY LIVES.
//
// An entry reaches this app three ways: a save response, an index fetch, and
// inline on the week payload's day cards. Those are three copies of one row,
// and the package has already been bitten three times by one thing living in
// two places, so there is exactly one home for an entry: this slice, keyed by
// `session_date`. The week payload's copy is not read by screens; the journal
// saga folds it in here on `week/SUCCEEDED` and screens read
// `selectAthleteEntryFor(date)`. Nothing else compares, merges or prefers.
//
// Which copy wins when two arrive is decided here and only here: the one the
// server stamped later. `updated_at` is an ISO 8601 UTC string from the same
// serializer on every path, so a lexical compare orders them correctly. Ties
// go to the copy arriving now, so a save response always lands even when it
// is the same second as the row already held.
//
// This is what keeps a slow week fetch from undoing a save that finished
// while it was in flight: that payload was built before the save, so it
// carries the older timestamp and is refused.
function fold<T extends { session_date: string; updated_at: string }>(
  map: Record<string, T>,
  entry: T,
): Record<string, T> {
  // A stamp that does not parse is treated as absent, the same way a
  // missing one already is before this function ever sees it: isEntry
  // (api.ts) checks only that `updated_at` is a string, not that the string
  // means anything, so "not-a-date" reaches here. Without this guard it
  // sorts lexically after every real ISO stamp ("not-a-date" > "2026-09-17T
  // ...") and silently replaces a good entry with garbage. Absent means it
  // never wins and never even becomes the first copy on record for a date
  // that has none yet: an entry this app cannot order against anything is
  // not one it can trust enough to keep either.
  if (Number.isNaN(Date.parse(entry.updated_at))) return map;
  const held = map[entry.session_date];
  if (held && held.updated_at > entry.updated_at) return map;
  return { ...map, [entry.session_date]: entry };
}

function foldAll<T extends { session_date: string; updated_at: string }>(
  map: Record<string, T>,
  entries: T[],
): Record<string, T> {
  return entries.reduce(fold, map);
}

export function reducer(
  state: JournalState = initialState,
  action: JournalAction | { type: string },
): JournalState {
  switch (action.type) {
    case t.SAVE_ATHLETE_ENTRY: {
      const { date } = (action as Extract<JournalAction, { type: typeof t.SAVE_ATHLETE_ENTRY }>)
        .payload;
      return { ...state, saving: { ...state.saving, [date]: true } };
    }

    case t.SAVE_COACH_ENTRY: {
      const { date } = (action as Extract<JournalAction, { type: typeof t.SAVE_COACH_ENTRY }>)
        .payload;
      return { ...state, saving: { ...state.saving, [date]: true } };
    }

    case t.SET_SHARED: {
      // Optimistic, on purpose, and the one place this reducer writes a
      // field the server has not confirmed yet.
      //
      // Without it, `shared` went on reading the OLD value for the whole
      // second or two the request was out, and everything downstream read it
      // from here: the sentence telling Teddy who can see the day, and the
      // `shared` that every autosave of that day carries. So tapping "Keep
      // this to yourself" and then writing one more line sent `shared: true`
      // straight back. Online those two writes race. Offline they do not:
      // both queue under `athlete:<date>`, the outbox's supersedes rule lets
      // the later save replace the un-share in place (see ducks/outbox/
      // reducer.ts), and the un-share never reaches the server at all, with
      // the screen saying "Dad can see this too" throughout. This is the one
      // control Teddy has over who reads his words. Do not make it wait.
      //
      // `updated_at` is deliberately left as it was, so this never outranks
      // a real server copy: the answer to this very write carries a later
      // stamp and replaces it by the fold rule above, whichever way the
      // server actually went.
      //
      // A day with no entry on record is left alone rather than invented:
      // there is no row to mark, and the save this toggle fires (see the
      // setShared saga) is what creates one, carrying the intent on it.
      const { date, shared } = (action as Extract<JournalAction, { type: typeof t.SET_SHARED }>)
        .payload;
      const held = state.athlete[date];
      return {
        ...state,
        athlete: held ? { ...state.athlete, [date]: { ...held, shared } } : state.athlete,
        saving: { ...state.saving, [date]: true },
      };
    }

    case t.DELETE_ENTRY: {
      // The same flag a save sets, because from the screen's side this is
      // the same thing: a write is in flight for this day and the button
      // that started it should not be tappable twice.
      const { date } = (action as Extract<JournalAction, { type: typeof t.DELETE_ENTRY }>).payload;
      return { ...state, saving: { ...state.saving, [date]: true } };
    }

    case t.ENTRY_DELETED: {
      // The one place an entry leaves this slice. The fold rule above
      // decides which of two copies of a row wins; this is not that, it is
      // the row being gone, so there is nothing to compare against. A later
      // fetch cannot bring it back either, because the server no longer
      // sends it.
      //
      // Written as two branches rather than one computed `[side]` key: the
      // two maps hold different types, and a computed key widens both to
      // their union, which is how a coach entry would become assignable to
      // the athlete's map.
      const { side, date } = (
        action as Extract<JournalAction, { type: typeof t.ENTRY_DELETED }>
      ).payload;
      const saving = clearSaving(state.saving, date);
      return side === "athlete"
        ? { ...state, athlete: without(state.athlete, date), saving }
        : { ...state, coach: without(state.coach, date), saving };
    }

    case t.ATHLETE_ENTRY_SAVED: {
      // Folded under its own `session_date`, by the rule above. The API
      // upserts on (user, program_year, date), so two saves of one day are
      // one entry, never two. `shared` is kept exactly as the API sent it
      // back: this reducer never computes it.
      //
      // `saving` clears whether or not the fold kept this copy. The day is
      // not still saving either way; the request came back.
      const entry = (action as Extract<JournalAction, { type: typeof t.ATHLETE_ENTRY_SAVED }>)
        .payload;
      return {
        ...state,
        athlete: fold(state.athlete, entry),
        saving: clearSaving(state.saving, entry.session_date),
      };
    }

    case t.COACH_ENTRY_SAVED: {
      const entry = (action as Extract<JournalAction, { type: typeof t.COACH_ENTRY_SAVED }>)
        .payload;
      return {
        ...state,
        coach: fold(state.coach, entry),
        saving: clearSaving(state.saving, entry.session_date),
      };
    }

    case t.FETCH_ATHLETE_ENTRIES:
      return { ...state, loading: setLoading(state.loading, "athlete", true), error: null };

    case t.FETCH_COACH_ENTRIES:
      return { ...state, loading: setLoading(state.loading, "coach", true), error: null };

    case t.ATHLETE_ENTRIES_FETCHED: {
      // The same fold, so a list arriving after a save cannot roll that save
      // back. This is also the action the week payload's inline entries come
      // in through (see sagas.ts), which is why the rule has one home.
      const entries = (
        action as Extract<JournalAction, { type: typeof t.ATHLETE_ENTRIES_FETCHED }>
      ).payload;
      return {
        ...state,
        athlete: foldAll(state.athlete, entries),
        loading: setLoading(state.loading, "athlete", false),
      };
    }

    case t.COACH_ENTRIES_FETCHED: {
      const entries = (action as Extract<JournalAction, { type: typeof t.COACH_ENTRIES_FETCHED }>)
        .payload;
      return {
        ...state,
        coach: foldAll(state.coach, entries),
        loading: setLoading(state.loading, "coach", false),
      };
    }

    case t.FETCH_ENTRIES_FAILED: {
      const { side, message } = (
        action as Extract<JournalAction, { type: typeof t.FETCH_ENTRIES_FAILED }>
      ).payload;
      return { ...state, loading: setLoading(state.loading, side, false), error: message };
    }

    case t.FETCH_ENTRIES_SKIPPED: {
      // Nothing went out, so nothing failed. Only the flag goes back.
      const { side } = (action as Extract<JournalAction, { type: typeof t.FETCH_ENTRIES_SKIPPED }>)
        .payload;
      return { ...state, loading: setLoading(state.loading, side, false) };
    }

    case t.SAVE_QUEUED: {
      const { date } = (action as Extract<JournalAction, { type: typeof t.SAVE_QUEUED }>).payload;
      return { ...state, saving: clearSaving(state.saving, date) };
    }

    case t.SAVE_FAILED: {
      const { date, message } = (
        action as Extract<JournalAction, { type: typeof t.SAVE_FAILED }>
      ).payload;
      return { ...state, saving: clearSaving(state.saving, date), error: message };
    }

    // Journal entries are a promise made to a child about his own writing.
    // On a shared device, whoever signs in next must not find them still
    // sitting in memory. That reset used to live here as a stopgap; it now
    // lives once, at the root, in store/rootReducer.ts, so every duck gets
    // it and not just this one.
    default:
      return state;
  }
}
