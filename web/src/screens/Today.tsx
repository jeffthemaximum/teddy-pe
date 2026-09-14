import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  authSelectors,
  drills,
  journalActions,
  programYear,
  selectDayByDate,
  selectWeek,
  testResultsActions,
  testResultsSelectors,
  useAppDispatch,
  useAppSelector,
  week,
} from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { TodayCard } from "../components/TodayCard";
import { CoachNoteForm } from "../components/CoachNoteForm";
import { AthleteNoteForm } from "../components/AthleteNoteForm";
import { TestSheet } from "../components/TestSheet";
import { byPosition, formatFullDate, todayISODate } from "../lib/scheduling";

// He opens this standing on a court, sometimes before the server has woken
// up. Same cold-Fly-machine wait as every other screen, named for what is
// actually loading here.
const WAKING_LABEL = "Waking up the server. Today can take a few seconds to load.";

// Shown while the current program year id is still unknown, the same gap
// every other screen covers the same way (see WaitingForYearId's own
// comment). Named for this screen rather than reusing another screen's
// label verbatim, since "finding today" is literally what is blocked here.
const FINDING_YEAR_LABEL = "Waking up the server. Finding today can take a few seconds too.";

// Said once the week has actually answered and holds no card for today.
// That covers more than a missing card: weeks/current falls back to the
// year's first week when none contains today (see core's own week duck), so
// a date before the year starts, after it ends, or inside a month whose
// cards are not written yet all arrive here looking the same. One honest
// sentence is right in all of them, and it is said only once the week has
// actually answered: saying it while one is still on its way would be a
// guess dressed as a fact, and he would believe it and go write the session
// up somewhere else.
const NO_CARD_LABEL = "No card has been written for today yet.";

export function Today() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);
  const role = useAppSelector(authSelectors.selectRole);
  const isCoach = role === "coach";
  const isAthlete = role === "athlete";
  // Who the API answers a test_results write for (routes.tsx's own table:
  // create is coach or athlete, never a viewer). This screen shows the test
  // sheet only to the two roles who can use it for anything, the same rule
  // that keeps /tests off a viewer's nav.
  const canRecord = isCoach || isAthlete;

  const today = todayISODate();
  const dayCard = useAppSelector(selectDayByDate(today));
  const weekData = useAppSelector(selectWeek);
  const weekLoading = useAppSelector(week.selectors.selectIsLoading);
  const weekError = useAppSelector(week.selectors.selectError);

  const yearData = useAppSelector(programYear.selectors.selectData);

  // Fires once currentId resolves from null to a real id, and again only if
  // it or the role ever changes. A screen that asked again on every render
  // would hammer a server that takes seven seconds to wake.
  //
  // Every dispatch below is gated on who is signed in, not only on what
  // that role's half of the screen renders. A viewer who fired
  // fetchCoachEntries would get a 403 she can do nothing about, and an
  // error sitting in the store she never asked for; gating the fetch is
  // what actually keeps that from happening, since gating only the JSX
  // still lets the request go out.
  useEffect(() => {
    if (currentId === null) return;
    dispatch(week.actions.fetch(currentId));
    if (isCoach) {
      dispatch(journalActions.fetchCoachEntries());
      dispatch(drills.actions.fetch());
    }
    if (isAthlete) dispatch(journalActions.fetchAthleteEntries());
    if (canRecord) {
      dispatch(programYear.actions.fetch(currentId));
      dispatch(testResultsActions.fetchResults(currentId));
    }
  }, [dispatch, currentId, isCoach, isAthlete, canRecord]);

  function openDrill(slug: string) {
    navigate(`/glossary/${slug}`);
  }

  // Five states, and each says which one it is rather than showing nothing
  // (the same habit the Notes drill list keeps). In order: the year id
  // itself is not known yet; the week is on its way and has not answered
  // even once; the week asked and could not be reached; the week answered
  // and holds no card for today; a card is on screen.

  if (currentId === null) {
    return (
      <div className="today">
        <WaitingForYearId label={FINDING_YEAR_LABEL} />
      </div>
    );
  }

  if (weekData === null && weekLoading) {
    return (
      <div className="today">
        <Loading label={WAKING_LABEL} />
      </div>
    );
  }

  if (weekData === null && weekError) {
    return (
      <div className="today">
        <ErrorNote message={weekError} />
      </div>
    );
  }

  if (weekData === null) {
    // The id is known, nothing has loaded and nothing has failed: the
    // effect above has dispatched and the store has not caught up in this
    // render yet. Every screen here can be asked to render in that instant,
    // and the other screens' own fallback for it is the same `null`.
    return null;
  }

  // A window this falls inside, if any. yearData can arrive after this
  // screen already knows the week, so this is computed off whichever of the
  // two has answered rather than folded into the states above.
  const testDay = yearData
    ? testResultsSelectors.selectTestDayFor(yearData.test_dates, today)
    : null;

  return (
    <div className="today">
      <h1>Today</h1>
      <p className="today__date">{formatFullDate(today)}</p>

      {dayCard ? (
        <TodayCard key={dayCard.id} day={dayCard} onSelectDrill={openDrill} />
      ) : (
        <p className="today__no-card">
          {NO_CARD_LABEL} <Link to="/week">This Week</Link>
        </p>
      )}

      {isCoach && <CoachNoteForm programYearId={currentId} date={today} />}
      {isAthlete && <AthleteNoteForm programYearId={currentId} date={today} />}

      {canRecord && testDay && yearData && (
        <section className="today__tests">
          <h2>
            {testDay.testDate.label} test, day {testDay.dayNumber} of {testDay.dayCount}
          </h2>
          <TestSheet
            programYearId={currentId}
            window={testDay.testDate.window}
            measures={byPosition(yearData.battery.measures)}
          />
        </section>
      )}
    </div>
  );
}
