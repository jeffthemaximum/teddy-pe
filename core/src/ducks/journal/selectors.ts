import { createSelector } from "@reduxjs/toolkit";
import type { AthleteEntry, CoachEntry } from "../../types";
import type { JournalState } from "./reducer";

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
