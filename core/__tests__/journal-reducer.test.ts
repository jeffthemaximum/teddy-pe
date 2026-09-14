import { reducer, actions, selectors } from "../src/ducks/journal";
import type { AthleteEntry, CoachEntry } from "../src/types";
import type { OutboxState, QueueableAction } from "../src/ducks/outbox";

// Every real column an AthleteEntry has, not the abbreviated shape an old
// draft of the brief once had. program_year_id/day_card_id/felt/best/hard
// are here even though this test never inspects them, because leaving them
// out would mean `athleteEntrySaved` is only ever tested against a value the
// real API could never actually send.
const mine: AthleteEntry = {
  id: 4,
  session_date: "2026-09-17",
  program_year_id: 1,
  day_card_id: 12,
  felt: null,
  best: null,
  hard: null,
  note: "Landed three in a row.",
  shared: false,
  updated_at: "2026-09-17T19:02:00Z",
};

const jeffs: CoachEntry = {
  id: 9,
  session_date: "2026-09-17",
  program_year_id: 1,
  day_card_id: 12,
  overall: 4,
  energy: 3,
  flag_pain: false,
  pain_note: null,
  note: "Balance drill needs another week.",
  challenge_num: null,
  ratings: { "cartwheel-prep": "getting" },
  updated_at: "2026-09-17T19:10:00Z",
};

