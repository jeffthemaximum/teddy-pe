import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  authSelectors,
  journalActions,
  journalSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";
import { WaitingForYearId } from "../components/WaitingForYearId";
import { todayISODate } from "../lib/scheduling";

// Same cold-Fly-machine wait as every other screen: 6.6 to 7.6 seconds.
const WAKING_LABEL = "Waking up the server. Opening today can take a few seconds.";

// Shown while the current program year id is still unknown, the same gap
// Year.tsx, Month.tsx and ThisWeek.tsx all cover the same way (see their own
// comments on authSelectors.selectCurrentProgramYearId).
const FINDING_YEAR_LABEL = "Waking up the server. Finding today can take a few seconds too.";

const FELT_VALUES = [1, 2, 3, 4, 5];

// The two states the toggle can be in, in his own words rather than the
// column name. "Only you can see this" is what a 7-year-old reads; "shared"
// or "unshared" is not.
const PRIVATE_TEXT = "Only you can see this.";
const SHARED_TEXT = "Dad can see this too.";

// The delete, in his words and honest about what it does. It takes the entry
// off this screen and out of everything the app shows; the row itself keeps
// every word, and getting one back is something Dad does at a console. So
// the second line is a true thing a 7-year-old can act on, not a softener.
const DELETE_LABEL = "Delete today";
const DELETE_QUESTION = "Delete what you wrote today?";
const DELETE_DETAIL = "It goes off this page for good. Dad can get it back if you ask him.";
const DELETE_CONFIRM = "Yes, delete it";
const DELETE_CANCEL = "Keep it";
const DELETE_QUEUED_TEXT = "Deleted here. It will tell the server once you're back online.";
// What a deleted day says instead of the form. A day he deleted is not the
// same as a day he has not written in yet, and showing him the empty boxes
// for both would be the app quietly forgetting he asked. The second line is
// the promise the toggle would otherwise break, said out loud: there is
// nothing here for Dad to see, and nothing to share.
const DELETE_QUEUED_DETAIL =
  "Today is off this page and Dad cannot see it. Once it sends you can write about today again.";

// ---- What Jeff reads, on the same route --------------------------------
//
// `/journal` is open to him on purpose (routes.tsx): `athlete_entries#index`
// answers him 200 and hands him whatever his son has shared. `create` and
// the destroy policy are athlete-only, so every write control on this page
// would 403 for him, and one of them is a button reading "Let Dad see this"
// shown to Dad. routes.tsx says keeping the controls off his screen belongs
// here rather than to the route table. This is that.

// Whose page this is. He has his own journal one tab away and the two tabs
// read "Journal" and "Notes", so nothing but this heading tells him which of
// the two he is looking at.
//
// The name arrives from /api/v1/me at runtime and is never written down in
// this file. A child's name typed into a heading is shipped in the bundle to
// everyone who loads the site, which is the rule __tests__/bundle-privacy
// .test.ts keeps. The fallback covers a session that has no athlete on it.
const COACH_TITLE_FALLBACK = "Your athlete's journal";
function coachTitle(name: string | undefined): string {
  return name ? `${name}'s journal` : COACH_TITLE_FALLBACK;
}

// Rendered on every one of his visits, with an entry and without one, and
// that is the whole reason it is worded as a standing fact about the page
// rather than a remark about today. Shown only when a day is empty, its
// presence would itself be a signal.
const COACH_SUBTITLE = "Today. You see the days he chooses to share with you.";

// What an empty day says to him, and it says the same thing whether Teddy
// wrote nothing or wrote something and kept it to himself. The API is
// already careful not to tell him which: the Pundit scope hands him the
// shared rows and no others, so both cases arrive as the same silence. A
// screen offering "nothing shared today" beside "nothing written today"
// would hand back from the client exactly the fact the toggle exists to
// keep, so there is one message and one branch.
const COACH_NOTHING = "Nothing here for today.";

// A box Teddy left empty inside a day he did share. No privacy question in
// this one: an entry is shared or it is not, field by field is not a thing
// the switch can do, so this is only about the rows keeping their shape.
const COACH_BLANK_FIELD = "He left this one empty.";

