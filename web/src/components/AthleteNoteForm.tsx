import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  journalActions,
  journalSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { AthleteEntry, SaveAthleteEntryPayload } from "@teddy-pe/core";
import { SaveStatus } from "./SaveStatus";

const FELT_VALUES = [1, 2, 3, 4, 5];

// The two states the toggle can be in, in his own words rather than the
// column name. "Only you can see this" is what a 7-year-old reads; "shared"
// or "unshared" is not.
const PRIVATE_TEXT = "Only you can see this.";
const SHARED_TEXT = "Dad can see this too.";

// Teddy's own words for the offline case, in his language rather than his
// dad's. SaveStatus's own default line ("Waiting to send...") is written
// for Jeff; this is what this screen has always said, moved here verbatim
// rather than reworded on the way.
const WAITING_TEXT = "This is saved on your device and will send once you're back online.";

interface FormState {
  felt: number | null;
  best: string;
  hard: string;
  note: string;
}

const BLANK_FORM: FormState = { felt: null, best: "", hard: "", note: "" };

// One place that turns a saved entry (or the lack of one) into what the
// form shows. `felt` is carried through exactly as the entry has it,
// including null: he can save a day before rating how it felt, and
// reopening that day must show it unrated again, not as a number he never
// picked.
function formFrom(entry: AthleteEntry | null): FormState {
  if (!entry) return BLANK_FORM;
  return {
    felt: entry.felt,
    best: entry.best ?? "",
    hard: entry.hard ?? "",
    note: entry.note ?? "",
  };
}

// Folds a stored entry into a form that is already on screen, one field at
// a time. A field is taken from the entry only where what is on screen still
// matches what was last sent: nobody has touched that one since, so the
// store holds the better copy of it. A field that has moved on from what was
// sent is one he is typing in right now, so it is left exactly as it is, and
// `sent` keeps its old value for it so the next blur still recognizes it as
// changed and saves it.
//
// The four `take` calls are the whole of FormState. A fifth field added
// above needs a fifth line here, and a keyed loop is not the way to avoid
// that: the fields have different types and a loop over `keyof FormState`
// widens all of them to their union, which is how `felt` would become
// assignable a string.
function foldIn(
  current: FormState,
  sent: FormState,
  incoming: FormState,
): [FormState, FormState] {
  const nextForm = { ...current };
  const nextSent = { ...sent };
  function take<K extends keyof FormState>(key: K) {
    if (current[key] !== sent[key]) return;
    nextForm[key] = incoming[key];
    nextSent[key] = incoming[key];
  }
  take("felt");
  take("best");
  take("hard");
  take("note");
  return [nextForm, nextSent];
}

