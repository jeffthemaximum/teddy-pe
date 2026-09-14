import { useEffect, useState } from "react";
import {
  authSelectors,
  programYear,
  testResultsActions,
  testResultsSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { NO_MEASURES_LABEL, TestSheet } from "../components/TestSheet";
import { byPosition } from "../lib/scheduling";

// He opens this standing on a court with a stopwatch in his other hand.
// Same cold-Fly-machine wait as every other screen, named for what is
// actually loading here.
const WAKING_LABEL = "Waking up the server. The test sheet can take a few seconds to load.";

// Shown while the current program year id is still unknown, the same gap
// Year, Month, This Week and the journal screens each cover the same way
// (see WaitingForYearId's own comment).
const FINDING_YEAR_LABEL = "Waking up the server. Finding this year can take a few seconds too.";

export function Tests() {
  const dispatch = useAppDispatch();

  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);

  const yearData = useAppSelector(programYear.selectors.selectData);
  const yearLoading = useAppSelector(programYear.selectors.selectIsLoading);
  const yearError = useAppSelector(programYear.selectors.selectError);

  const resultsError = useAppSelector(testResultsSelectors.selectTestResultsError);

  // null until he picks a window himself. Nothing here needs an effect to
  // land on the right one first: selectDefaultWindow is a pure function of
  // the test dates and the clock, computed straight into the render below,
  // so the very first frame that has test dates already has the right
  // window chosen, before he has touched anything.
  const [pickedWindow, setPickedWindow] = useState<string | null>(null);

  // Computed every render rather than behind the early returns below: every
  // hook on this screen, this selector included, has to run in the same
  // order on every render, so it reads a safe "" window (selecting nothing
  // that has been fetched yet) rather than skip itself while the year is
  // still loading.
  const defaultWindow = yearData
    ? testResultsSelectors.selectDefaultWindow(yearData.test_dates, new Date())
    : null;
  const activeWindow = pickedWindow ?? defaultWindow ?? "";

  // Fires once currentId resolves from null to a real id, and again only if
  // it ever changes. A screen that asked again on every render would
  // hammer a server that takes seven seconds to wake, and a coach mid-test
  // battery is exactly who that would hurt.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(programYear.actions.fetch(currentId));
      dispatch(testResultsActions.fetchResults(currentId));
    }
  }, [dispatch, currentId]);

  if (currentId === null) {
    return (
      <div className="tests">
        <WaitingForYearId label={FINDING_YEAR_LABEL} />
      </div>
    );
  }

  if (!yearData) {
    if (yearError || resultsError) {
      return (
        <div className="tests">
          <ErrorNote message={(yearError ?? resultsError) as string} />
        </div>
      );
    }
    if (yearLoading) {
      return (
        <div className="tests">
          <Loading label={WAKING_LABEL} />
        </div>
      );
    }
    // The id is known, nothing has loaded and nothing has failed: the
    // fetches above have been dispatched but the store has not caught up
    // in this render yet. Every screen can be asked to render before its
    // own data arrives.
    return null;
  }

  const programYearId = currentId;
  const testDates = byPosition(yearData.test_dates);
  const measures = byPosition(yearData.battery.measures);

  return (
    <div className="tests">
      {yearLoading && <Loading label={WAKING_LABEL} />}
      {(yearError || resultsError) && <ErrorNote message={(yearError ?? resultsError) as string} />}

      <h1>Test sheet</h1>

      {testDates.length === 0 ? (
        <p className="tests__empty">No test dates have been set up yet.</p>
      ) : (
        <>
          <label htmlFor="tests-window">Test date</label>
          <select
            id="tests-window"
            value={activeWindow}
            onChange={(event) => setPickedWindow(event.target.value)}
          >
            {testDates.map((testDate) => (
              <option key={testDate.id} value={testDate.window}>
                {testDate.label} ({testDate.display})
              </option>
            ))}
          </select>
        </>
      )}

      {measures.length === 0 ? (
        <p className="tests__empty">{NO_MEASURES_LABEL}</p>
      ) : (
        <TestSheet programYearId={programYearId} window={activeWindow} measures={measures} />
      )}
    </div>
  );
}
