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

export function AthleteJournal() {
  const dispatch = useAppDispatch();
  const currentId = useAppSelector(authSelectors.selectCurrentProgramYearId);
  const today = todayISODate();

  const entry = useAppSelector(journalSelectors.selectAthleteEntryFor(today));
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
    </div>
  );
}