describe("the journal reducer", () => {
  it("starts with nothing and no error", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      coach: {},
      athlete: {},
      saving: {},
      loading: { athlete: false, coach: false },
      error: null,
    });
  });

  it("files an athlete entry under its own date", () => {
    const s = reducer(undefined, actions.athleteEntrySaved(mine));
    expect(s.athlete["2026-09-17"]).toEqual(mine);
  });

  // Two entries, one deleted. One on its own would prove nothing: an empty
  // map looks identical whether the right row was removed or every row was.
  describe("deleting an entry", () => {
    const otherDay: AthleteEntry = { ...mine, id: 5, session_date: "2026-09-18" };

    function twoDays() {
      let s = reducer(undefined, actions.athleteEntrySaved(mine));
      s = reducer(s, actions.athleteEntrySaved(otherDay));
      return reducer(s, actions.coachEntrySaved(jeffs));
    }

    it("removes only that day, on only that side", () => {
      const s = reducer(twoDays(), actions.entryDeleted({ side: "athlete", date: "2026-09-17" }));

      expect(s.athlete["2026-09-17"]).toBeUndefined();
      expect(s.athlete["2026-09-18"]).toEqual(otherDay);
      // Same date, Dad's side. Teddy deleting his own must not touch it.
      expect(s.coach["2026-09-17"]).toEqual(jeffs);
    });

    it("removes the coach's own day without touching Teddy's", () => {
      const s = reducer(twoDays(), actions.entryDeleted({ side: "coach", date: "2026-09-17" }));

      expect(s.coach["2026-09-17"]).toBeUndefined();
      expect(s.athlete["2026-09-17"]).toEqual(mine);
    });

    it("marks the day as saving while the delete is in flight, and clears it after", () => {
      const started = reducer(
        twoDays(),
        actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 4 }),
      );
      expect(selectors.selectIsSaving("2026-09-17")({ journal: started })).toBe(true);
      // The entry is still there: nothing has been removed yet, because
      // nothing has answered yet.
      expect(started.athlete["2026-09-17"]).toEqual(mine);

      const done = reducer(started, actions.entryDeleted({ side: "athlete", date: "2026-09-17" }));
      expect(selectors.selectIsSaving("2026-09-17")({ journal: done })).toBe(false);
    });

    it("keeps the map's identity when the day was not there anyway", () => {
      const before = twoDays();
      const after = reducer(before, actions.entryDeleted({ side: "athlete", date: "2026-12-25" }));

      // Same object, not merely an equal one: a fresh map on every
      // unrelated delete rebuilds the memoized list selector and re-renders
      // a screen showing a different day.
      expect(after.athlete).toBe(before.athlete);
    });

    it("takes the deleted day out of the list a screen reads", () => {
      const before = twoDays();
      expect(selectors.selectAthleteEntries({ journal: before }).map((e) => e.session_date)).toEqual(
        ["2026-09-17", "2026-09-18"],
      );

      const after = reducer(before, actions.entryDeleted({ side: "athlete", date: "2026-09-17" }));
      expect(selectors.selectAthleteEntries({ journal: after }).map((e) => e.session_date)).toEqual(
        ["2026-09-18"],
      );
    });
  });

  it("files a coach entry under its own date, in its own map", () => {
    const s = reducer(undefined, actions.coachEntrySaved(jeffs));
    expect(s.coach["2026-09-17"]).toEqual(jeffs);
    // Same date, different person's writing. One never leaks into the
    // other's map.
    expect(s.athlete["2026-09-17"]).toBeUndefined();
  });

  it("replaces the entry for a date rather than accumulating duplicates", () => {
    // The API upserts on (user, year, date). Two saves are one entry.
    const first = reducer(undefined, actions.athleteEntrySaved(mine));
    const second = reducer(
      first,
      actions.athleteEntrySaved({ ...mine, note: "Four in a row.", updated_at: "2026-09-17T19:40:00Z" }),
    );
    expect(Object.keys(second.athlete)).toEqual(["2026-09-17"]);
    expect(second.athlete["2026-09-17"]!.note).toBe("Four in a row.");
  });

  it("tracks saving per date, so one day saving does not spin every day", () => {
    const s = reducer(undefined, actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "x", shared: false }));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: s })).toBe(true);
    expect(selectors.selectIsSaving("2026-09-18")({ journal: s })).toBe(false);
  });

  it("stops saving when the save lands", () => {
    const saving = reducer(undefined, actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "x", shared: false }));
    const done = reducer(saving, actions.athleteEntrySaved(mine));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: done })).toBe(false);
  });

  it("tracks a coach save's saving flag by date the same way an athlete save's is, on a different day", () => {
    // `saving` is one map keyed by date (per the spec), not one per kind, so
    // this uses a date the athlete tests above never touch to prove the
    // coach side sets and clears it too, without relying on the two kinds
    // being independent for the same date (they are not: a coach save and an
    // athlete save on the same day share that day's one saving flag).
    const s = reducer(
      undefined,
      actions.saveCoachEntry({
        programYearId: 1,
        date: "2026-09-20",
        note: null,
        overall: null,
        energy: null,
        flag_pain: false,
        pain_note: null,
        challenge_num: null,
        ratings: {},
      }),
    );
    expect(selectors.selectIsSaving("2026-09-20")({ journal: s })).toBe(true);
    const done = reducer(s, actions.coachEntrySaved({ ...jeffs, session_date: "2026-09-20" }));
    expect(selectors.selectIsSaving("2026-09-20")({ journal: done })).toBe(false);
  });

  it("clears saving when a write is queued rather than saved or failed", () => {
    // Offline is neither success nor a reportable error. The day's saving
    // flag has to clear anyway, or a queued write leaves the UI spinning for
    // that date until the app happens to save it again directly.
    const saving = reducer(undefined, actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "x", shared: false }));
    const queued = reducer(saving, actions.saveQueued({ date: "2026-09-17" }));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: queued })).toBe(false);
    // And it did not fabricate a save: no entry appeared, no error either.
    expect(queued.athlete["2026-09-17"]).toBeUndefined();
    expect(selectors.selectJournalError({ journal: queued })).toBeNull();
  });

  it("clears saving and records the message on a real failure", () => {
    const saving = reducer(undefined, actions.saveAthleteEntry({ programYearId: 1, date: "2026-09-17", felt: null, best: null, hard: null, note: "", shared: false }));
    const failed = reducer(saving, actions.saveFailed({ date: "2026-09-17", message: "A note cannot be blank." }));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: failed })).toBe(false);
    expect(selectors.selectJournalError({ journal: failed })).toBe("A note cannot be blank.");
  });

  it("keeps what the API returned for shared, and never infers it", () => {
    // If the client ever computes `shared` itself, the toggle has two owners
    // and they will disagree. The API decides; we display.
    const shared = reducer(undefined, actions.athleteEntrySaved({ ...mine, shared: true }));
    expect(shared.athlete["2026-09-17"]!.shared).toBe(true);
    const not = reducer(shared, actions.athleteEntrySaved({ ...mine, shared: false }));
    expect(not.athlete["2026-09-17"]!.shared).toBe(false);
  });

  it("marks the entry the instant he taps, so nothing goes on sending the value he just changed", () => {
    // This asserted the opposite until 14 September 2026: SET_SHARED set the
    // saving flag and nothing else, on the reasoning that the API owns
    // `shared` and the client only displays it. Autosave turned that
    // reasoning into the loss of the one control Teddy has over who reads
    // his words. Between the tap and the server answering, a screen reading
    // `shared` off this entry still read the old value, and any save in that
    // gap carried it back. Offline it is not even a race: both writes queue
    // under one dedupeKey and the outbox lets the later save replace the
    // un-share in place, so the un-share never leaves the device while the
    // screen goes on saying "Dad can see this too".
    //
    // The API still decides. This write keeps the entry's own `updated_at`,
    // so a real response carries a later one and wins the fold above,
    // whichever way the server actually went.
    const saved = reducer(undefined, actions.athleteEntrySaved({ ...mine, shared: true }));
    const s = reducer(
      saved,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: false }),
    );
    expect(s.athlete["2026-09-17"]!.shared).toBe(false);
    expect(s.athlete["2026-09-17"]!.updated_at).toBe(mine.updated_at);
    expect(selectors.selectIsSaving("2026-09-17")({ journal: s })).toBe(true);
    // Nothing else on the row moves. The tap is about one field.
    expect(s.athlete["2026-09-17"]!.note).toBe(mine.note);

    // A day with no entry on record has nothing to mark. The save this
    // toggle fires is what creates the row, carrying the intent on it.
    const none = reducer(
      undefined,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: true }),
    );
    expect(none.athlete["2026-09-17"]).toBeUndefined();
    expect(selectors.selectIsSaving("2026-09-17")({ journal: none })).toBe(true);
  });

  it("lets a later answer from the server overrule what the tap wrote", () => {
    // The tap is an intent, not a fact. If the write never landed and the
    // server says the row is still shared, that is what the screen shows.
    const saved = reducer(undefined, actions.athleteEntrySaved({ ...mine, shared: true }));
    const tapped = reducer(
      saved,
      actions.setShared({ programYearId: 1, date: "2026-09-17", shared: false }),
    );
    const answered = reducer(
      tapped,
      actions.athleteEntrySaved({ ...mine, shared: true, updated_at: "2026-09-17T19:05:00Z" }),
    );
    expect(answered.athlete["2026-09-17"]!.shared).toBe(true);
    expect(selectors.selectIsSaving("2026-09-17")({ journal: answered })).toBe(false);
  });

  // --- The reads, and the one rule about which copy of an entry wins ---

  it("tracks each list's loading on its own, so one endpoint cannot spin the other", () => {
    const athlete = reducer(undefined, actions.fetchAthleteEntries());
    expect(selectors.selectIsLoadingAthleteEntries({ journal: athlete })).toBe(true);
    expect(selectors.selectIsLoadingCoachEntries({ journal: athlete })).toBe(false);

    const both = reducer(athlete, actions.fetchCoachEntries());
    expect(selectors.selectIsLoadingCoachEntries({ journal: both })).toBe(true);

    const athleteLanded = reducer(both, actions.athleteEntriesFetched([mine]));
    expect(selectors.selectIsLoadingAthleteEntries({ journal: athleteLanded })).toBe(false);
    // Jeff's list is still on its way. Teddy's arriving says nothing about it.
    expect(selectors.selectIsLoadingCoachEntries({ journal: athleteLanded })).toBe(true);
  });

  it("files a fetched list by date, in both maps", () => {
    const s = reducer(undefined, actions.athleteEntriesFetched([mine]));
    const both = reducer(s, actions.coachEntriesFetched([jeffs]));
    expect(selectors.selectAthleteEntryFor("2026-09-17")({ journal: both })).toEqual(mine);
    expect(selectors.selectCoachEntryFor("2026-09-17")({ journal: both })).toEqual(jeffs);
  });

  // THE RULE: one entry lives in one place, this slice, and the copy the
  // server stamped later is the one that survives. The week payload carries
  // its own inline copy of the same row and folds in through these same two
  // actions (see ducks/journal/sagas.ts), so this is the test that says a
  // slow week fetch cannot undo a save that landed while it was in flight.
  it("refuses a list's copy of an entry that is older than the one already held", () => {
    const saved = reducer(
      undefined,
      actions.athleteEntrySaved({ ...mine, note: "Four in a row.", updated_at: "2026-09-17T19:40:00Z" }),
    );
    // The week payload was built before that save, so its copy is stale.
    const stale = reducer(
      saved,
      actions.athleteEntriesFetched([
        { ...mine, note: "Landed three in a row.", updated_at: "2026-09-17T19:02:00Z" },
      ]),
    );
    expect(stale.athlete["2026-09-17"]!.note).toBe("Four in a row.");
  });

  it("takes a list's copy when it is the newer one", () => {
    // The other direction, which is the common one: the entry was saved on
    // Jeff's phone and this device is only now hearing about it.
    const saved = reducer(undefined, actions.athleteEntrySaved(mine));
    const fresher = reducer(
      saved,
      actions.athleteEntriesFetched([
        { ...mine, note: "Added a bit more.", updated_at: "2026-09-18T08:00:00Z" },
      ]),
    );
    expect(fresher.athlete["2026-09-17"]!.note).toBe("Added a bit more.");
  });

  it("lets a save response land even when it carries the same timestamp as the copy on record", () => {
    // A tie goes to the copy arriving now, so the response to a save the
    // person just made is never the one that loses.
    const held = reducer(undefined, actions.athleteEntriesFetched([mine]));
    const after = reducer(held, actions.athleteEntrySaved({ ...mine, shared: true }));
    expect(after.athlete["2026-09-17"]!.shared).toBe(true);
  });

  // A stamp that is a string but does not parse ("not-a-date") passes
  // isEntry (api.ts checks only that updated_at is typeof "string") and then
  // reaches this fold. Treated as absent: it can never be shown to be newer
  // than anything, so it never wins.
  it("never lets a copy with an updated_at that does not parse replace a copy already held", () => {
    const held = reducer(undefined, actions.athleteEntrySaved(mine));
    // Lexically, "not-a-date" sorts after every real ISO stamp, which is
    // exactly the bug: a garbage string used to win on `>` alone.
    const withGarbage = reducer(
      held,
      actions.athleteEntriesFetched([
        { ...mine, note: "should not survive", updated_at: "not-a-date" },
      ]),
    );
    expect(withGarbage.athlete["2026-09-17"]).toEqual(mine);
  });

  it("never files a copy with an updated_at that does not parse at all, even as the first one on record for that date", () => {
    // Absent all the way: a stamp this app cannot order against anything is
    // not one it keeps on the strength of being first, either.
    const s = reducer(
      undefined,
      actions.athleteEntriesFetched([{ ...mine, updated_at: "not-a-date" }]),
    );
    expect(s.athlete["2026-09-17"]).toBeUndefined();
  });

  it("clears only the failing side's spinner, and says what went wrong", () => {
    const loading = reducer(undefined, actions.fetchCoachEntries());
    const failed = reducer(
      loading,
      actions.fetchEntriesFailed({ side: "coach", message: "That took too long. Try again." }),
    );
    expect(selectors.selectIsLoadingCoachEntries({ journal: failed })).toBe(false);
    expect(selectors.selectJournalError({ journal: failed })).toBe("That took too long. Try again.");
  });

  it("puts the flag back with no error at all when a fetch never went out", () => {
    // Nobody signed in. That is a bug in the calling screen, not something
    // Teddy or Jeff did, so there is nothing to tell them.
    const loading = reducer(undefined, actions.fetchAthleteEntries());
    const skipped = reducer(loading, actions.fetchEntriesSkipped({ side: "athlete" }));
    expect(selectors.selectIsLoadingAthleteEntries({ journal: skipped })).toBe(false);
    expect(selectors.selectJournalError({ journal: skipped })).toBeNull();
  });

  // The journal duck used to clear itself on signOut()/sessionExpired() as a
  // stopgap, and that behavior was tested here directly. It now lives once,
  // at the root (store/rootReducer.ts), so this reducer alone no longer
  // reacts to either action. See __tests__/root-reducer-reset.test.ts for
  // the reset itself, proven against a real store with several slices
  // populated, journal included.
});

