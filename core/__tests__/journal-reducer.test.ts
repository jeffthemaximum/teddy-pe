import { reducer, actions, selectors } from "../src/ducks/journal";
import type { AthleteEntry, CoachEntry } from "../src/types";

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
      error: null,
    });
  });

  it("files an athlete entry under its own date", () => {
    const s = reducer(undefined, actions.athleteEntrySaved(mine));
    expect(s.athlete["2026-09-17"]).toEqual(mine);
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
    const s = reducer(undefined, actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: s })).toBe(true);
    expect(selectors.selectIsSaving("2026-09-18")({ journal: s })).toBe(false);
  });

  it("stops saving when the save lands", () => {
    const saving = reducer(undefined, actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }));
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
    const saving = reducer(undefined, actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }));
    const queued = reducer(saving, actions.saveQueued({ date: "2026-09-17" }));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: queued })).toBe(false);
    // And it did not fabricate a save: no entry appeared, no error either.
    expect(queued.athlete["2026-09-17"]).toBeUndefined();
    expect(selectors.selectJournalError({ journal: queued })).toBeNull();
  });

  it("clears saving and records the message on a real failure", () => {
    const saving = reducer(undefined, actions.saveAthleteEntry({ date: "2026-09-17", note: "", shared: false }));
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
});

describe("the journal selectors", () => {
  it("selectCoachEntryFor and selectAthleteEntryFor read their own map, and null when there is nothing", () => {
    const s = reducer(undefined, actions.athleteEntrySaved(mine));
    expect(selectors.selectAthleteEntryFor("2026-09-17")({ journal: s })).toEqual(mine);
    expect(selectors.selectAthleteEntryFor("2026-09-18")({ journal: s })).toBeNull();
    expect(selectors.selectCoachEntryFor("2026-09-17")({ journal: s })).toBeNull();
  });
});
