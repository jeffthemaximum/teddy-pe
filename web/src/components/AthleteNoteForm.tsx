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

  // Reopens the form for whichever date is on screen: the entry that date
  // already has, or a blank one when it has none. Runs again whenever the
  // stored entry for this date changes identity, which is what lets a
  // fetch or a delete that lands after this form mounted fill it in, or
  // clear it, without a second visit to the screen.
  useEffect(() => {
    const next = formFrom(existingEntry);
    setForm(next);
    // Reset together with the form. A date change or an entry arriving
    // from the server makes whatever was last sent irrelevant to what is
    // now on screen, and a stale ref here would suppress the first real
    // edit.
    sentRef.current = next;
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
