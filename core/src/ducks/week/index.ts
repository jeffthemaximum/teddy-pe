import type { FetchState } from "../../lib/createFetchDuck";
import { createFetchDuck } from "../../lib/createFetchDuck";
import type { DayCard, Week } from "../../types";

// The current week, always "current" from the year's own point of view, so
// there is nothing to compute or pick on the client.
export const week = createFetchDuck<Week, number>({
  name: "week",
  path: (yearId) => `/api/v1/program_years/${yearId}/weeks/current`,
});

interface WithWeek {
  week: FetchState<Week>;
}

export const selectWeek = (s: WithWeek): Week | null => s.week.data;

// Exact match only. A day card carries a full date ("2026-09-17"), and a
// prefix match ("2026-09-1") would also catch the 10th through the 19th,
// handing a 7-year-old the wrong session on the wrong day.
export const selectDayByDate =
  (date: string) =>
  (s: WithWeek): DayCard | null =>
    s.week.data?.days.find((d) => d.date === date) ?? null;

// The budget is on the payload rather than computed here. CLAUDE.md sets it
// at 40 a week and 20 in Trials weeks, and the API already applies that
// rule, so recomputing it on the client would be a second owner of a
// program rule.
export const selectWeekBudget = (s: WithWeek): number | null => s.week.data?.budget ?? null;
export const selectWeekSpend = (s: WithWeek): number | null =>
  s.week.data?.high_intent_efforts ?? null;
