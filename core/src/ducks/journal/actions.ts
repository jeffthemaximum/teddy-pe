import * as t from "./actionTypes";
import type { AthleteEntry, CoachEntry, DrillRatingValue } from "../../types";
import type { QueueableAction } from "../outbox/types";

// Which half of the journal a fetch or a fetch failure belongs to. Teddy's
// entries and Jeff's entries come from two endpoints with two different
// policies, so a screen loading one must not spin or fail the other.
export type JournalSide = "athlete" | "coach";

// What Teddy edits about his own day: his note and the one switch he
// controls. `felt`, `best` and `hard` are real columns (see types.ts) but no
// form built against them exists yet in this phase, so this payload stays
// exactly as wide as what a save actually sends today.
//
// `programYearId` is required, not inferred. AthleteEntriesController#create
// opens with `ProgramYear.find(entry_params.fetch(:program_year_id))`, and
// `fetch` raises on a missing key, so there is no such thing as a valid
// write without it. Every save this duck made was a 400 until this field
// existed.
export interface SaveAthleteEntryPayload {
  programYearId: number;
  date: string;
  note: string;
  shared: boolean;
}

// What Jeff edits about the same day: a note, a rating per drill, and the
// handful of scalar fields CoachEntriesController accepts. No `shared`: only
// the athlete's entry carries that switch. `programYearId` is required here
// for the same reason it is above; CoachEntriesController#create does the
// identical `fetch`.
export interface SaveCoachEntryPayload {
  programYearId: number;
  date: string;
  note: string | null;
  overall: number | null;
  energy: number | null;
  flag_pain: boolean;
  pain_note: string | null;
  challenge_num: string | null;
  ratings: Record<string, DrillRatingValue>;
}

// One place this key format is computed. It has two callers that must never
// drift apart: the action creators below, which stamp it onto a write when
// it is queued, and the saga (sagas.ts), which recomputes it to look a
// pending write back up by date when the toggle needs to know what note is
// waiting to be sent. A key format with two independent owners is exactly
// how this project has been bitten before.
export const ATHLETE_PREFIX = "athlete:";
export const COACH_PREFIX = "coach:";

export function athleteDedupeKey(date: string): string {
  return `${ATHLETE_PREFIX}${date}`;
}

export function coachDedupeKey(date: string): string {
  return `${COACH_PREFIX}${date}`;
}

// The inverse, and it lives here beside the two builders on purpose: reading
// a date back out of a key is the same format knowledge as writing one in,
// and the whole point of the two functions above is that the format has one
// home. Returns null for anything that is not this duck's key, which is how
// the outbox's replay reports get filtered down to writes this duck queued.
export function dateFromDedupeKey(dedupeKey: string): string | null {
  if (dedupeKey.startsWith(ATHLETE_PREFIX)) return dedupeKey.slice(ATHLETE_PREFIX.length);
  if (dedupeKey.startsWith(COACH_PREFIX)) return dedupeKey.slice(COACH_PREFIX.length);
  return null;
}

// Both save actions are built as full `QueueableAction`s at the moment they
// are created, not patched together later inside the saga. `dedupeKey` and
// `request` are already right there on the action a component dispatches, so
// enqueuing on failure is just `enqueue(action)`: the same action, verbatim,
// with nothing rebuilt and no chance for the queued copy to drift from what
// was actually attempted.
//
// Every key in these bodies is one the controller permits. Athlete:
// program_year_id, session_date, felt, best, hard, note, shared. Coach:
// program_year_id, session_date, overall, energy, flag_pain, pain_note,
// note, challenge_num, with `ratings` read from the top level of params
// rather than from inside `coach_entry`.
function athleteRequest(payload: SaveAthleteEntryPayload): QueueableAction["request"] {
  return {
    path: "/api/v1/athlete_entries",
    method: "POST",
    body: {
      athlete_entry: {
        program_year_id: payload.programYearId,
        session_date: payload.date,
        note: payload.note,
        shared: payload.shared,
      },
    },
  };
}

function coachRequest(payload: SaveCoachEntryPayload): QueueableAction["request"] {
  return {
    path: "/api/v1/coach_entries",
    method: "POST",
    body: {
      coach_entry: {
        program_year_id: payload.programYearId,
        session_date: payload.date,
        note: payload.note,
        overall: payload.overall,
        energy: payload.energy,
        flag_pain: payload.flag_pain,
        pain_note: payload.pain_note,
        challenge_num: payload.challenge_num,
      },
      ratings: payload.ratings,
    },
  };
}

