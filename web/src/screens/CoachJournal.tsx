import { useEffect, useState, type FormEvent } from "react";
import {
  authSelectors,
  drills,
  journalActions,
  journalSelectors,
  selectDrills,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { CoachEntry, DrillRatingValue, SaveCoachEntryPayload } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { todayISODate } from "../lib/scheduling";

// Same cold-Fly-machine wait as every other screen. This is the one he
// opens right after a session, often on his phone with one thumb, so a
// blank screen here reads as broken rather than slow.
const WAKING_LABEL = "Waking up the server. The journal can take a few seconds to load.";

// Shown while the year id itself is still unknown, the same gap Year,
// Month and This Week each cover (see Year.tsx's own comment on
// authSelectors.selectCurrentProgramYearId).
const FINDING_YEAR_LABEL = "Waking up the server. Finding this year can take a few seconds too.";

// The three values a rating can be, in the one order they are shown. Typed
// against DrillRatingValue, the type core actually saves against, so a
// change to that union (core/src/types.ts) is a compile error here rather
// than a control that quietly stops matching what the server accepts.
// This is the one place these three values are written down; nothing below
// spells one out a second time.
const RATING_VALUES: DrillRatingValue[] = ["not_yet", "getting", "owns"];

// A person-readable label built from the value itself rather than a second,
// hand-written phrase for each one. Writing "not yet, getting there, owns
// it" out as its own prose here would be the same rewording move CLAUDE.md
// and the bundle-privacy work already found and reverted once: the words a
// rating can be live in the array above, and only there.
function ratingLabel(value: DrillRatingValue): string {
  return value.replace(/_/g, " ");
}

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

interface FormState {
  note: string;
  overall: number | null;
  energy: number | null;
  flagPain: boolean;
  painNote: string;
  challengeNum: string;
  ratings: Record<string, DrillRatingValue>;
}

const BLANK_FORM: FormState = {
  note: "",
  overall: null,
  energy: null,
  flagPain: false,
  painNote: "",
  challengeNum: "",
  ratings: {},
};

// One place that turns a saved entry (or the lack of one) into what the
// form shows. `overall` and `energy` are carried through exactly as the
// entry has them, including null: a save can happen before either is
// scored, and reopening that entry must show it unscored again, not as a
// zero nobody chose.
function formFrom(entry: CoachEntry | null): FormState {
  if (!entry) return BLANK_FORM;
  return {
    note: entry.note ?? "",
    overall: entry.overall,
    energy: entry.energy,
    flagPain: entry.flag_pain,
    painNote: entry.pain_note ?? "",
    challengeNum: entry.challenge_num ?? "",
    ratings: entry.ratings,
  };
}

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
  const drillList = useAppSelector(selectDrills);

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
  const waitingToSend = !saving && queued;

  const [form, setForm] = useState<FormState>(() => formFrom(existingEntry));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [justDeleted, setJustDeleted] = useState(false);

  // Every coach entry in this slice is his own: CoachEntryPolicy::Scope is
  // `scope.kept.where(user_id: user.id)`, so there is no such thing here as
  // somebody else's entry to guard against, which is why this asks only
  // whether there is a saved entry at all and not who wrote it. Teddy never
  // reaches this screen (routes.tsx, roles ["coach"]), and if he typed the
  // URL the API would refuse him anyway.
  const entryId = existingEntry?.id ?? null;

  // Reopens the form for whichever date is on screen: the entry that date
  // already has, or a blank one when it has none. Runs again whenever the
  // stored entry for this date changes identity, which is what lets a fetch
  // that lands after a date was already picked fill the form in without a
  // second visit to it.
  useEffect(() => {
    setForm(formFrom(existingEntry));
    // An open question never survives the thing it was asking about. Change
    // the date, or watch the entry go, and the confirm closes rather than
    // sitting there pointed at something else.
    setConfirmingDelete(false);
  }, [date, existingEntry]);

  // Fires once currentId resolves from null to a real id, and again only if
  // it ever changes. A screen that asked again on every render would
  // hammer a server that takes seven seconds to wake.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(journalActions.fetchCoachEntries());
      dispatch(drills.actions.fetch());
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

  function updateRating(slug: string, value: DrillRatingValue) {
    setForm((prev) => ({ ...prev, ratings: { ...prev.ratings, [slug]: value } }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: SaveCoachEntryPayload = {
      // Guaranteed a real id, not just typed as one: this handler exists
      // only inside the return path below the currentId === null check
      // above, which is the one place null is ever possible here.
      programYearId: currentId as number,
      date,
      note: form.note.trim() === "" ? null : form.note,
      // Sent exactly as chosen, null included. A form that turned an
      // unscored box into 0 would save a score nobody gave, and reopening
      // this same day later would show a rating that was never made.
      overall: form.overall,
      energy: form.energy,
      flag_pain: form.flagPain,
      pain_note: form.flagPain && form.painNote.trim() !== "" ? form.painNote : null,
      challenge_num: form.challengeNum.trim() === "" ? null : form.challengeNum,
      ratings: form.ratings,
    };
    dispatch(journalActions.saveCoachEntry(payload));
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

      <form onSubmit={handleSubmit}>
        <label htmlFor="coach-journal-note">What did you see?</label>
        <textarea
          id="coach-journal-note"
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
        />

        <fieldset>
          <legend>How the session went overall</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="coach-journal-overall"
                value={n}
                checked={form.overall === n}
                onChange={() => setForm((prev) => ({ ...prev, overall: n }))}
              />
              {n}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Energy</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="coach-journal-energy"
                value={n}
                checked={form.energy === n}
                onChange={() => setForm((prev) => ({ ...prev, energy: n }))}
              />
              {n}
            </label>
          ))}
        </fieldset>

        <label htmlFor="coach-journal-pain">
          <input
            id="coach-journal-pain"
            type="checkbox"
            checked={form.flagPain}
            onChange={(event) => setForm((prev) => ({ ...prev, flagPain: event.target.checked }))}
          />
          Something hurt
        </label>

        {form.flagPain && (
          <>
            <label htmlFor="coach-journal-pain-note">What hurt, and where</label>
            <textarea
              id="coach-journal-pain-note"
              value={form.painNote}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, painNote: event.target.value }))
              }
            />
          </>
        )}

        <label htmlFor="coach-journal-challenge">Which challenge attempt this was</label>
        <input
          id="coach-journal-challenge"
          type="text"
          value={form.challengeNum}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, challengeNum: event.target.value }))
          }
        />

        {drillList.length > 0 && (
          <fieldset>
            <legend>Rate each drill</legend>
            {drillList.map((drill) => (
              <fieldset key={drill.slug}>
                <legend>{drill.name}</legend>
                {RATING_VALUES.map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`coach-journal-rating-${drill.slug}`}
                      value={value}
                      checked={form.ratings[drill.slug] === value}
                      onChange={() => updateRating(drill.slug, value)}
                    />
                    {ratingLabel(value)}
                  </label>
                ))}
              </fieldset>
            ))}
          </fieldset>
        )}

        {saving && <p role="status">Saving.</p>}
        {waitingToSend && (
          <p role="status">
            Waiting to send. It is saved on this phone and will go out once you have a
            connection.
          </p>
        )}

        <button type="submit" disabled={saving}>
          Save
        </button>
      </form>

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
