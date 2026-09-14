import { useEffect, useState } from "react";
import {
  outboxSelectors,
  testResultsActions,
  testResultsSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { ProgramYearDetail, QueuedWrite, TestResult } from "@teddy-pe/core";

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

// The rows of one test window. It takes the window it is showing and reads
// everything else itself, so a caller needs to know only which window it
// wants: the Tests tab passes whichever one the picker is on, and Today
// passes the one today falls inside.
// What a caller says in place of this component when the battery has no
// measures on it yet. It lives here rather than in either screen because
// both screens show it, and two copies of one sentence is how they come to
// disagree about what an empty sheet means.
export const NO_MEASURES_LABEL = "No measures have been set up yet.";

export function TestSheet({
  programYearId,
  window,
  measures,
}: {
  programYearId: number;
  window: string;
  measures: Measure[];
}) {
  const results = useAppSelector(testResultsSelectors.selectResultsForWindow(window));
  const queue = useAppSelector(outboxSelectors.selectQueue);

  // Counted off the store, never off the boxes. A number typed and not yet
  // blurred has not been saved, and telling him it had would be the one
  // lie this screen must not tell.
  const blank = measures.filter((m) => !results[m.test_id]).length;

  return (
    <>
      <ul className="tests__measures" aria-label="Measures">
        {measures.map((measure) => (
          <MeasureRow
            // Keyed on the window too: switching windows is a clean
            // remount, so each box's own typing buffer always starts
            // from that window's own stored value, never the one he was
            // just looking at.
            key={`${window}-${measure.test_id}`}
            programYearId={programYearId}
            window={window}
            measure={measure}
            result={results[measure.test_id] ?? null}
            queue={queue}
          />
        ))}
      </ul>
      {blank > 0 && <p className="tests__blank-count">{blank} still blank</p>}
    </>
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
        // Not "decimal": that keypad has no space and no letters, and "15
        // to 18" is a real value this box has to accept (see the comment
        // on rawValue above). A numeric pad would be faster for the common
        // case of typing "4.42" on a phone, so this costs him a couple of
        // extra taps to reach the number row for a plain number, in trade
        // for being able to type the range at all.
        inputMode="text"
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
