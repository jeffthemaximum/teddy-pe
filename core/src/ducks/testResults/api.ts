import { apiRequest } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { TestResult } from "../../types";

// The one call fetchResults makes. Kept apart from the saga the same way
// auth's login() is: one path, named once, so the saga has nothing of its
// own to get wrong about the URL.
//
// `program_year_id` is sent as a query parameter: TestResultsController#index
// only filters by it "if params[:program_year_id]", so the server would
// still answer without one, but nothing in this app has a reason to see
// every year's results instead of the one currently open.
export function fetchTestResults(config: CoreConfig, token: string | null, programYearId: number) {
  return apiRequest<{ test_results: TestResult[] }>(config, {
    path: `/api/v1/test_results?program_year_id=${programYearId}`,
    token,
  });
}