// His own four questions, read back as labels rather than asked again. "What
// went best today?" is addressed to the boy writing it; Jeff is reading.
const COACH_FELT_LABEL = "How today felt";
const COACH_BEST_LABEL = "What went best";
const COACH_HARD_LABEL = "What was hard";
const COACH_NOTE_LABEL = "About today";

export function AthleteJournal() {
  const dispatch = useAppDispatch();
  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);
  const today = todayISODate();

  const entry = useAppSelector(journalSelectors.selectAthleteEntryFor(today));
  // Whose hands this is in. The screen is open to Jeff as well (routes.tsx:
  // /journal is roles ["coach", "athlete"]), and what he sees is whatever
  // Teddy has shared, so the entry on screen is not always the signed-in
  // person's. He gets a different page below: everything that writes here
  // answers 403 for him at the API, and the whole point of the delete and
  // the share toggle is that they are his son's to press.
  const role = useAppSelector(authSelectors.selectRole);
  // The athlete this app is about, from /api/v1/me. For Jeff this is his
  // son, because the API falls back to the only athlete on record when the
  // signed-in user is not one; it is what already gives him a program year.
  const athlete = useAppSelector(authSelectors.selectAthlete);
  const queued = useAppSelector(journalSelectors.selectIsEntryQueued("athlete", today));
  // Whether today was deleted with no signal and has not been written again
  // since. It is a different question from `queued`, and the difference is
  // the whole of the fix: a queued delete and a queued save both leave the
  // slice with no entry for today and a write pending, so from here they
  // look identical. With no entry, `shared` below reads as false and the
  // toggle offers to show Dad a day that is not there any more, which is
  // exactly what he tapped, and the save it fired queued behind the delete.
  const deleteQueued = useAppSelector(journalSelectors.selectIsDeleteQueued("athlete", today));
  const loading = useAppSelector(journalSelectors.selectIsLoadingAthleteEntries);
  const error = useAppSelector(journalSelectors.selectJournalError);
  const saving = useAppSelector(journalSelectors.selectIsSaving(today));

  // Fires once currentId resolves from null to a real id, and again only if
  // it ever changes, the same shape as ThisWeek's own mount effect.
  useEffect(() => {
    if (currentId !== null) {
      dispatch(journalActions.fetchAthleteEntries());
    }
  }, [dispatch, currentId]);

  // Local, editable copies of what he is writing. Hydrated exactly once,
  // the instant there is something to copy in or, failing that, the moment
  // the fetch has actually finished and there is genuinely nothing: never
  // re-synced after that, because a fetch or a save landing later must not
  // overwrite a letter he is mid-way through typing.
  const hydratedRef = useRef(false);
  const wasLoadingRef = useRef(loading);
  const [hydrated, setHydrated] = useState(false);
  const [felt, setFelt] = useState<number | null>(null);
  const [best, setBest] = useState("");
  const [hard, setHard] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!hydratedRef.current) {
      // A fetch that finished by failing is not "there is genuinely
      // nothing": it is not known yet, and stays not known until a fetch
      // actually succeeds, so the pre-hydration branch below (which shows
      // the API's own error) keeps showing rather than a form quietly
      // claiming an empty day.
      const justFinishedCleanly = wasLoadingRef.current && !loading && error === null;
      if (entry !== null || justFinishedCleanly) {
        hydratedRef.current = true;
        setHydrated(true);
        setFelt(entry?.felt ?? null);
        setBest(entry?.best ?? "");
        setHard(entry?.hard ?? "");
        setNote(entry?.note ?? "");
      }
    }
    wasLoadingRef.current = loading;
  }, [entry, loading, error]);

  // The delete asks first, and this is what it is waiting on. Two taps, not
  // one, and the second one is a different button in a different place from
  // the first, so the gesture that deletes cannot be the gesture that opened
  // the question.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // When the entry he was looking at goes away, the form goes back to blank.
  // Tied to the entry actually leaving state rather than to the tap, so a
  // delete the server refuses leaves his words on screen: the hydration
  // effect above runs once and will never put them back.
  const hadEntryRef = useRef(entry !== null);
  useEffect(() => {
    if (hadEntryRef.current && entry === null) {
      setFelt(null);
      setBest("");
      setHard("");
      setNote("");
      setConfirmingDelete(false);
    }
    hadEntryRef.current = entry !== null;
  }, [entry]);

  // Whether the last save is sitting in the outbox rather than actually gone
  // to the server. This used to be guessed: `saving` clearing with the entry
  // unchanged looked like a queued write, but it is really only a check that
  // nothing changed. A save the server rejects for good changes nothing
  // either, so a write that had just been thrown away told Teddy his words
  // were safe on the device with the outbox empty. core's own selector knows
  // for certain, and CoachJournal was moved onto it this phase; this is the
  // same line, in the same shape.
  const waitingToSend = !saving && queued;

  if (currentId === null) {
    return <WaitingForYearId label={FINDING_YEAR_LABEL} />;
  }

  // Jeff's half of this route: a page to read, with nothing on it to press.
  // It comes before every branch below because none of them are his. The
  // form, Save, the share toggle and the delete all 403 for him, and the
  // deleted-day notice below is about a write he cannot have made, since the
  // outbox only ever shows a person their own.
  //
  // Written as "anyone who is not the athlete reads" rather than "the coach
  // reads", so the safe page is the default one. `athlete_entries#create` is
  // athlete-only, and the route table is what keeps everyone but Jeff and
  // Teddy off this screen at all; if that ever slipped, the wrong person
  // would land on a page with nothing to press rather than on a form.
  if (role !== "athlete") {
    if (!hydrated) {
      if (loading) return <Loading label={WAKING_LABEL} />;
      if (error) return <ErrorNote message={error} />;
      return null;
    }
    // What he may see, which is not simply what the slice is holding. The
    // Pundit scope already drops an unshared entry before it ever reaches
    // him, and this agrees with it from the other end, because the scope is
    // not the only thing that fills this slice: core folds the week
    // payload's inline `athlete_entry` into it too (ducks/journal/sagas.ts
    // on week/SUCCEEDED), so a serializer that ever leaked one would put it
    // here with nothing else between it and his screen. Teddy's switch
    // decides, wherever the row came from.
    const readable = entry !== null && entry.shared ? entry : null;
    return (
      <div className="athlete-journal athlete-journal--reading">
        <h1>{coachTitle(athlete?.name)}</h1>
        <p className="athlete-journal__whose">{COACH_SUBTITLE}</p>
        {error && <ErrorNote message={error} />}
        {readable === null ? (
          <p className="athlete-journal__nothing">{COACH_NOTHING}</p>
        ) : (
          <dl className="athlete-journal__read">
            <div>
              <dt>{COACH_FELT_LABEL}</dt>
              <dd>{readable.felt === null ? COACH_BLANK_FIELD : `${readable.felt} out of 5`}</dd>
            </div>
            <div>
              <dt>{COACH_BEST_LABEL}</dt>
              <dd>{readable.best || COACH_BLANK_FIELD}</dd>
            </div>
            <div>
              <dt>{COACH_HARD_LABEL}</dt>
              <dd>{readable.hard || COACH_BLANK_FIELD}</dd>
            </div>
            <div>
              <dt>{COACH_NOTE_LABEL}</dt>
              <dd>{readable.note || COACH_BLANK_FIELD}</dd>
            </div>
          </dl>
        )}
      </div>
    );
  }

  // A day he deleted with no signal, before anything has replaced it. It
  // comes before the loading and hydration branches below, because what the
  // queue says he asked for is already settled whether or not a fetch has
  // landed, and reopening this screen offline must answer him about the day
  // he took back rather than with a fetch error.
  //
  // No form, no toggle and no Save. There is nothing to save for a day that
  // is not there, and the toggle in particular would hand Dad a blanked-out
  // row for a day Teddy deleted, which is the promise this whole screen
  // exists to keep.
  if (deleteQueued) {
    return (
      <div className="athlete-journal">
        <h1>Today</h1>
        {error && <ErrorNote message={error} />}
        <section className="athlete-journal__deleted">
          <p role="status">{DELETE_QUEUED_TEXT}</p>
          <p>{DELETE_QUEUED_DETAIL}</p>
        </section>
      </div>
    );
  }

  if (!hydrated) {
    if (loading) return <Loading label={WAKING_LABEL} />;
    if (error) return <ErrorNote message={error} />;
    // The id is known, nothing has loaded and nothing has failed: the
    // mount effect above has dispatched but the store has not caught up in
    // this render yet.
    return null;
  }

  const shared = entry?.shared ?? false;
  // A `const` carries its own inferred type (`number`, not `number | null`)
  // from this exact assignment onward, which is what makes it, unlike
  // `currentId` itself, safe to read from inside the two closures below:
  // TypeScript's narrowing of `currentId` by the guard above does not
  // extend into a nested function, since either could in principle be
  // called long after this render.
  const programYearId = currentId;
  const entryId = entry?.id ?? null;
  // Only an entry the server has actually got: the route is addressed by id.
  // Whose it is has already been settled above, since everything from here
  // down renders for the athlete alone.
  const canDelete = entryId !== null;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Not annotated as SaveAthleteEntryPayload: that type is exactly the
    // four fields core's own request builder reads today (programYearId,
    // date, note, shared), and felt/best/hard ride along on the same
    // object for the day this app can send them all the way through. See
    // the task report for the gap that leaves in core today.
    const payload = {
      programYearId,
      date: today,
      note,
      shared,
      felt,
      best: best.length === 0 ? null : best,
      hard: hard.length === 0 ? null : hard,
    };
    dispatch(journalActions.saveAthleteEntry(payload));
  }

  function handleToggleShared() {
    dispatch(journalActions.setShared({ programYearId, date: today, shared: !shared }));
  }

  function handleDelete() {
    // `entryId` below is what makes this reachable at all: the route is
    // addressed by id (DELETE /api/v1/athlete_entries/:id), so an entry that
    // exists only as a write still waiting in the outbox has nothing to
    // delete and never shows the control.
    if (entryId === null) return;
    dispatch(journalActions.deleteEntry({ side: "athlete", date: today, id: entryId }));
  }

  return (
    <div className="athlete-journal">
      <h1>Today</h1>
      {error && <ErrorNote message={error} />}

      <form onSubmit={handleSave}>
        <fieldset>
          <legend>How did today feel? 1 is rough, 5 is great.</legend>
          {FELT_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={felt === value}
              onClick={() => setFelt(value)}
            >
              {value}
            </button>
          ))}
        </fieldset>

        <label>
          What went best today?
          <input type="text" value={best} onChange={(event) => setBest(event.target.value)} />
        </label>

        <label>
          What was hard today?
          <input type="text" value={hard} onChange={(event) => setHard(event.target.value)} />
        </label>

        <label>
          Tell me about today.
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <p className="athlete-journal__shared-state">{shared ? SHARED_TEXT : PRIVATE_TEXT}</p>
        <button type="button" onClick={handleToggleShared}>
          {shared ? "Keep this to yourself" : "Let Dad see this"}
        </button>

        {waitingToSend && (
          <p role="status">This is saved on your device and will send once you're back online.</p>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>

      {/* Outside the form, and last on the page, so the tap that deletes is
          nowhere near the tap that saves. It asks first: this is the only
          control on Teddy's screen that removes his own writing, it cannot
          be undone from here, and one stray thumb next to Save would cost
          him the day. A window.confirm would be a wall of adult text in a
          box he has no reason to trust, and the two states below can be read
          and tapped by a 7-year-old. */}
      {canDelete && (
        <section className="athlete-journal__delete">
          {confirmingDelete ? (
            <>
              <p>{DELETE_QUESTION}</p>
              <p>{DELETE_DETAIL}</p>
              {/* Keep it first, so the safe answer is the one under the
                  thumb that just tapped. */}
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
    </div>
  );
}
