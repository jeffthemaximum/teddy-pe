import { useEffect, useState } from "react";
import {
  authSelectors,
  drills,
  journalActions,
  journalSelectors,
  useAppDispatch,
  useAppSelector,
  week,
} from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { CoachNoteForm } from "../components/CoachNoteForm";
import { todayISODate } from "../lib/scheduling";

// Same cold-Fly-machine wait as every other screen. This is the one he
// opens right after a session, often on his phone with one thumb, so a
// blank screen here reads as broken rather than slow.
const WAKING_LABEL = "Waking up the server. The journal can take a few seconds to load.";

// Shown while the year id itself is still unknown, the same gap Year,
// Month and This Week each cover (see Year.tsx's own comment on
// authSelectors.selectCurrentProgramYearId).
const FINDING_YEAR_LABEL = "Waking up the server. Finding this year can take a few seconds too.";

// The delete, in the same two steps Teddy's screen uses. It is the same
// irreversible act and he taps it on a phone with one thumb straight after a
// session, so one pattern, asked once, in both places.
const DELETE_LABEL = "Delete this entry";
const DELETE_QUESTION = "Delete this entry?";
const DELETE_DETAIL =
  "It comes off the app and out of the next export. The row itself keeps every word.";
const DELETE_CONFIRM = "Yes, delete it";
const DELETE_CANCEL = "Keep it";
const DELETE_QUEUED_TEXT = "Deleted here. It will reach the server once you have a connection.";

export function CoachJournal() {
  const dispatch = useAppDispatch();

  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);

  // The rating controls need the drill list before this form can promise
  // anything real, so drills's own loaded-or-not state (a nullable object,
  // the same shape the week and the month payloads carry) is what decides
  // whether this screen has anything to show yet, the same way Year, Month
  // and This Week each read their own payload. The entries map has no such
  // state of its own: it starts empty and looks the same whether it has
  // been fetched once or never, so its loading flag and its error are
  // read below and shown inline instead, never as a reason to block the
  // whole screen.
  const drillsData = useAppSelector(drills.selectors.selectData);
  const drillsLoading = useAppSelector(drills.selectors.selectIsLoading);
  const drillsError = useAppSelector(drills.selectors.selectError);

  const entriesLoading = useAppSelector(journalSelectors.selectIsLoadingCoachEntries);
  const entriesError = useAppSelector(journalSelectors.selectJournalError);

  const [date, setDate] = useState(() => todayISODate());
  const existingEntry = useAppSelector(journalSelectors.selectCoachEntryFor(date));
  const saving = useAppSelector(journalSelectors.selectIsSaving(date));
  // Whether a write for this exact date is still sitting in the outbox.
  // SAVE_QUEUED clears the day's saving flag the moment a write is off the
  // app's hands and onto the outbox's, which looks identical to nothing
  // having been typed unless something says the write is still owed.
  //
  // This used to read the session date out of a queued write's request body.
  // A delete has no body at all (DELETE /api/v1/coach_entries/:id carries
  // nothing), so that reading said "nothing is queued" for exactly the write
  // a person most needs told about. core's own selector matches on the
  // dedupeKey every journal write carries, delete included, and asks in this
  // screen's language rather than making it build the key itself.
  const queued = useAppSelector(journalSelectors.selectIsEntryQueued("coach", date));

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [justDeleted, setJustDeleted] = useState(false);

  // Every coach entry in this slice is his own: CoachEntryPolicy::Scope is
  // `scope.kept.where(user_id: user.id)`, so there is no such thing here as
  // somebody else's entry to guard against, which is why this asks only
  // whether there is a saved entry at all and not who wrote it. Teddy never
  // reaches this screen (routes.tsx, roles ["coach"]), and if he typed the
  // URL the API would refuse him anyway.
  const entryId = existingEntry?.id ?? null;

  // An open question never survives the thing it was asking about. Change
  // the date, or watch the entry go, and the confirm closes rather than
  // sitting there pointed at something else.
  useEffect(() => {
    setConfirmingDelete(false);
  }, [date, existingEntry]);

  // Fires once currentId resolves from null to a real id, and again only if
  // it ever changes. A screen that asked again on every render would
  // hammer a server that takes seven seconds to wake.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(journalActions.fetchCoachEntries());
      dispatch(drills.actions.fetch());
      dispatch(week.actions.fetch(currentId));
    }
  }, [dispatch, currentId]);

  if (currentId === null) {
    return (
      <div className="coach-journal">
        <WaitingForYearId label={FINDING_YEAR_LABEL} />
      </div>
    );
  }

  if (!drillsData) {
    if (drillsError || entriesError) {
      return (
        <div className="coach-journal">
          <ErrorNote message={(drillsError ?? entriesError) as string} />
        </div>
      );
    }
    if (drillsLoading || entriesLoading) {
      return (
        <div className="coach-journal">
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

  function handleDelete() {
    // Addressed by id, the same as the athlete's: an entry that has only
    // ever been a queued write has no row to delete and shows no control.
    if (entryId === null) return;
    setJustDeleted(true);
    dispatch(journalActions.deleteEntry({ side: "coach", date, id: entryId }));
  }

  return (
    <div className="coach-journal">
      {entriesError && <ErrorNote message={entriesError} />}
      {entriesLoading && <Loading label={WAKING_LABEL} />}

      <h1>Coach&apos;s journal</h1>

      <label htmlFor="coach-journal-date">Session date</label>
      <input
        id="coach-journal-date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />

      <CoachNoteForm programYearId={currentId} date={date} />

      {/* Outside the form and last on the page, away from Save, and it asks
          before it acts. Same reasoning as the athlete screen's: one tap
          cannot be an accident when the tap that does the thing is a
          different button that did not exist a moment ago. */}
      {entryId !== null && (
        <section className="coach-journal__delete">
          {confirmingDelete ? (
            <>
              <p>{DELETE_QUESTION}</p>
              <p>{DELETE_DETAIL}</p>
              <button type="button" className="keep" onClick={() => setConfirmingDelete(false)}>
                {DELETE_CANCEL}
              </button>
              <button type="button" onClick={handleDelete} disabled={saving}>
                {DELETE_CONFIRM}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)}>
              {DELETE_LABEL}
            </button>
          )}
        </section>
      )}

      {justDeleted && existingEntry === null && queued && (
        <p role="status">{DELETE_QUEUED_TEXT}</p>
      )}
    </div>
  );
}
