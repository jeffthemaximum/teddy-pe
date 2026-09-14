import { formatFullDate } from "../src/lib/scheduling";

describe("formatFullDate", () => {
  it("reads as prose, not as the ISO string it was given", () => {
    expect(formatFullDate("2026-09-17")).toBe("Thursday, September 17, 2026");
  });

  it("names the day itself off the date's own parts, not off a parsed instant", () => {
    // `new Date("2026-09-17")` parses as UTC midnight; toLocaleDateString
    // would then report whichever day that instant is in the runtime's own
    // zone, which is the wrong day in any zone behind UTC. Building the
    // Date from the local parts (year, monthIndex, day) sidesteps that
    // parse entirely.
    //
    // This only actually exercises that difference because vite.config.ts
    // pins the test runner's zone behind UTC (America/Los_Angeles). Left
    // unpinned, a CI box that happened to sit in UTC would see the buggy
    // and the correct implementation report the same day and this would
    // pass against the very bug it exists to catch.
    expect(formatFullDate("2026-01-01")).toBe("Thursday, January 1, 2026");
    expect(formatFullDate("2026-12-31")).toBe("Thursday, December 31, 2026");
  });
});