export function AthleteNoteForm({
  programYearId,
  date,
}: {
  programYearId: number;
  date: string;
}) {
  const dispatch = useAppDispatch();

  const existingEntry = useAppSelector(journalSelectors.selectAthleteEntryFor(date));
  const saving = useAppSelector(journalSelectors.selectIsSaving(date));
  // Whether a write for this exact date is still sitting in the outbox. See
  // CoachNoteForm's identical selector for why this reads core's own
  // dedupeKey match rather than the queued write's request body: a delete
  // has no body to read a date out of.
  const queued = useAppSelector(journalSelectors.selectIsEntryQueued("athlete", date));

  const [form, setForm] = useState<FormState>(() => formFrom(existingEntry));

  // What was last sent, so a text field can tell an edit from a field he
  // walked through. Kept in a ref rather than in state because changing it
  // must not re-render: it is a record of what happened, never something
  // the form displays. The same shape CoachNoteForm uses.
  const sentRef = useRef<FormState>(form);

  // The date this effect last ran for, and whether there was an entry then.
  // Refs for the same reason sentRef is one: a record of the last run, never
  // something the form displays.
  const lastDateRef = useRef(date);
  const hadEntryRef = useRef(existingEntry !== null);

  // Opens the form on whichever date is on screen, and folds an entry in
  // when one arrives, WITHOUT overwriting a box he is in the middle of.
  //
  // This used to reset every field from the store whenever `existingEntry`
  // changed identity. Under autosave that loses words, and it is the one
  // guard the screen this form was extracted from carried and said so:
  // every save response folds a NEW entry object into the slice, so a felt
  // tap's own answer, landing a second later, reset the sentence he had
  // typed since and it was gone. Do not simplify this back.
  //
  // Three cases, told apart rather than collapsed into one reset:
  //   a different date: replace the form whole. That is a different day,
  //     not news about this one.
  //   the entry going away (a delete): replace the form whole. The row is
  //     gone, which is not something to merge into what is on screen.
  //   anything else (a fetch answering, or a save coming back): fold field
  //     by field, per foldIn above.
  //
  // `form` is read out of the render this effect was built in, and is
  // deliberately not a dependency: this runs when the date or the stored
  // entry changes, never on a keystroke.
  useEffect(() => {
    const replaced =
      lastDateRef.current !== date || (hadEntryRef.current && existingEntry === null);
    lastDateRef.current = date;
    hadEntryRef.current = existingEntry !== null;

    const incoming = formFrom(existingEntry);
    if (replaced) {
      setForm(incoming);
      // Whatever was last sent belongs to the day, or the row, that just
      // left the screen. A stale ref here would suppress the first real
      // edit of what replaced it.
      sentRef.current = incoming;
      return;
    }

    const [nextForm, nextSent] = foldIn(form, sentRef.current, incoming);
    setForm(nextForm);
    sentRef.current = nextSent;
  }, [date, existingEntry]);

  const shared = existingEntry?.shared ?? false;

  function commit(next: FormState) {
    sentRef.current = next;
    // SaveAthleteEntryPayload carries all seven fields, and core's own
    // request builder (athleteRequest in ducks/journal/actions.ts) sends
    // every one of them on to the server.
    const payload: SaveAthleteEntryPayload = {
      programYearId,
      date,
      note: next.note,
      shared,
      felt: next.felt,
      best: next.best.length === 0 ? null : next.best,
      hard: next.hard.length === 0 ? null : next.hard,
    };
    dispatch(journalActions.saveAthleteEntry(payload));
  }

  // For a text field: save on blur, and only when the text actually moved.
  function commitIfChanged(field: "best" | "hard" | "note") {
    if (form[field] === sentRef.current[field]) return;
    commit(form);
  }

  // For the felt buttons: the tap is the decision, so it goes straight out.
  // Every save sends the whole entry, so `next` is built first and both set
  // and sent, rather than setting state and sending a `form` this render
  // still has the old value of.
  function set(next: FormState) {
    setForm(next);
    commit(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Unconditional, on purpose, for the same reason as CoachNoteForm's own
    // Save: autosave cannot cover a write the outbox gave up on, so this
    // button is the retry and does not check whether anything changed.
    commit(form);
  }

  function handleToggleShared() {
    // Its own action, not folded into a whole-entry save. Sharing is
    // Teddy's one control over who reads his words, and it must not ride
    // along on a save that could also carry a field he has not decided
    // about yet.
    dispatch(journalActions.setShared({ programYearId, date, shared: !shared }));
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset>
        <legend>How did today feel? 1 is rough, 5 is great.</legend>
        {FELT_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={form.felt === value}
            onClick={() => set({ ...form, felt: value })}
          >
            {value}
          </button>
        ))}
      </fieldset>

      <label>
        What went best today?
        <input
          type="text"
          value={form.best}
          onChange={(event) => setForm((prev) => ({ ...prev, best: event.target.value }))}
          onBlur={() => commitIfChanged("best")}
        />
      </label>

      <label>
        What was hard today?
        <input
          type="text"
          value={form.hard}
          onChange={(event) => setForm((prev) => ({ ...prev, hard: event.target.value }))}
          onBlur={() => commitIfChanged("hard")}
        />
      </label>

      <label>
        Tell me about today.
        <textarea
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          onBlur={() => commitIfChanged("note")}
        />
      </label>

      <p className="athlete-journal__shared-state">{shared ? SHARED_TEXT : PRIVATE_TEXT}</p>
      <button type="button" onClick={handleToggleShared}>
        {shared ? "Keep this to yourself" : "Let Dad see this"}
      </button>

      <SaveStatus
        saving={saving}
        queued={queued}
        savedAt={existingEntry?.updated_at ?? null}
        waitingText={WAITING_TEXT}
      />

      <button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
