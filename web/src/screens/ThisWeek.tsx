import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  authSelectors,
  week,
  selectWeek,
  selectWeekBudget,
  selectWeekSpend,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { DayCard } from "../components/DayCard";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { byWeekday, todayISODate } from "../lib/scheduling";

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

export function ThisWeek() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

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

  // Handed down through DayCard to Tokens, which stays ignorant of how
  // navigation happens (see Tokens.tsx and DayCard.tsx): this is the one
  // place in that chain that knows a slug becomes a URL. A tap opens the
  // glossary at that drill; the glossary reads the slug back off the URL,
  // which is also what makes it bookmarkable and back-button-able (see
  // Glossary.tsx for why that beats keeping it in local state).
  function openDrill(slug: string) {
    navigate(`/glossary/${slug}`);
  }

  if (!data) {
    if (currentId === null) {
      return (
        <div className="this-week">
          <WaitingForYearId label={FINDING_YEAR_LABEL} />
        </div>
      );
    }
    if (loading) {
      return (
        <div className="this-week">
          <Loading label={WAKING_LABEL} />
        </div>
      );
    }
    if (error) {
      return (
        <div className="this-week">
          <ErrorNote message={error} />
        </div>
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
    <div className="this-week">
      {loading && <Loading label={WAKING_LABEL} />}
      {error && <ErrorNote message={error} />}

      <h1>{data.theme}</h1>
      <p className="this-week__dates">{data.dates_display}</p>
      <p className="this-week__effort">
        Effort spent: {spend} of {budget}
      </p>

      {days.length === 0 ? (
        <p className="this-week__empty">Nothing has been planned for this week yet.</p>
      ) : (
        <ol aria-label="Days" className="this-week__days">
          {days.map((day) => (
            <li key={day.id}>
              <DayCard day={day} isToday={day.date === today} onSelectDrill={openDrill} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