describe("the journal selectors", () => {
  it("selectCoachEntryFor and selectAthleteEntryFor read their own map, and null when there is nothing", () => {
    const s = reducer(undefined, actions.athleteEntrySaved(mine));
    expect(selectors.selectAthleteEntryFor("2026-09-17")({ journal: s })).toEqual(mine);
    expect(selectors.selectAthleteEntryFor("2026-09-18")({ journal: s })).toBeNull();
    expect(selectors.selectCoachEntryFor("2026-09-17")({ journal: s })).toBeNull();
  });

  it("lists a journal oldest day first, whatever order the entries arrived in", () => {
    // What a journal screen renders. The maps are keyed by date and nothing
    // about object key order is a promise, so the order is made here.
    const later = { ...mine, session_date: "2026-09-20", id: 5 };
    const earlier = { ...mine, session_date: "2026-09-15", id: 6 };
    const s = reducer(undefined, actions.athleteEntriesFetched([later, mine, earlier]));
    expect(selectors.selectAthleteEntries({ journal: s }).map((e) => e.session_date)).toEqual([
      "2026-09-15",
      "2026-09-17",
      "2026-09-20",
    ]);
  });

  it("hands back the same array until an entry actually changes, so a screen reading it does not re-render on every action", () => {
    const s = reducer(undefined, actions.athleteEntriesFetched([mine]));
    const first = selectors.selectAthleteEntries({ journal: s });
    // An unrelated action: a different day starts saving.
    const later = reducer(s, actions.saveCoachEntry({
      programYearId: 1,
      date: "2026-09-20",
      note: null,
      overall: null,
      energy: null,
      flag_pain: false,
      pain_note: null,
      challenge_num: null,
      ratings: {},
    }));
    expect(selectors.selectAthleteEntries({ journal: later })).toBe(first);
  });

  it("lists the coach journal from its own map, never the athlete's", () => {
    const s = reducer(undefined, actions.coachEntriesFetched([jeffs]));
    expect(selectors.selectCoachEntries({ journal: s })).toEqual([jeffs]);
    expect(selectors.selectAthleteEntries({ journal: s })).toEqual([]);
  });
});

