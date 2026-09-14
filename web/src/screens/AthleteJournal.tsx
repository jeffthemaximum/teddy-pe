import { useEffect, useRef, useState } from "react";
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
import { AthleteNoteForm } from "../components/AthleteNoteForm";
import { todayISODate } from "../lib/scheduling";

// Same cold-Fly-machine wait as every other screen: 6.6 to 7.6 seconds.
const WAKING_LABEL = "Waking up the server. Opening today can take a few seconds.";

// Shown while the current program year id is still unknown, the same gap
// Year.tsx, Month.tsx and ThisWeek.tsx all cover the same way (see their own
// comments on authSelectors.selectCurrentProgramYearId).
const FINDING_YEAR_LABEL = "Waking up the server. Finding today can take a few seconds too.";

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
  // Whether today was deleted with no signal and has not been written again
  // since. It is a different question from whether a save is merely queued,
  // and the difference is the whole of the fix: a queued delete and a
  // queued save both leave the slice with no entry for today and a write
  // pending, so from here they look identical. With no entry,
  // AthleteNoteForm's own `shared` would read as false and its toggle would
  // offer to show Dad a day that is not there any more, which is exactly
  // what he tapped, and the save that fired would queue behind the delete.
  // This gate is why that form never mounts to find out.
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

  // Whether a fetch has actually told this screen something about today, one
  // way or the other. AthleteNoteForm opens on whatever `entry` is the
  // moment it mounts and folds a later arrival into the boxes he has not
  // typed in, so it would cope on its own; this gate is about what a blank
  // form SAYS. Shown before the fetch answers, it reads as "he wrote nothing
  // today" for a day the server has not confirmed that about yet.
  const hydratedRef = useRef(false);
  const wasLoadingRef = useRef(loading);
  const [hydrated, setHydrated] = useState(false);

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
      }
    }
    wasLoadingRef.current = loading;
  }, [entry, loading, error]);

  // The delete asks first, and this is what it is waiting on. Two taps, not
  // one, and the second one is a different button in a different place from
  // the first, so the gesture that deletes cannot be the gesture that opened
  // the question.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Closes a question the entry it was about no longer needs answered. Tied
  // to the entry actually leaving state rather than to the tap, so a delete
  // the server refuses leaves the confirm exactly where he left it.
  const hadEntryRef = useRef(entry !== null);
  useEffect(() => {
    if (hadEntryRef.current && entry === null) {
      setConfirmingDelete(false);
    }
    hadEntryRef.current = entry !== null;
  }, [entry]);

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

  // A `const` carries its own inferred type (`number`, not `number | null`)
  // from this exact assignment onward, which is what makes it, unlike
  // `currentId` itself, safe to read from inside the closure below:
  // TypeScript's narrowing of `currentId` by the guard above does not
  // extend into a nested function, since either could in principle be
  // called long after this render.
  const programYearId = currentId;
  const entryId = entry?.id ?? null;
  // Only an entry the server has actually got: the route is addressed by id.
  // Whose it is has already been settled above, since everything from here
  // down renders for the athlete alone.
  const canDelete = entryId !== null;

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

      <AthleteNoteForm programYearId={programYearId} date={today} />

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
