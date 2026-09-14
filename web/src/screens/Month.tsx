import { useEffect } from "react";
import { plan, authSelectors, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import type { WeekPayload } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { byWeekday, currentMonthKey, dowLabel } from "../lib/scheduling";

// Same cold-Fly-machine wait as Year and sign in: 6.6 to 7.6 seconds. A
// blank month reads as broken; "waking up" reads as slow.
const WAKING_LABEL = "Waking up the server. The month can take a few seconds to load.";

// Shown while the id itself is still unknown, the same gap Year.tsx already
// names with FINDING_YEAR_LABEL. selectCurrentProgramYearId is null both
// while /api/v1/me is still in flight right after sign-in, and, more
// lastingly, when a restore succeeded on a cached session because /me could
// not answer for a reason that says nothing about the token (a cold server,
// no connection): core deliberately lets that restore succeed rather than
// sign someone out over a slow tunnel, so a signed-in person can genuinely
// sit at this screen with no id yet. Saying so, in the same waking voice as
// everywhere else, beats a content area that just stays empty with no
// explanation.
const FINDING_MONTH_LABEL = "Waking up the server. Finding this month can take a few seconds too.";

function byNumber(weeks: WeekPayload[]): WeekPayload[] {
  return [...weeks].sort((a, b) => a.number - b.number);
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
    if (yearId === null) {
      return (
        <div className="month">
          <WaitingForYearId label={FINDING_MONTH_LABEL} />
        </div>
      );
    }
    if (loading) {
      return (
        <div className="month">
          <Loading label={WAKING_LABEL} />
        </div>
      );
    }
    if (error) {
      return (
        <div className="month">
          <ErrorNote message={error} />
        </div>
      );
    }
    // The id is known, nothing has loaded and nothing has failed: the fetch
    // above has been dispatched but the store has not caught up in this
    // render yet. Every screen can be asked to render before its own data
    // arrives.
    return null;
  }

  const weeks = byNumber(data.weeks);
  // Math.max over an empty array is -Infinity, and nothing downstream
  // should ever read a budget like that, so this only runs the comparison
  // when there is a week to compare.
  const fullBudget = weeks.length > 0 ? Math.max(...weeks.map((week) => week.budget)) : 0;

  return (
    <div className="month">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>{data.label}</h1>
      <p className="month__range">{data.range_display}</p>

      {weeks.length === 0 ? (
        <p className="month__empty">Nothing has been planned for this month yet.</p>
      ) : (
        weeks.map((week) => <WeekSection key={week.number} week={week} fullBudget={fullBudget} />)
      )}
    </div>
  );
}

// `fullBudget` is the largest budget the API sent for this month, and it is
// what makes a lighter week visible without this file holding any opinion
// about which weeks are lighter or about what the program calls them. The
// payload decides, the screen reports. The `week.trials` flag would say the
// same thing in one boolean, but a minifier cannot rename a property access,
// so reading it drops the program's own word for that week into a public
// bundle (see __tests__/bundle-privacy.test.ts).
function WeekSection({ week, fullBudget }: { week: WeekPayload; fullBudget: number }) {
  const headingId = `month-week-${week.number}-heading`;
  const days = byWeekday(week.days);

  return (
    <section aria-labelledby={headingId} className="month__week">
      <h2 id={headingId}>
        Week {week.number}: {week.theme}
      </h2>
      <p className="month__dates">{week.dates_display}</p>
      {week.budget < fullBudget && (
        <p className="month__lighter">A lighter week than the others this month.</p>
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
        <strong>Challenge:</strong> {week.challenge}
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
