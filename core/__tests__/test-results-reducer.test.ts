import { reducer, actions, selectors, selectDefaultWindow } from "../src/ducks/testResults";
import type { TestDate, TestResult } from "../src/types";

const dates: TestDate[] = [
  { id: 1, window: "2026-09", label: "Baseline", display: "Sep 15-17", position: 1 },
  { id: 2, window: "2026-12", label: "December", display: "Dec 8-10", position: 2 },
  { id: 3, window: "2027-03", label: "March", display: "Mar 8-10", position: 3 },
];

describe("selectDefaultWindow", () => {
  it("picks the window the current date sits in", () => {
    expect(selectDefaultWindow(dates, new Date("2026-09-16"))).toBe("2026-09");
  });

  it("picks the nearest window when today is between two", () => {
    expect(selectDefaultWindow(dates, new Date("2026-11-20"))).toBe("2026-12");
  });

  it("picks the last window when the year is over rather than returning nothing", () => {
    expect(selectDefaultWindow(dates, new Date("2027-08-01"))).toBe("2027-03");
  });

  it("picks the first window before the year starts", () => {
    expect(selectDefaultWindow(dates, new Date("2026-08-01"))).toBe("2026-09");
  });

  it("returns null for an empty list rather than throwing", () => {
    expect(selectDefaultWindow([], new Date("2026-09-16"))).toBeNull();
  });
});

// Every real column a TestResult has, not an abbreviated shape: id,
// numeric_value and recorded_at included, the same reasoning the journal
// fixtures use, so the reducer is only ever proven against a shape the real
// API can send. numeric_value is a string here on purpose:
// TestResultsController#serialize sends `result.numeric_value&.to_s`, never
// a number.
const sept: TestResult = {
  id: 1,
  test_id: "t1",
  window: "2026-09",
  raw_value: "4.42",
  numeric_value: "4.42",
  recorded_at: "2026-09-16T19:00:00Z",
  updated_at: "2026-09-16T19:00:00Z",
};

