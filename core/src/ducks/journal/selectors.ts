import { createSelector } from "@reduxjs/toolkit";
import type { AthleteEntry, CoachEntry } from "../../types";
import type { JournalState } from "./reducer";
import { selectQueue } from "../outbox/selectors";
import { athleteDedupeKey, coachDedupeKey } from "./actions";
import type { JournalSide } from "./actions";

interface WithJournal {
  journal: JournalState;
}

export const selectCoachEntryFor =
  (date: string) =>
  (s: WithJournal): CoachEntry | null =>
    s.journal.coach[date] ?? null;

export const selectAthleteEntryFor =
  (date: string) =>
  (s: WithJournal): AthleteEntry | null =>
    s.journal.athlete[date] ?? null;

// The two list selectors a journal screen reads, oldest day first, the same
// order both index endpoints send (`order(:session_date)`).
//
// Built with createSelector rather than as plain functions because each one
// has to produce a new array to sort it, and a selector that returns a fresh
// array every call re-renders its screen on every unrelated store change.
// Memoized on the slice's own map, so the array is rebuilt only when an
// entry actually lands.
function byDate<T extends { session_date: string }>(map: Record<string, T>): T[] {
  return Object.values(map).sort((a, b) => a.session_date.localeCompare(b.session_date));
}

export const selectAthleteEntries = createSelector(
  (s: WithJournal) => s.journal.athlete,
  byDate<AthleteEntry>,
);

export const selectCoachEntries = createSelector(
  (s: WithJournal) => s.journal.coach,
  byDate<CoachEntry>,
);

export const selectIsSaving = (date: string) => (s: WithJournal): boolean =>
  Boolean(s.journal.saving[date]);

export const selectIsLoadingAthleteEntries = (s: WithJournal): boolean =>
  s.journal.loading.athlete;

export const selectIsLoadingCoachEntries = (s: WithJournal): boolean => s.journal.loading.coach;

export const selectJournalError = (s: WithJournal) => s.journal.error;

// Whether a write for this date and side is sitting in the outbox, queued
// but not yet sent. A screen needs exactly this to tell Teddy an entry he
// wrote with no signal is still waiting to go, and until now it had no way
// to ask: it watched `selectIsSaving` clear while the entry it already held
// stayed the same, a heuristic that happens to look right but is really
// only checking that nothing changed, not that anything is queued. The
// outbox knows for certain. This asks it.
//
// It lives here, on the journal duck, rather than on the outbox's, because
// the two halves of the answer have two different owners. The outbox owns
// the queue: `selectQueue` (imported below) already narrows it to the
// signed-in person's own writes, the same scoping `setShared` reads through
// in sagas.ts. But the outbox has no idea what an `athlete:2026-09-17`
// dedupeKey means; only this duck stamps that prefix on, in
// `athleteDedupeKey`/`coachDedupeKey` (actions.ts), and only this duck
// should ever have to know it. Building the answer here means a screen
// asks in its own language, a side and a date, the same two things
// `selectAthleteEntryFor`/`selectCoachEntryFor` already take, instead of
// building a dedupeKey string itself. Let an app do that and the format
// has two owners in two packages, which is the exact drift the comment on
// `ATHLETE_PREFIX`/`COACH_PREFIX` already warns about for this duck's own
// two callers.
export const selectIsEntryQueued =
  (side: JournalSide, date: string) =>
  (s: Parameters<typeof selectQueue>[0]): boolean => {
    const key = side === "athlete" ? athleteDedupeKey(date) : coachDedupeKey(date);
    return selectQueue(s).some((write) => write.action.dedupeKey === key);
  };
