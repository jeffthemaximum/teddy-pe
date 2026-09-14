import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  authSelectors,
  journalActions,
  journalSelectors,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type { AthleteEntry } from "@teddy-pe/core";
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

export function AthleteJournal() {
  const dispatch = useAppDispatch();
  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);
  const today = todayISODate();

  const entry = useAppSelector(journalSelectors.selectAthleteEntryFor(today));
  // Whose entry this is. This screen is open to Jeff as well (see
  // routes.tsx: /journal is roles ["coach", "athlete"]), and what he sees
  // there is whatever Teddy has shared with him, so the entry on screen is
  // not always the signed-in person's. Only its owner gets a delete control,
  // and the API draws the same line in AthleteEntryPolicy#destroy? whatever
  // this renders.
  const role = useAppSelector(authSelectors.selectRole);
  const queued = useAppSelector(journalSelectors.selectIsEntryQueued("athlete", today));
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
  const [justDeleted, setJustDeleted] = useState(false);

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

  // Whether the last save is sitting in the outbox rather than actually
  // gone to the server, read off the same two things a screen is allowed to
  // read (isSaving(date) and the entry it already holds) rather than asking
  // the outbox what it is holding. A save that finishes online replaces the
  // entry (see reducer.ts's fold); a save that only got as far as the queue
  // does not touch it at all, so isSaving clearing with the entry
  // unchanged is what a queued write looks like from here.
  const wasSavingRef = useRef(saving);
  const entryRef = useRef<AthleteEntry | null>(entry);
  const [waitingToSend, setWaitingToSend] = useState(false);
  useEffect(() => {
    const wasSaving = wasSavingRef.current;
    wasSavingRef.current = saving;
    if (wasSaving && !saving) {
      setWaitingToSend(entry === entryRef.current);
    } else if (entry !== entryRef.current) {
      setWaitingToSend(false);
    }
    entryRef.current = entry;
  }, [saving, entry]);

  if (currentId === null) {
    return <WaitingForYearId label={FINDING_YEAR_LABEL} />;
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
  // Only his own, and only one the server has actually got. Jeff reading a
  // shared entry here gets no delete control, which is the same line
  // AthleteEntryPolicy#destroy? draws server-side; this is the polite half
  // of it, not the enforcement.
  const canDelete = entryId !== null && role === "athlete";

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
    setJustDeleted(true);
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
              <button type="button" onClick={() => setConfirmingDelete(false)}>
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

      {/* The entry is off this screen already, and the write that says so is
          still in the outbox. Saying nothing here would look exactly like a
          delete that had reached the server. */}
      {justDeleted && entry === null && queued && <p role="status">{DELETE_QUEUED_TEXT}</p>}
    </div>
  );
}
