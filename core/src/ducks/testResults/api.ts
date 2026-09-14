import { apiRequest } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { TestResult } from "../../types";

// The one call fetchResults makes. Kept apart from the saga the same way
// auth's login() is: one path, named once, so the saga has nothing of its
// own to get wrong about the URL.
export function fetchTestResults(config: CoreConfig, token: string | null) {
  return apiRequest<{ test_results: TestResult[] }>(config, {
    path: "/api/v1/test_results",
    token,
  });
}
