import { createFetchDuck } from "../../lib/createFetchDuck";
import type { ProgramYearDetail } from "../../types";

// One year in full: blocks, areas, patches, ball gates, the fitness battery,
// test dates, day roles. Everything the year overview screen needs in one
// call, exactly as the API groups it.
export const programYear = createFetchDuck<ProgramYearDetail, number>({
  name: "programYear",
  path: (id) => `/api/v1/program_years/${id}`,
});
