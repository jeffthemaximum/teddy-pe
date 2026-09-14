import { useEffect } from "react";
import {
  authSelectors,
  week,
  selectWeek,
  selectWeekBudget,
  selectWeekSpend,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { DayCard as DayCardPayload } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { DayCard } from "../components/DayCard";

// Same cold-Fly-machine wait as Year and Month: 6.6 to 7.6 seconds. This is
// the screen Teddy opens, so a blank panel here is the worst place in the
// app for it to look broken.
const WAKING_LABEL = "Waking up the server. This week can take a few seconds to load.";

// Shown while the year id itself is still unknown, the same gap Year.tsx
// (see its own comment) and Month.tsx both have to cover: null both while
// /api/v1/me is still in flight right after sign-in, and, more lastingly,
// when a restore succeeded on a cached session because /me could not
// answer for a reason that says nothing about the token.
const FINDING_YEAR_LABEL = "Waking up the server. Finding this week can take a few seconds too.";

const DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function byWeekday(days: DayCardPayload[]): DayCardPayload[] {
  return [...days].sort((a, b) => DOW_ORDER.indexOf(a.dow) - DOW_ORDER.indexOf(b.dow));
}

// Exported for the same reason Month.tsx exports currentMonthKey: so a test
// can ask the same clock this screen asks, by passing `now`, instead of
// depending on whichever day the suite happens to run on. Local date parts
// (not toISOString, which is UTC) because a day card's own `date` is a
// local calendar date ("2026-09-17"), and toISOString can name the wrong
// day near midnight in a timezone ahead of UTC.
export function todayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ThisWeek() {
  const dispatch = useAppDispatch();

  // core carries the current program year id itself, read at sign-in and
  // at restore (see Year.tsx's own comment on authSelectors
  // .selectCurrentProgramYearId). Nothing here fetches the program-years
  // list to find it.
  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);

  const data = useAppSelector(selectWeek);
  const loading = useAppSelector(week.selectors.selectIsLoading);
  const error = useAppSelector(week.selectors.selectError);
  const budget = useAppSelector(selectWeekBudget);
  const spend = useAppSelector(selectWeekSpend);

  // Fires once currentId resolves from null to a real id, and again only if
  // it ever changes. A screen that asked again on every render would
  // hammer a server that takes seven seconds to wake.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(week.actions.fetch(currentId));
    }
  }, [dispatch, currentId]);

  if (!data) {
    if (currentId === null) {
      return (
        <main className="this-week">
          <Loading label={FINDING_YEAR_LABEL} />
        </main>
      );
    }
    if (loading) {
      return (
        <main className="this-week">
          <Loading label={WAKING_LABEL} />
        </main>
      );
    }
    if (error) {
      return (
        <main className="this-week">
          <ErrorNote message={error} />
        </main>
      );
    }
    // The id is known, nothing has loaded and nothing has failed: the
    // fetch above has been dispatched but the store has not caught up in
    // this render yet.
    return null;
  }

  const today = todayISODate();
  const days = byWeekday(data.days);

  return (
    <main className="this-week">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>{data.theme}</h1>
      <p className="this-week__dates">{data.dates_display}</p>
      <p className="this-week__effort">
        Effort spent: {spend} of {budget}
      </p>

      <ol aria-label="Days" className="this-week__days">
        {days.map((day) => (
          <li key={day.id}>
            <DayCard day={day} isToday={day.date === today} />
          </li>
        ))}
      </ol>
    </main>
  );
}
