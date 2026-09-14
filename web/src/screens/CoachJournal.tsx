import { useEffect, useState, type FormEvent } from "react";
import {
  authSelectors,
  drills,
  journalActions,
  journalSelectors,
  outboxSelectors,
  selectDrills,
  useAppDispatch,
  useAppSelector,
} from "@teddy-pe/core";
import type {
  CoachEntry,
  DrillRatingValue,
  QueuedWrite,
  SaveCoachEntryPayload,
} from "@teddy-pe/core";
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

// Whether a coach-entry write for this exact date is still sitting in the
// outbox, waiting for a connection. SAVE_QUEUED clears the day's saving
// flag the moment a write is off the app's hands and onto the outbox's (see
// core's journal saga), which looks identical to nothing having been typed
// at all unless something else says the write is still owed. The queue's
// dedupeKey format ("coach:<date>") is not part of core's public surface,
// so this reads the one thing every coach-entry write actually carries on
// its own request instead: the session date inside its own request body.
function isQueuedFor(queue: QueuedWrite[], date: string): boolean {
  return queue.some((write) => {
    const body = write.action.request.body as { coach_entry?: { session_date?: string } } | null;
    return body?.coach_entry?.session_date === date;
  });
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
  const queue = useAppSelector(outboxSelectors.selectQueue);
  const waitingToSend = !saving && isQueuedFor(queue, date);

  const [form, setForm] = useState<FormState>(() => formFrom(existingEntry));

  // Reopens the form for whichever date is on screen: the entry that date
  // already has, or a blank one when it has none. Runs again whenever the
  // stored entry for this date changes identity, which is what lets a fetch
  // that lands after a date was already picked fill the form in without a
  // second visit to it.
  useEffect(() => {
    setForm(formFrom(existingEntry));
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
    </div>
  );
}
