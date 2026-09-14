import { createCoreStore, memoryStorage } from "../src";
import { signInSucceeded, signOut, sessionExpired } from "../src/ducks/auth/actions";
import * as journalActions from "../src/ducks/journal/actions";
import { selectIsSaving } from "../src/ducks/journal/selectors";
import * as outboxActions from "../src/ducks/outbox/actions";
import { programYears } from "../src/ducks/programYears";
import { drills } from "../src/ducks/drills";
import { reducer as authReducer } from "../src/ducks/auth/reducer";
import { reducer as journalReducer } from "../src/ducks/journal/reducer";
import type { User } from "../src/types";

// Each duck's own initial value, read the same way journal-reducer.test.ts
// does: run the real reducer with no state and an action nobody handles.
// Not a hand-typed literal, so this cannot drift from what the duck itself
// considers "initial" the moment someone adds a field to one.
const INIT = { type: "@@test/INIT" };
const initialAuth = authReducer(undefined, INIT);
const initialJournal = journalReducer(undefined, INIT);
const initialProgramYears = programYears.reducer(undefined, INIT);
const initialDrills = drills.reducer(undefined, INIT);

const jeff: User = { id: 1, email: "jeff@example.test", name: "Jeff", role: "coach" };

function buildStore() {
  return createCoreStore({ baseUrl: "https://example.test", storage: memoryStorage() });
}

// Puts real, distinguishable data into auth, journal, two read ducks, and
// the outbox, so a reset that does nothing at all cannot pass by accident.
function populate(store: ReturnType<typeof buildStore>) {
  store.dispatch(signInSucceeded({ jwt: "jwt-123", user: jeff }));

  // Teddy's own words, unshared. This is the entry the whole system exists
  // to protect, and the one the reviewer found still sitting in state after
  // sign-out.
  store.dispatch(
    journalActions.athleteEntrySaved({
      id: 4,
      session_date: "2026-09-17",
      program_year_id: 1,
      day_card_id: 12,
      felt: null,
      best: null,
      hard: null,
      note: "Landed three in a row. Don't tell Dad yet.",
      shared: false,
      updated_at: "2026-09-17T19:02:00Z",
    }),
  );

  // A day in flight: dispatched and not yet answered by a save or a
  // failure, the state a dead token catches it in mid-save. This is a
  // second, independent claim about journal beyond "the saved entry is
  // gone" — the entry above and this flag are cleared by different code
  // paths inside the same reducer, so one clearing does not prove the
  // other does.
  store.dispatch(
    journalActions.saveCoachEntry({
      date: "2026-09-18",
      note: null,
      overall: null,
      energy: null,
      flag_pain: false,
      pain_note: null,
      challenge_num: null,
      ratings: {},
    }),
  );

  store.dispatch(
    programYears.actions.succeeded({
      program_years: [
        {
          id: 1,
          label: "2026-27",
          starts_on: "2026-09-01",
          ends_on: "2027-08-31",
          status: "active",
          is_current: true,
        },
      ],
    }),
  );

  store.dispatch(
    drills.actions.succeeded({
      drills: [
        {
          slug: "cartwheel-prep",
          name: "Cartwheel Prep",
          area_name: "Gymnastics",
          aliases: ["wheel"],
          short: "Hands, feet, land like a cat.",
          how: ["Reach", "Kick", "Land"],
          watch: "Straight arms.",
          cue: "Land like a cat.",
          video: null,
        },
      ],
    }),
  );

  // A write the app owes the server. Enqueued directly, the way the outbox
  // saga would after a failed send, rather than through a real network
  // round trip this test has no server for.
  store.dispatch(
    outboxActions.enqueue({
      type: "journal/SAVE_ATHLETE_ENTRY",
      payload: { date: "2026-09-17", note: "Landed three in a row.", shared: false },
      dedupeKey: "athlete:2026-09-17",
      request: {
        path: "/api/v1/athlete_entries",
        method: "POST",
        body: { athlete_entry: { session_date: "2026-09-17" } },
      },
    }),
  );
}

