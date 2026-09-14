import { useEffect } from "react";
import { plan, authSelectors, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import type { DayCard, WeekPayload } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";

// Same cold-Fly-machine wait as Year and sign in: 6.6 to 7.6 seconds. A
// blank month reads as broken; "waking up" reads as slow.
const WAKING_LABEL = "Waking up the server. The month can take a few seconds to load.";

const DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function byWeekday(days: DayCard[]): DayCard[] {
  return [...days].sort((a, b) => DOW_ORDER.indexOf(a.dow) - DOW_ORDER.indexOf(b.dow));
}

function dowLabel(dow: string): string {
  return dow.length ? dow[0]!.toUpperCase() + dow.slice(1) : dow;
}

// There is no "/plans/current" the way weeks has "/weeks/current"
// (core/src/ducks/plan/index.ts and backend/app/controllers/api/v1/
// plans_controller.rb both address a month by its literal "YYYY-MM" key).
// So this screen, not the payload, decides which month "the month" means:
// today's, off the clock. Exported so a test can ask for the same value
// the component asked for, rather than reimplementing the formatting and
// risking the two copies drifting apart.
export function currentMonthKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function Month() {
  const dispatch = useAppDispatch();

  // core's auth state carries the current program year id straight off
  // GET /api/v1/me (authSelectors.selectCurrentProgramYearId), fetched once
  // at sign-in and again at restore. Nothing here fetches the program-years
  // list to find it, the way Year.tsx once had to before that existed.
  const yearId = useAppSelector(authSelectors.selectCurrentProgramYearId);

  const data = useAppSelector(plan.selectors.selectData);
  const loading = useAppSelector(plan.selectors.selectIsLoading);
  const error = useAppSelector(plan.selectors.selectError);

  // Fires once yearId resolves from null to a real id, and again only if it
  // ever changes. A screen that asked again on every render would hammer a
  // server that takes seven seconds to wake.
  useEffect(() => {
    if (yearId !== null) {
      dispatch(plan.actions.fetch({ yearId, month: currentMonthKey() }));
    }
  }, [dispatch, yearId]);

  if (!data) {
    if (loading) {
      return (
        <main className="month">
          <Loading label={WAKING_LABEL} />
        </main>
      );
    }
    if (error) {
      return (
        <main className="month">
          <ErrorNote message={error} />
        </main>
      );
    }
    // Nothing has loaded and nothing has failed yet. There is nothing true
    // to say about the month, so there is nothing to render.
    return null;
  }

  return (
    <main className="month">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>{data.label}</h1>
      <p className="month__range">{data.range_display}</p>

      {data.weeks.map((week) => (
        <WeekSection key={week.number} week={week} />
      ))}
    </main>
  );
}

function WeekSection({ week }: { week: WeekPayload }) {
  const headingId = `month-week-${week.number}-heading`;
  const days = byWeekday(week.days);

  return (
    <section aria-labelledby={headingId} className="month__week">
      <h2 id={headingId}>
        Week {week.number}: {week.theme}
      </h2>
      <p className="month__dates">{week.dates_display}</p>
      {week.trials && (
        // The word this marks is program vocabulary that must never sit in
        // this app's own static bundle text (see
        // __tests__/bundle-privacy.test.ts), only ever arrive at runtime off
        // the API, the way week.theme and week.challenge already do below.
        <p className="month__trials">Half-volume week. A rank-up follows.</p>
      )}

      <p className="month__effort">
        Effort spent: {week.high_intent_efforts} of {week.budget}
      </p>

      <h3>This week&apos;s targets</h3>
      <ul aria-label="Sub-targets">
        {week.targets.map((target) => (
          <li key={target}>{target}</li>
        ))}
      </ul>

      <p className="month__challenge">
        <strong>Challenge of the week:</strong> {week.challenge}
      </p>

      <h3>Days</h3>
      <ol aria-label="Days">
        {days.map((day) => (
          <li key={day.id}>
            <strong>{dowLabel(day.dow)}</strong> {day.date} &middot; {day.name}
            <p>
              {day.role} &middot; {day.minutes} min
            </p>
            <ul aria-label={`${dowLabel(day.dow)} summary`}>
              {day.summary_lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
