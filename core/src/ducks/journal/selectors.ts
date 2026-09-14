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

export const selectIsSaving = (date: string) => (s: WithJournal): boolean =>
  Boolean(s.journal.saving[date]);

export const selectJournalError = (s: WithJournal) => s.journal.error;
