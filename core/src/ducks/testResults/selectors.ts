import type { TestDate, TestResult } from "../../types";
import type { TestResultsState } from "./reducer";

interface WithTestResults {
  testResults: TestResultsState;
}

export const selectResultsForWindow =
  (window: string) =>
  (s: WithTestResults): Record<string, TestResult> =>
    s.testResults.byWindow[window] ?? {};

export const selectIsSaving =
  (window: string, testId: string) =>
  (s: WithTestResults): boolean =>
    Boolean(s.testResults.saving[`${window}:${testId}`]);

export const selectTestResultsError = (s: WithTestResults): string | null => s.testResults.error;

// A coach standing on a court with a stopwatch should not have to pick the
// window before typing a number. Pick the one today is in, and otherwise
// the nearest, because being a fortnight early for December is still
// December.
export function selectDefaultWindow(dates: TestDate[], today: Date): string | null {
  if (dates.length === 0) return null;

  const asMonths = (window: string) => {
    const [y, m] = window.split("-").map(Number);
    return y! * 12 + (m! - 1);
  };
  const now = today.getUTCFullYear() * 12 + today.getUTCMonth();

  let best = dates[0]!;
  let bestDistance = Math.abs(asMonths(best.window) - now);
  for (const d of dates.slice(1)) {
    const distance = Math.abs(asMonths(d.window) - now);
    // Strictly less than, so a tie keeps the earlier window rather than
    // sliding forward to one that has not happened yet.
    if (distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  return best.window;
}
