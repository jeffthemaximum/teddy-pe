import { useEffect, useState } from "react";
import {
  authSelectors,
  outboxSelectors,
  programYear,
  testResultsActions,
  testResultsSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { ProgramYearDetail, QueuedWrite, TestResult } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { byPosition } from "../lib/scheduling";

// He opens this standing on a court with a stopwatch in his other hand.
// Same cold-Fly-machine wait as every other screen, named for what is
// actually loading here.
const WAKING_LABEL = "Waking up the server. The test sheet can take a few seconds to load.";

// Shown while the current program year id is still unknown, the same gap
// Year, Month, This Week and the journal screens each cover the same way
// (see WaitingForYearId's own comment).
const FINDING_YEAR_LABEL = "Waking up the server. Finding this year can take a few seconds too.";

type Measure = ProgramYearDetail["battery"]["measures"][number];

// Whether a save for this exact measure, in this exact window, is still
// sitting in the outbox, waiting for a connection. testResults/SAVE_QUEUED
// clears the measure's saving flag the moment a write is off the app's
// hands and onto the outbox's, which looks identical to nothing having been
// typed at all unless something else says the write is still owed. The
// dedupeKey format core builds this under is not part of core's public
// surface, so this reads the one thing every result write actually carries
// on its own request body instead, the same way CoachJournal's own
// isQueuedFor reads a coach entry's session date.
function isQueuedFor(queue: QueuedWrite[], window: string, testId: string): boolean {
  return queue.some((write) => {
    const body = write.action.request.body as
      | { test_result?: { window?: string; test_id?: string } }
      | null;
    return body?.test_result?.window === window && body?.test_result?.test_id === testId;
  });
}

export function Tests() {
  const dispatch = useAppDispatch();

  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);

  const yearData = useAppSelector(programYear.selectors.selectData);
  const yearLoading = useAppSelector(programYear.selectors.selectIsLoading);
  const yearError = useAppSelector(programYear.selectors.selectError);

  const resultsError = useAppSelector(testResultsSelectors.selectTestResultsError);
  const queue = useAppSelector(outboxSelectors.selectQueue);

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
  const results = useAppSelector(testResultsSelectors.selectResultsForWindow(activeWindow));

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
        <p className="tests__empty">No measures have been set up yet.</p>
      ) : (
        <ul className="tests__measures" aria-label="Measures">
          {measures.map((measure) => (
            <MeasureRow
              // Keyed on the window too: switching windows is a clean
              // remount, so each box's own typing buffer always starts
              // from that window's own stored value, never the one he was
              // just looking at.
              key={`${activeWindow}-${measure.test_id}`}
              programYearId={programYearId}
              window={activeWindow}
              measure={measure}
              result={results[measure.test_id] ?? null}
              queue={queue}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MeasureRow({
  programYearId,
  window,
  measure,
  result,
  queue,
}: {
  programYearId: number;
  window: string;
  measure: Measure;
  result: TestResult | null;
  queue: QueuedWrite[];
}) {
  const dispatch = useAppDispatch();
  const saving = useAppSelector(testResultsSelectors.selectIsSaving(window, measure.test_id));
  const waitingToSend = !saving && isQueuedFor(queue, window, measure.test_id);

  // raw_value exactly as the server has it, never numeric_value: that field
  // is a string on the wire and never the thing to show or to compute on.
  // No result at all becomes an empty box, never a zero nobody measured.
  const storedValue = result?.raw_value ?? "";
  const [value, setValue] = useState(storedValue);

  // Resyncs this one box whenever what core actually has for it changes:
  // a result saved, a result cleared out from under it (the delete this
  // API answers a saved-empty value with), or the results themselves
  // arriving after this row already mounted. A window change remounts the
  // row entirely (see the key above), so this only ever has to reconcile
  // an in-place change, never a stale value left over from another window.
  useEffect(() => {
    setValue(storedValue);
  }, [storedValue]);

  const inputId = `tests-measure-${window}-${measure.test_id}`;

  function commit() {
    // Nothing was touched: a coach tabbing past a box he did not mean to
    // change must not fire a write, empty or otherwise.
    if (value === storedValue) return;
    dispatch(
      testResultsActions.saveResult({
        programYearId,
        window,
        testId: measure.test_id,
        // Sent exactly as typed. A range like "15 to 18" is a real thing to
        // type into a balance test; the server stores it and derives its
        // own number from it, and parsing it here first would either lose
        // it or disagree with the server about what it means.
        rawValue: value,
      }),
    );
  }

  return (
    <li className="tests__measure">
      <label htmlFor={inputId}>
        {measure.label} ({measure.unit})
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
      />
      {saving && <p role="status">Saving.</p>}
      {waitingToSend && (
        <p role="status">
          Waiting to send. It is saved on this phone and will go out once you have a
          connection.
        </p>
      )}
    </li>
  );
}