export const saveAthleteEntry = (payload: SaveAthleteEntryPayload) =>
  ({
    type: t.SAVE_ATHLETE_ENTRY,
    payload,
    // One write per athlete per day, because AthleteEntry.upsert_for upserts
    // on (user, program_year, session_date). Two edits of the same day
    // collapse to one queued write; two different days never collide.
    dedupeKey: athleteDedupeKey(payload.date),
    request: athleteRequest(payload),
  }) as const;

export const saveCoachEntry = (payload: SaveCoachEntryPayload) =>
  ({
    type: t.SAVE_COACH_ENTRY,
    payload,
    dedupeKey: coachDedupeKey(payload.date),
    request: coachRequest(payload),
  }) as const;

// Teddy's toggle. It is its own action rather than folded into
// saveAthleteEntry, because flipping it is a decision he makes on its own,
// not a side effect of editing his note. The request it produces carries
// whatever note is already on record, never just `{shared}` alone. A partial
// body would let a later full save enqueued the same moment (same
// `dedupeKey`, same day) get replaced by this one in the outbox and never
// send its note at all, since the outbox keeps only the last queued write
// per key rather than merging two.
//
// `programYearId` is passed in rather than read off an entry already in
// state, for the same reason the saves take it: the entry may not be in
// state at all yet (a note typed offline has never been near the server),
// and a toggle that guessed the year wrong would write into the wrong one.
export const setShared = (payload: { programYearId: number; date: string; shared: boolean }) =>
  ({ type: t.SET_SHARED, payload }) as const;

export const athleteEntrySaved = (entry: AthleteEntry) =>
  ({ type: t.ATHLETE_ENTRY_SAVED, payload: entry }) as const;

export const coachEntrySaved = (entry: CoachEntry) =>
  ({ type: t.COACH_ENTRY_SAVED, payload: entry }) as const;

// The two reads. GET /api/v1/athlete_entries takes no parameters at all:
// AthleteEntriesController#index is `policy_scope(AthleteEntry)
// .order(:session_date)` and nothing else, so the scope alone decides what
// comes back (Teddy sees his own, Jeff sees only the shared ones).
export const fetchAthleteEntries = () => ({ type: t.FETCH_ATHLETE_ENTRIES }) as const;

// CoachEntriesController#index is the one that filters:
// `entries.between(params[:from], params[:to]) if params[:from] && params[:to]`.
// Both or neither, which is why this takes one range rather than two
// independent optional dates. No range means every coach entry, which is
// what a journal screen listing the year wants.
export const fetchCoachEntries = (range?: { from: string; to: string }) =>
  ({ type: t.FETCH_COACH_ENTRIES, payload: range ?? null }) as const;

export const athleteEntriesFetched = (entries: AthleteEntry[]) =>
  ({ type: t.ATHLETE_ENTRIES_FETCHED, payload: entries }) as const;

export const coachEntriesFetched = (entries: CoachEntry[]) =>
  ({ type: t.COACH_ENTRIES_FETCHED, payload: entries }) as const;

export const fetchEntriesFailed = (info: { side: JournalSide; message: string }) =>
  ({ type: t.FETCH_ENTRIES_FAILED, payload: info }) as const;

// A fetch dispatched with nobody signed in never goes out (see sagas.ts), so
// something has to put back the loading flag the FETCH action itself set.
// This is that, and only that: no error message, because an anonymous fetch
// is a bug in the calling screen rather than anything a person did or needs
// to be told about.
export const fetchEntriesSkipped = (info: { side: JournalSide }) =>
  ({ type: t.FETCH_ENTRIES_SKIPPED, payload: info }) as const;

// Dispatched once a save is off the app's hands and into the outbox: not
// saved, not failed, waiting for signal. Clears `saving[date]` without
// touching `error`, so a queued write does not spin the day's saving flag
// forever until the next direct save happens to land.
export const saveQueued = (info: { date: string }) =>
  ({ type: t.SAVE_QUEUED, payload: info }) as const;

export const saveFailed = (info: { date: string; message: string }) =>
  ({ type: t.SAVE_FAILED, payload: info }) as const;

export type JournalAction =
  | ReturnType<typeof saveAthleteEntry>
  | ReturnType<typeof saveCoachEntry>
  | ReturnType<typeof setShared>
  | ReturnType<typeof athleteEntrySaved>
  | ReturnType<typeof coachEntrySaved>
  | ReturnType<typeof fetchAthleteEntries>
  | ReturnType<typeof fetchCoachEntries>
  | ReturnType<typeof athleteEntriesFetched>
  | ReturnType<typeof coachEntriesFetched>
  | ReturnType<typeof fetchEntriesFailed>
  | ReturnType<typeof fetchEntriesSkipped>
  | ReturnType<typeof saveQueued>
  | ReturnType<typeof saveFailed>;