// Confirms every slice this test populated actually holds the data before
// the reset runs. Skipping this is how a reset that does nothing at all
// passes: see the "would not catch" tests at the bottom of this file.
function expectPopulated(state: ReturnType<ReturnType<typeof buildStore>["getState"]>) {
  expect(state.auth.status).toBe("signedIn");
  expect(state.auth.token).toBe("jwt-123");
  expect(state.journal.athlete["2026-09-17"]).toBeDefined();
  expect(selectIsSaving("2026-09-18")(state)).toBe(true);
  expect(state.programYears.data?.program_years).toHaveLength(1);
  expect(state.drills.data?.drills).toHaveLength(1);
  expect(state.outbox.queue).toHaveLength(1);
}

describe("the root reducer's reset on sign-out", () => {
  it("returns every slice to its real initial state, journal and two read ducks included, except the outbox queue", () => {
    const store = buildStore();
    populate(store);
    expectPopulated(store.getState());

    store.dispatch(signOut());
    const state = store.getState();

    expect(state.journal).toEqual(initialJournal);
    // Named explicitly, not just folded into the object equality above: a
    // day left mid-save when the token dies must not spin forever with no
    // error and no entry, which is what a `saving` flag that survives would
    // do to whoever signs in next.
    expect(selectIsSaving("2026-09-18")(state)).toBe(false);
    expect(state.programYears).toEqual(initialProgramYears);
    expect(state.drills).toEqual(initialDrills);
    expect(state.auth).toEqual(initialAuth);

    // The outbox is the one exception on this action: a write owed to the
    // server survives sign-out untouched, content and all.
    expect(state.outbox.queue).toHaveLength(1);
    expect(state.outbox.queue[0]!.action.dedupeKey).toBe("athlete:2026-09-17");
    expect(state.outbox.queue[0]!.action.request.body).toEqual({
      athlete_entry: { session_date: "2026-09-17" },
    });
  });
});

describe("the root reducer's reset on session expiry", () => {
  // A separate test, deliberately: SIGN_OUT and SESSION_EXPIRED are two
  // different action types, and wiring the reset to one is no guarantee the
  // other was wired too. A reviewer caught exactly that gap in the journal
  // duck's own stopgap by dropping each action independently; the root
  // reset gets the same treatment.
  it("returns every slice to its real initial state except auth's error message and the outbox queue", () => {
    const store = buildStore();
    populate(store);
    expectPopulated(store.getState());

    store.dispatch(sessionExpired());
    const state = store.getState();

    expect(state.journal).toEqual(initialJournal);
    expect(selectIsSaving("2026-09-18")(state)).toBe(false);
    expect(state.programYears).toEqual(initialProgramYears);
    expect(state.drills).toEqual(initialDrills);

    // auth is not simply back to its bare initial state here: SESSION_EXPIRED
    // sets an explanation the sign-in screen needs, and the reset must not
    // erase it right after auth's own reducer set it.
    expect(state.auth).toEqual({
      status: "anonymous",
      user: null,
      token: null,
      error: "You were signed out. Sign in again.",
    });
    expect(state.auth).not.toEqual(initialAuth);

    expect(state.outbox.queue).toHaveLength(1);
    expect(state.outbox.queue[0]!.action.dedupeKey).toBe("athlete:2026-09-17");
  });
});

describe("a reset that would not actually prove anything", () => {
  // Documented, not just avoided: asserting the store equals its initial
  // state after a sign-out on a store where nothing was ever populated
  // passes against a reset that does nothing at all. It is here once so the
  // next person who is tempted to write only this version can see why the
  // tests above populate first.
  it("passes even with no reset wired at all, which is exactly why it proves nothing on its own", () => {
    const store = buildStore();
    const before = store.getState();
    store.dispatch(signOut());
    const after = store.getState();

    expect(after.journal).toEqual(before.journal);
    expect(after.programYears).toEqual(before.programYears);
  });
});
