import * as t from "./actionTypes";
import type { AthleteEntry, CoachEntry, DrillRatingValue } from "../../types";
import type { QueueableAction } from "../outbox/types";

// What Teddy edits about his own day: his note and the one switch he
// controls. `felt`, `best` and `hard` are real columns (see types.ts) but no
// form built against them exists yet in this phase, so this payload stays
// exactly as wide as what a save actually sends today.
export interface SaveAthleteEntryPayload {
  date: string;
  note: string;
  shared: boolean;
}

// What Jeff edits about the same day: a note, a rating per drill, and the
// handful of scalar fields CoachEntriesController accepts. No `shared`: only
// the athlete's entry carries that switch.
export interface SaveCoachEntryPayload {
  date: string;
  note: string | null;
  overall: number | null;
  energy: number | null;
  flag_pain: boolean;
  pain_note: string | null;
  challenge_num: string | null;
  ratings: Record<string, DrillRatingValue>;
}

// Both save actions are built as full `QueueableAction`s at the moment they
// are created, not patched together later inside the saga. `dedupeKey` and
// `request` are already right there on the action a component dispatches, so
// enqueuing on failure is just `enqueue(action)` — the same action, verbatim,
// with nothing rebuilt and no chance for the queued copy to drift from what
// was actually attempted.
function athleteRequest(payload: SaveAthleteEntryPayload): QueueableAction["request"] {
  return {
    path: "/api/v1/athlete_entries",
    method: "POST",
    body: { athlete_entry: { session_date: payload.date, note: payload.note, shared: payload.shared } },
  };
}

function coachRequest(payload: SaveCoachEntryPayload): QueueableAction["request"] {
  return {
    path: "/api/v1/coach_entries",
    method: "POST",
    body: {
      coach_entry: {
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
    dedupeKey: `athlete:${payload.date}`,
    request: athleteRequest(payload),
  }) as const;

export const saveCoachEntry = (payload: SaveCoachEntryPayload) =>
  ({
    type: t.SAVE_COACH_ENTRY,
    payload,
    dedupeKey: `coach:${payload.date}`,
    request: coachRequest(payload),
  }) as const;

// Teddy's toggle. It is its own action rather than folded into
// saveAthleteEntry, because flipping it is a decision he makes on its own,
// not a side effect of editing his note — but the request it produces
// carries whatever note is already on record, never just `{shared}` alone.
// A partial body would let a later full save enqueued the same moment (same
// `dedupeKey`, same day) get replaced by this one in the outbox and never
// send its note at all, since the outbox keeps only the last queued write
// per key rather than merging two.
export const setShared = (payload: { date: string; shared: boolean }) =>
  ({ type: t.SET_SHARED, payload }) as const;

export const athleteEntrySaved = (entry: AthleteEntry) =>
  ({ type: t.ATHLETE_ENTRY_SAVED, payload: entry }) as const;

export const coachEntrySaved = (entry: CoachEntry) =>
  ({ type: t.COACH_ENTRY_SAVED, payload: entry }) as const;

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
  | ReturnType<typeof saveQueued>
  | ReturnType<typeof saveFailed>;
