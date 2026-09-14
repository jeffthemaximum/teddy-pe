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

// Deliberately no DELETE_ENTRY / ENTRY_DELETED. `athlete_entries` and
// `coach_entries` are `index create update` in routes.rb (`show` too for
// athlete_entries) and neither controller has a `destroy` action; there is
// no `deleted_at` column in db/schema.rb either. A delete action here would
// call an endpoint that 404s. Soft delete is coming as its own task that
// builds the Rails endpoint and this client together.