describe("the test results reducer", () => {
  it("starts with nothing saving, nothing recorded, and no error", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      byWindow: {},
      saving: {},
      error: null,
    });
  });

  it("files a result under its window, then its test id", () => {
    const s = reducer(undefined, actions.resultSaved(sept));
    expect(s.byWindow["2026-09"]!["t1"]).toEqual(sept);
  });

  it("keeps two measures in the same window apart", () => {
    const first = reducer(undefined, actions.resultSaved(sept));
    const second = reducer(
      first,
      actions.resultSaved({ ...sept, test_id: "t2", raw_value: "5.10", numeric_value: "5.10" }),
    );
    expect(Object.keys(second.byWindow["2026-09"]!).sort()).toEqual(["t1", "t2"]);
    expect(second.byWindow["2026-09"]!["t1"]!.raw_value).toBe("4.42");
    expect(second.byWindow["2026-09"]!["t2"]!.raw_value).toBe("5.10");
  });

  it("keeps the same test id in two different windows apart", () => {
    const first = reducer(undefined, actions.resultSaved(sept));
    const second = reducer(
      first,
      actions.resultSaved({ ...sept, window: "2026-12", raw_value: "4.10", updated_at: "2026-12-08T19:00:00Z" }),
    );
    expect(second.byWindow["2026-09"]!["t1"]!.raw_value).toBe("4.42");
    expect(second.byWindow["2026-12"]!["t1"]!.raw_value).toBe("4.10");
  });

  it("replaces a measure's result rather than accumulating duplicates", () => {
    // The API upserts on (program_year, test_date, battery_measure). Two
    // saves of the same box are one row, never two.
    const first = reducer(undefined, actions.resultSaved(sept));
    const second = reducer(
      first,
      actions.resultSaved({ ...sept, raw_value: "4.30", numeric_value: "4.30", updated_at: "2026-09-16T19:05:00Z" }),
    );
    expect(Object.keys(second.byWindow["2026-09"]!)).toEqual(["t1"]);
    expect(second.byWindow["2026-09"]!["t1"]!.raw_value).toBe("4.30");
  });

  it("merges a whole fetch across several windows at once", () => {
    const s = reducer(
      undefined,
      actions.resultsFetched([sept, { ...sept, test_id: "t2", window: "2026-12" }]),
    );
    expect(s.byWindow["2026-09"]!["t1"]).toEqual(sept);
    expect(s.byWindow["2026-12"]!["t2"]!.window).toBe("2026-12");
  });

  it("tracks saving per window and test id, so one box does not spin another", () => {
    const s = reducer(undefined, actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "4.42" }));
    expect(selectors.selectIsSaving("2026-09", "t1")({ testResults: s })).toBe(true);
    expect(selectors.selectIsSaving("2026-09", "t2")({ testResults: s })).toBe(false);
    expect(selectors.selectIsSaving("2026-12", "t1")({ testResults: s })).toBe(false);
  });

  it("stops saving when the save lands", () => {
    const saving = reducer(undefined, actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "4.42" }));
    const saved = reducer(saving, actions.resultSaved(sept));
    expect(selectors.selectIsSaving("2026-09", "t1")({ testResults: saved })).toBe(false);
  });

  it("clears saving when a write is queued rather than saved or failed, and records nothing else", () => {
    const saving = reducer(undefined, actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "4.42" }));
    const queued = reducer(saving, actions.saveQueued({ window: "2026-09", testId: "t1" }));
    expect(selectors.selectIsSaving("2026-09", "t1")({ testResults: queued })).toBe(false);
    expect(queued.byWindow["2026-09"]).toBeUndefined();
    expect(selectors.selectTestResultsError({ testResults: queued })).toBeNull();
  });

  it("clears saving and records the message on a real failure", () => {
    const saving = reducer(undefined, actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "abc" }));
    const failed = reducer(
      saving,
      actions.saveFailed({ window: "2026-09", testId: "t1", message: "That is not a number." }),
    );
    expect(selectors.selectIsSaving("2026-09", "t1")({ testResults: failed })).toBe(false);
    expect(selectors.selectTestResultsError({ testResults: failed })).toBe("That is not a number.");
  });

  it("records a fetch failure's message without touching what is already on record", () => {
    const withData = reducer(undefined, actions.resultSaved(sept));
    const failed = reducer(withData, actions.fetchResultsFailed("Something went wrong."));
    expect(failed.byWindow["2026-09"]!["t1"]).toEqual(sept);
    expect(selectors.selectTestResultsError({ testResults: failed })).toBe("Something went wrong.");
  });

  it("removes the measure from state when the box was cleared, leaving its window's other measures alone", () => {
    // Clearing a box deletes the row server-side. Proving the measure is
    // gone, not merely that the action was accepted: a reducer that folded
    // `resultDeleted` in as if it were a save (storing something truthy
    // under test_id) would pass a looser assertion but still leave a
    // deleted measure looking recorded.
    const withTwo = reducer(
      reducer(undefined, actions.resultSaved(sept)),
      actions.resultSaved({ ...sept, test_id: "t2", raw_value: "5.10", numeric_value: "5.10" }),
    );
    const cleared = reducer(withTwo, actions.resultDeleted({ window: "2026-09", testId: "t1" }));
    expect("t1" in cleared.byWindow["2026-09"]!).toBe(false);
    expect(cleared.byWindow["2026-09"]!["t2"]).toBeDefined();
  });

  it("clears the saving flag on a delete the same way a save clears it", () => {
    const saving = reducer(
      undefined,
      actions.saveResult({ programYearId: 1, window: "2026-09", testId: "t1", rawValue: "" }),
    );
    const cleared = reducer(saving, actions.resultDeleted({ window: "2026-09", testId: "t1" }));
    expect(selectors.selectIsSaving("2026-09", "t1")({ testResults: cleared })).toBe(false);
  });

  it("does nothing to byWindow when the deleted measure was never recorded", () => {
    const s = reducer(undefined, actions.resultDeleted({ window: "2026-09", testId: "t1" }));
    expect(s.byWindow).toEqual({});
  });
});

describe("the test results selectors", () => {
  it("selectResultsForWindow reads only its own window, and an empty object for one with nothing yet", () => {
    const s = reducer(undefined, actions.resultSaved(sept));
    expect(selectors.selectResultsForWindow("2026-09")({ testResults: s })).toEqual({ t1: sept });
    expect(selectors.selectResultsForWindow("2026-12")({ testResults: s })).toEqual({});
  });
});
