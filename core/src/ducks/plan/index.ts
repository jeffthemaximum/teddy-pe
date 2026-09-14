import { createFetchDuck } from "../../lib/createFetchDuck";
import type { MonthPlan } from "../../types";

// The month view: a calendar's worth of weeks, each with its day cards. Day
// cards here omit blocks, dad_note and the journal entries; those arrive
// only on the week payload, once Teddy is looking at one specific day.
export const plan = createFetchDuck<MonthPlan, { yearId: number; month: string }>({
  name: "plan",
  path: (a) => `/api/v1/program_years/${a.yearId}/plans/${a.month}`,
});