describe("selectIsEntryQueued", () => {
  // The state a screen actually reads through: `selectIsEntryQueued` reaches
  // past `journal` into `outbox` (and, through `selectQueue`, `auth`), so
  // the bare `{ journal: s }` fixture the rest of this file uses is not
  // enough on its own. `journal` itself is never read at all by this
  // selector (it needs no saved entry to answer "is a write queued"), and
  // is included below only because `WithJournal` is still part of the type
  // every other selector in this file shares.
  const SIGNED_IN_USER = 3;
  const emptyJournalState = reducer(undefined, { type: "@@INIT" });

  function stateWith(queue: OutboxState["queue"]) {
    return {
      journal: emptyJournalState,
      outbox: { queue, replaying: false, signedInUserId: SIGNED_IN_USER },
      auth: { token: "a.b.c", user: { id: SIGNED_IN_USER } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("answers true for the side and date a queued write actually names, and false for a neighboring date", () => {
    const write = {
      id: "1",
      action: actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "Landed three.",
        shared: false,
      }),
      queuedAt: "2026-09-17T18:00:00Z",
      attempts: 0,
      userId: SIGNED_IN_USER,
    };
    const s = stateWith([write]);

    expect(selectors.selectIsEntryQueued("athlete", "2026-09-17")(s)).toBe(true);
    // A neighboring date's dedupeKey is `athlete:2026-09-18`, a different
    // string entirely, not merely "close": a version of this selector that
    // matched on date substring rather than the exact key would pass this
    // test for the wrong reason.
    expect(selectors.selectIsEntryQueued("athlete", "2026-09-18")(s)).toBe(false);
  });

  it("does not answer true for the other side's write on the same date, even though the date matches", () => {
    // The point of prefixing the dedupeKey at all: `athlete:2026-09-17` and
    // `coach:2026-09-17` are Teddy's and Jeff's own writing on the same day,
    // and a selector that only checked the date half of the key would tell
    // Teddy his entry is queued because his dad's is.
    const coachWrite = {
      id: "1",
      action: actions.saveCoachEntry({
        programYearId: 1,
        date: "2026-09-17",
        note: "Jeff's note.",
        overall: null,
        energy: null,
        flag_pain: false,
        pain_note: null,
        challenge_num: null,
        ratings: {},
      }),
      queuedAt: "2026-09-17T18:00:00Z",
      attempts: 0,
      userId: SIGNED_IN_USER,
    };
    const s = stateWith([coachWrite]);

    expect(selectors.selectIsEntryQueued("coach", "2026-09-17")(s)).toBe(true);
    expect(selectors.selectIsEntryQueued("athlete", "2026-09-17")(s)).toBe(false);
  });

  it("answers false against an empty queue", () => {
    expect(selectors.selectIsEntryQueued("athlete", "2026-09-17")(stateWith([]))).toBe(false);
  });

  it("reads through the outbox's own signed-in scoping, not the raw queue: a write with no author here is nobody's", () => {
    // `selectQueue` (outbox/selectors.ts) is what already narrows the queue
    // to the signed-in person's own writes; this selector is built on top
    // of it rather than on `state.outbox.queue` directly. A write queued
    // with no recorded author (see ducks/outbox/types.ts on `userId: null`)
    // is exactly the case that tells the two apart: it is really sitting in
    // the queue, under the right dedupeKey, and a version reading the raw
    // queue would say so, but it belongs to nobody signed in and
    // `selectQueue` excludes it.
    const orphanedWrite = {
      id: "1",
      action: actions.saveAthleteEntry({
        programYearId: 1,
        date: "2026-09-17",
        felt: null,
        best: null,
        hard: null,
        note: "Queued before anyone was signed in.",
        shared: false,
      }),
      queuedAt: "2026-09-17T18:00:00Z",
      attempts: 0,
      userId: null,
    };
    const s = stateWith([orphanedWrite]);

    expect(selectors.selectIsEntryQueued("athlete", "2026-09-17")(s)).toBe(false);
  });
});

describe("selectIsDeleteQueued", () => {
  // What a screen needs that `selectIsEntryQueued` cannot answer. A day
  // deleted with no signal and a day saved with no signal look identical
  // from outside the queue: no entry in the slice, one write pending. The
  // difference is what the write asks the server to do, and it decides
  // whether the screen may still offer to save that day or share it.
  const SIGNED_IN_USER = 3;
  const emptyJournalState = reducer(undefined, { type: "@@INIT" });

  function stateWith(queue: OutboxState["queue"]) {
    return {
      journal: emptyJournalState,
      outbox: { queue, replaying: false, signedInUserId: SIGNED_IN_USER },
      auth: { token: "a.b.c", user: { id: SIGNED_IN_USER } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  function queuedWrite(id: string, action: QueueableAction) {
    return {
      id,
      action,
      queuedAt: "2026-09-17T18:00:00Z",
      attempts: 0,
      userId: SIGNED_IN_USER,
    };
  }

  const savesToday = () =>
    actions.saveAthleteEntry({
      programYearId: 1,
      date: "2026-09-17",
      felt: null,
      best: null,
      hard: null,
      note: "Starting today again.",
      shared: false,
    });

  const deletesToday = () =>
    actions.deleteEntry({ side: "athlete", date: "2026-09-17", id: 502 });

  it("answers true when the write queued for the day is a delete", () => {
    const s = stateWith([queuedWrite("1", deletesToday())]);

    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-17")(s)).toBe(true);
  });

  it("answers false for a queued save, which the queued check alone cannot tell apart", () => {
    // Both assertions on one fixture on purpose. A selector that simply
    // repeated `selectIsEntryQueued` would pass the test above and fail
    // here, and one that always answered false would fail the test above.
    const s = stateWith([queuedWrite("1", savesToday())]);

    expect(selectors.selectIsEntryQueued("athlete", "2026-09-17")(s)).toBe(true);
    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-17")(s)).toBe(false);
  });

  it("answers false once he has written that day again behind the delete", () => {
    // The queue can hold both, in that order (ducks/outbox/reducer.ts). The
    // day is not a deleted day any more: he took it back and then started
    // it again, so the screen owes him a form rather than a notice.
    const s = stateWith([queuedWrite("1", deletesToday()), queuedWrite("2", savesToday())]);

    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-17")(s)).toBe(false);
  });

  it("reads the last write for the day, not the first, when a delete follows a save", () => {
    // The reverse of the pair above, and the reason this asks for the last
    // write rather than whether any delete is in there.
    const s = stateWith([queuedWrite("1", savesToday()), queuedWrite("2", deletesToday())]);

    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-17")(s)).toBe(true);
  });

  it("never answers for another day, or for the other side's own delete", () => {
    const s = stateWith([
      queuedWrite("1", deletesToday()),
      queuedWrite("2", actions.deleteEntry({ side: "coach", date: "2026-09-20", id: 9 })),
    ]);

    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-18")(s)).toBe(false);
    expect(selectors.selectIsDeleteQueued("coach", "2026-09-17")(s)).toBe(false);
    expect(selectors.selectIsDeleteQueued("coach", "2026-09-20")(s)).toBe(true);
  });

  it("answers false against an empty queue", () => {
    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-17")(stateWith([]))).toBe(false);
  });

  it("reads through the outbox's own signed-in scoping, the same as every other queue question", () => {
    // A delete queued with no recorded author belongs to nobody (see
    // ducks/outbox/types.ts), so it must not put anyone's screen into the
    // deleted state.
    const s = stateWith([{ ...queuedWrite("1", deletesToday()), userId: null }]);

    expect(selectors.selectIsDeleteQueued("athlete", "2026-09-17")(s)).toBe(false);
  });
});
