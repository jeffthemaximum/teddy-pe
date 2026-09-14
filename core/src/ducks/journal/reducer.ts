import * as t from "./actionTypes";
import type { JournalAction } from "./actions";
import type { AthleteEntry, CoachEntry } from "../../types";

export interface JournalState {
  coach: Record<string, CoachEntry>;
  athlete: Record<string, AthleteEntry>;
  saving: Record<string, boolean>;
  error: string | null;
}

const initialState: JournalState = { coach: {}, athlete: {}, saving: {}, error: null };

function clearSaving(saving: Record<string, boolean>, date: string): Record<string, boolean> {
  if (!(date in saving)) return saving;
  const next = { ...saving };
  delete next[date];
  return next;
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
      const { date } = (action as Extract<JournalAction, { type: typeof t.SET_SHARED }>).payload;
      return { ...state, saving: { ...state.saving, [date]: true } };
    }

    case t.ATHLETE_ENTRY_SAVED: {
      // Filed under its own `session_date`, replacing whatever was there. The
      // API upserts on (user, program_year, date), so two saves of one day
      // are one entry, never two. `shared` is kept exactly as the API sent
      // it back: this reducer never computes it.
      const entry = (action as Extract<JournalAction, { type: typeof t.ATHLETE_ENTRY_SAVED }>)
        .payload;
      return {
        ...state,
        athlete: { ...state.athlete, [entry.session_date]: entry },
        saving: clearSaving(state.saving, entry.session_date),
      };
    }

    case t.COACH_ENTRY_SAVED: {
      const entry = (action as Extract<JournalAction, { type: typeof t.COACH_ENTRY_SAVED }>)
        .payload;
      return {
        ...state,
        coach: { ...state.coach, [entry.session_date]: entry },
        saving: clearSaving(state.saving, entry.session_date),
      };
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
