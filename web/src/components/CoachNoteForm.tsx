import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  journalActions,
  journalSelectors,
  selectDayByDate,
  selectDrills,
  selectWeek,
  useAppDispatch,
  useAppSelector,
  week,
} from "@teddy-pe/core";
import type { CoachEntry, Drill, DrillRatingValue } from "@teddy-pe/core";
import { SaveStatus } from "./SaveStatus";

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

// What the rating fieldset says in each of the three cases where it has no
// day card to narrow itself by. He is writing up a session, so the list
// should be the drills that session actually ran; when it cannot be, the
// screen says which of the three reasons it is rather than quietly handing
// him all 84.
const FINDING_DRILLS_LABEL = "Finding this day's drills.";
const NO_DRILLS_LABEL = "This day's card lists no drills.";
const OUTSIDE_WEEK_LABEL = "This date is outside this week, so every drill is listed.";
const NO_WEEK_LABEL = "This week could not be reached, so every drill is listed.";

// The Challenge of the Week, shown beside the number he records for it.
// CLAUDE.md has one challenge a week, attempted early and late, and the
// week payload carries the whole sentence: what it is, how it is scored and
// when the two attempts fall. Reading it off the week means this screen
// never restates a program rule it would then own a second copy of.
const CHALLENGE_HEADING = "Challenge of the Week";

// What the field actually stores is the number he got, which is why week 1
// reads "count the silent ones. Monday number, Friday number" and why
// docs_exporter writes it out as "Challenge number". The label asked which
// attempt it was until 14 September 2026, which is a different question.
const CHALLENGE_NUMBER_LABEL = "Challenge number";

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

// Folds a stored entry into a form that is already on screen, one field at
// a time. A field is taken from the entry only where what is on screen still
// matches what was last sent: nobody has touched that one since, so the
// store holds the better copy of it. A field that has moved on from what was
// sent is one he is typing in right now, so it is left exactly as it is, and
// `sent` keeps its old value for it so the next blur still recognizes it as
// changed and saves it.
//
// The seven `take` calls are the whole of FormState. An eighth field added
// above needs an eighth line here, and a keyed loop is not the way to avoid
// that: the fields have different types and a loop over `keyof FormState`
// widens all of them to their union, which is how `overall` would become
// assignable a ratings map.
//
// `ratings` compares by reference, which is right rather than a shortcut:
// it only ever changes through `set`, which writes the same new object into
// both the form and the ref in one go, so the two hold the identical object
// unless something else replaced one of them.
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
  take("note");
  take("overall");
  take("energy");
  take("flagPain");
  take("painNote");
  take("challengeNum");
  take("ratings");
  return [nextForm, nextSent];
}

