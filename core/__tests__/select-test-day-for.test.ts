import { selectTestDayFor } from "../src/ducks/testResults/selectors";
import type { TestDate } from "../src/types";

function window(overrides: Partial<TestDate> & Pick<TestDate, "window">): TestDate {
  return {
    id: 1,
    label: "Baseline",
    display: "Sep 15–17",
    starts_on: "2026-09-15",
    ends_on: "2026-09-17",
    position: 1,
    ...overrides,
  };
}

const BASELINE = window({ window: "2026-09" });
const RETEST = window({
  id: 2,
  window: "2026-12",
  label: "Retest 1",
  display: "Dec 7–11",
  starts_on: "2026-12-07",
  ends_on: "2026-12-11",
  position: 2,
});
const DATES = [BASELINE, RETEST];

describe("selectTestDayFor", () => {
  // The three days of the baseline, each named, because "day 2 of 3" is the
  // whole reason this returns a number rather than a boolean and an
  // off-by-one here would read as a wrong day on the court.
  it("counts the first day of a window as day 1", () => {
    expect(selectTestDayFor(DATES, "2026-09-15")).toEqual({
      testDate: BASELINE,
      dayNumber: 1,
      dayCount: 3,
    });
  });

  it("counts a middle day", () => {
    expect(selectTestDayFor(DATES, "2026-09-16")).toEqual({
      testDate: BASELINE,
      dayNumber: 2,
      dayCount: 3,
    });
  });

  it("counts the last day", () => {
    expect(selectTestDayFor(DATES, "2026-09-17")).toEqual({
      testDate: BASELINE,
      dayNumber: 3,
      dayCount: 3,
    });
  });

  it("finds a window other than the first", () => {
    expect(selectTestDayFor(DATES, "2026-12-09")).toEqual({
      testDate: RETEST,
      dayNumber: 3,
      dayCount: 5,
    });
  });

  // The day either side of a window, which is what makes the section
  // disappear rather than linger for a month.
  it("finds nothing the day before a window opens", () => {
    expect(selectTestDayFor(DATES, "2026-09-14")).toBeNull();
  });

  it("finds nothing the day after a window closes", () => {
    expect(selectTestDayFor(DATES, "2026-09-18")).toBeNull();
  });

  it("finds nothing between windows", () => {
    expect(selectTestDayFor(DATES, "2026-10-20")).toBeNull();
  });

  it("finds nothing when there are no windows at all", () => {
    expect(selectTestDayFor([], "2026-09-16")).toBeNull();
  });

  // The deploy window: Vercel has the new front end, Fly has not been
  // deployed, so the payload omits both keys. Today must show no test
  // section rather than place the day wrongly or throw.
  it("cannot place a window whose dates the server has not sent", () => {
    const old = { ...BASELINE };
    delete (old as Partial<TestDate>).starts_on;
    delete (old as Partial<TestDate>).ends_on;
    expect(selectTestDayFor([old], "2026-09-16")).toBeNull();
  });

  it("cannot place a window with a null start", () => {
    expect(selectTestDayFor([{ ...BASELINE, starts_on: null }], "2026-09-16")).toBeNull();
  });

  it("cannot place a window with a null end", () => {
    expect(selectTestDayFor([{ ...BASELINE, ends_on: null }], "2026-09-16")).toBeNull();
  });

  // A window one day long. dayCount 1 is a real answer, and a formula that
  // subtracted without adding one would return 0 here.
  it("handles a window one day long", () => {
    const single = { ...BASELINE, starts_on: "2026-09-15", ends_on: "2026-09-15" };
    expect(selectTestDayFor([single], "2026-09-15")).toEqual({
      testDate: single,
      dayNumber: 1,
      dayCount: 1,
    });
  });

  // Crossing a month and crossing a year, where string comparison still
  // works but naive day arithmetic on the day-of-month would not.
  it("handles a window that crosses a month", () => {
    const crossing = { ...BASELINE, starts_on: "2027-06-28", ends_on: "2027-07-02" };
    expect(selectTestDayFor([crossing], "2027-07-01")).toEqual({
      testDate: crossing,
      dayNumber: 4,
      dayCount: 5,
    });
  });

  it("handles a window that crosses a year", () => {
    const crossing = { ...BASELINE, starts_on: "2026-12-30", ends_on: "2027-01-02" };
    expect(selectTestDayFor([crossing], "2027-01-01")).toEqual({
      testDate: crossing,
      dayNumber: 3,
      dayCount: 4,
    });
  });
});
