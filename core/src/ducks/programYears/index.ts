import { createFetchDuck } from "../../lib/createFetchDuck";
import type { ProgramYearSummary } from "../../types";

// The list screen: every year Teddy has run or will run, newest first per
// the API's own ordering. One line of real decision here, the URL; the rest
// of the shape is createFetchDuck's, tested once in Task 4.
export const programYears = createFetchDuck<{ program_years: ProgramYearSummary[] }, void>({
  name: "programYears",
  path: () => "/api/v1/program_years",
});