export function CoachNoteForm({
  programYearId,
  date,
}: {
  programYearId: number;
  date: string;
}) {
  const dispatch = useAppDispatch();

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

  const drillList = useAppSelector(selectDrills);

  // The current week, read for one thing only: which drills the day he is
  // writing up actually ran. He picks a date and rates what happened, so
  // handing him the whole 84-entry glossary makes him find eight of them.
  // This is the same duck This Week fills, so arriving here from that tab
  // costs nothing.
  //
  // Only `weeks/current` exists (routes.rb), so a date outside this week has
  // no card to narrow by, and neither does a week that has not arrived or
  // could not be reached. Those three cases are told apart below rather than
  // collapsed into one silent fallback.
  const weekData = useAppSelector(selectWeek);
  const weekError = useAppSelector(week.selectors.selectError);
  const dayCard = useAppSelector(selectDayByDate(date));

  const [form, setForm] = useState<FormState>(() => formFrom(existingEntry));

  // What was last sent, so a text field can tell an edit from a field he
  // walked through. The same guard MeasureRow.commit already uses on the
  // test sheet's boxes, kept in a ref rather than in state because changing
  // it must not re-render: it is a record of what happened, never something
  // the form displays.
  const sentRef = useRef<FormState>(form);

  // The date this effect last ran for, and whether there was an entry then.
  // Refs for the same reason sentRef is one: a record of the last run, never
  // something the form displays.
  const lastDateRef = useRef(date);
  const hadEntryRef = useRef(existingEntry !== null);

  // Opens the form on whichever date is on screen, and folds an entry in
  // when one arrives, WITHOUT overwriting a field he is in the middle of.
  //
  // This used to reset every field from the store whenever `existingEntry`
  // changed identity. Under autosave that loses words: every save response
  // folds a NEW entry object into the slice, so an energy tap's own answer,
  // landing a second later, reset the note he had typed since and it was
  // gone. Do not simplify this back.
  //
  // Three cases, told apart rather than collapsed into one reset:
  //   a different date: replace the form whole. That is a different
  //     session, not news about this one.
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

  function commit(next: FormState) {
    sentRef.current = next;
    dispatch(
      journalActions.saveCoachEntry({
        programYearId,
        date,
        note: next.note.trim() === "" ? null : next.note,
        // Sent exactly as chosen, null included. A form that turned an
        // unscored box into 0 would save a score nobody gave, and reopening
        // this same day later would show a rating that was never made.
        overall: next.overall,
        energy: next.energy,
        flag_pain: next.flagPain,
        pain_note: next.flagPain && next.painNote.trim() !== "" ? next.painNote : null,
        challenge_num: next.challengeNum.trim() === "" ? null : next.challengeNum,
        ratings: next.ratings,
      }),
    );
  }

  // For a text field: save on blur, and only when the text actually moved.
  function commitIfChanged(field: "note" | "painNote" | "challengeNum") {
    if (form[field] === sentRef.current[field]) return;
    commit(form);
  }

  // For a radio, a checkbox or a rating: the tap is the decision, so it goes
  // straight out. Every save sends the whole entry, so `next` is built first
  // and both set and sent, rather than setting state and sending a `form`
  // this render still has the old value of.
  function set(next: FormState) {
    setForm(next);
    commit(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Unconditional, on purpose. Autosave covers the ordinary case and
    // cannot cover the failed one: a write the outbox gave up on does not go
    // again until a field is touched. This button is that retry, which is
    // why it does not check whether anything changed first.
    commit(form);
  }

  function updateRating(slug: string, value: DrillRatingValue) {
    set({ ...form, ratings: { ...form.ratings, [slug]: value } });
  }

  // Whether the week is still on its way. A failed fetch is not pending: it
  // has answered, badly, and the fieldset says so rather than waiting for a
  // week that is not coming.
  const weekPending = weekData === null && weekError === null;

  // The drills this day's card ran, in the order it ran them, followed by
  // anything the entry already carries a rating for. That tail is not a
  // nicety: handleSubmit sends `form.ratings` whole, so a rating made
  // before a plan edit dropped the drill from the card would go on being
  // saved on every save while never appearing on screen. Shown, it can be
  // changed or seen for what it is.
  //
  // Null, not an empty array, when there is no card to narrow by. An empty
  // card (Game Day: the home program is off) and no card at all are
  // different things and say different things below.
  const bySlug = new Map(drillList.map((d) => [d.slug, d]));
  const cardSlugs = dayCard?.drill_slugs ?? null;
  const dayDrills: Drill[] | null =
    cardSlugs === null
      ? null
      : [...cardSlugs, ...Object.keys(form.ratings).filter((slug) => !cardSlugs.includes(slug))]
          .map((slug) => bySlug.get(slug))
          .filter((d): d is Drill => d !== undefined);
  const shownDrills = dayDrills ?? drillList;

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="coach-journal-note">What did you see?</label>
      <textarea
        id="coach-journal-note"
        value={form.note}
        onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
        onBlur={() => commitIfChanged("note")}
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
              onChange={() => set({ ...form, overall: n })}
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
              onChange={() => set({ ...form, energy: n })}
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
          onChange={(event) => set({ ...form, flagPain: event.target.checked })}
        />
        Something hurt
      </label>

      {form.flagPain && (
        <>
          <label htmlFor="coach-journal-pain-note">What hurt, and where</label>
          <textarea
            id="coach-journal-pain-note"
            value={form.painNote}
            onChange={(event) => setForm((prev) => ({ ...prev, painNote: event.target.value }))}
            onBlur={() => commitIfChanged("painNote")}
          />
        </>
      )}

      {/* Gated on the day card rather than on the week having loaded. The
          payload only ever holds the current week, so a date outside it
          would be shown this week's challenge beside a session that ran
          under a different one. Nothing is said in its place: the drill
          fieldset just below already explains that the date is outside
          this week, and saying it twice on one screen is noise. */}
      {dayCard && weekData && (
        <div className="coach-journal__challenge">
          <p className="coach-journal__challenge-heading">{CHALLENGE_HEADING}</p>
          <p>{weekData.challenge}</p>
        </div>
      )}

      <label htmlFor="coach-journal-challenge">{CHALLENGE_NUMBER_LABEL}</label>
      <input
        id="coach-journal-challenge"
        type="text"
        value={form.challengeNum}
        onChange={(event) => setForm((prev) => ({ ...prev, challengeNum: event.target.value }))}
        onBlur={() => commitIfChanged("challengeNum")}
      />

      {drillList.length > 0 && (
        <fieldset>
          <legend>Rate each drill</legend>
          {weekPending ? (
            <p role="status">{FINDING_DRILLS_LABEL}</p>
          ) : (
            <>
              {dayDrills === null && <p>{weekError ? NO_WEEK_LABEL : OUTSIDE_WEEK_LABEL}</p>}
              {dayDrills !== null && dayDrills.length === 0 && <p>{NO_DRILLS_LABEL}</p>}
              {shownDrills.map((drill) => (
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
            </>
          )}
        </fieldset>
      )}

      <SaveStatus saving={saving} queued={queued} savedAt={existingEntry?.updated_at ?? null} />

      <button type="submit" disabled={saving}>
        Save
      </button>
    </form>
  );
}
