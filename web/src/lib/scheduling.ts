// Small, pure helpers that four different files in this app each had a
// reason to want: sorting a week's days, sorting a year's positioned rows,
// labelling a day of the week, and naming "today" and "this month" off the
// clock. None of it is UI. All of it is either a sort the API's own payload
// does not guarantee (a day's `dow`, an area's or a block's `position`) or a
// decision only the caller can make (which day is "today", which month is
// "the month"), and the Phase 4 native app will face the exact same payload
// shapes and the exact same clock. That is the case for putting this in
// core/ rather than here; it stays here for now only because core/'s public
// surface is asserted as an exact set elsewhere, and widening it is its own
// task. See the report for this task for the fuller version of that
// argument.
//
// Before this module existed, DOW_ORDER and byWeekday were written out,
// identically, in both Month.tsx and ThisWeek.tsx, and dowLabel in both
// Month.tsx and DayCard.tsx: three chances for one of the two copies to
// drift the next time a day name changed, and nobody would see it happen
// until the two screens disagreed on screen.
export const DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function byWeekday<T extends { dow: string }>(days: T[]): T[] {
  return [...days].sort((a, b) => DOW_ORDER.indexOf(a.dow) - DOW_ORDER.indexOf(b.dow));
}

export function dowLabel(dow: string): string {
  return dow.length ? dow[0]!.toUpperCase() + dow.slice(1) : dow;
}

export function byPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

// Local date parts (not toISOString, which is UTC) because a day card's own
// `date` is a local calendar date ("2026-09-17"), and toISOString can name
// the wrong day near midnight in a timezone ahead of UTC. Takes `now` so a
// test can ask the same clock this app asks, rather than depending on
// whichever day the suite happens to run on.
export function todayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// There is no "/plans/current" the way weeks has "/weeks/current": a month
// is addressed by its literal "YYYY-MM" key, so this, not the payload,
// decides which month "the month" means: today's, off the clock.
export function currentMonthKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
