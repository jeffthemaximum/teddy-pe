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

export interface TestDay {
  testDate: TestDate;
  dayNumber: number;
  dayCount: number;
}

// Whole days since the epoch, from the date's own parts. Not `new Date(iso)`,
// which parses a bare "2026-09-15" as midnight UTC and then reports it in
// the viewer's zone, so a coach west of Greenwich would be told the window
// opened a day later than it did. Date.UTC on the parts has no zone in it at
// all, which is the right amount of timezone for a calendar date.
function utcDays(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

// Which test window, if any, `isoDate` falls inside, and where in it.
// `dayNumber` is 1-based because "day 2 of 3" is what a person standing on a
// court with a stopwatch reads.
//
// A window missing either date is one this cannot place, and it is skipped
// rather than guessed at. That is not defensive padding: merging to `main`
// rebuilds the web app and does not deploy the API, so this front end runs
// against a payload with neither field until somebody deploys Fly. See the
// comment on TestDate in types.ts.
export function selectTestDayFor(dates: TestDate[], isoDate: string): TestDay | null {
  for (const testDate of dates) {
    const { starts_on: startsOn, ends_on: endsOn } = testDate;
    if (!startsOn || !endsOn) continue;
    // ISO dates are zero-padded and fixed width, so comparing them as
    // strings orders them correctly and costs no parsing.
    if (isoDate < startsOn || isoDate > endsOn) continue;
    const start = utcDays(startsOn);
    return {
      testDate,
      dayNumber: utcDays(isoDate) - start + 1,
      dayCount: utcDays(endsOn) - start + 1,
    };
  }
  return null;
}
