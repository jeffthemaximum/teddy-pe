export const SAVE_ATHLETE_ENTRY = "journal/SAVE_ATHLETE_ENTRY";
export const SAVE_COACH_ENTRY = "journal/SAVE_COACH_ENTRY";
export const SET_SHARED = "journal/SET_SHARED";
export const ATHLETE_ENTRY_SAVED = "journal/ATHLETE_ENTRY_SAVED";
export const COACH_ENTRY_SAVED = "journal/COACH_ENTRY_SAVED";
export const FETCH_ATHLETE_ENTRIES = "journal/FETCH_ATHLETE_ENTRIES";
export const FETCH_COACH_ENTRIES = "journal/FETCH_COACH_ENTRIES";
export const ATHLETE_ENTRIES_FETCHED = "journal/ATHLETE_ENTRIES_FETCHED";
export const COACH_ENTRIES_FETCHED = "journal/COACH_ENTRIES_FETCHED";
export const FETCH_ENTRIES_FAILED = "journal/FETCH_ENTRIES_FAILED";
export const FETCH_ENTRIES_SKIPPED = "journal/FETCH_ENTRIES_SKIPPED";
export const SAVE_QUEUED = "journal/SAVE_QUEUED";
export const SAVE_FAILED = "journal/SAVE_FAILED";

// The delete, now that there is one. `athlete_entries` and `coach_entries`
// both carry `destroy` in routes.rb, both controllers have the action, and
// both tables have a `deleted_at` column: the row keeps every word and every
// read path stops showing it. DELETE_ENTRY is what a screen dispatches;
// ENTRY_DELETED is the saga's own, put once the server has answered or once
// the write is safely in the outbox.
export const DELETE_ENTRY = "journal/DELETE_ENTRY";
export const ENTRY_DELETED = "journal/ENTRY_DELETED";
