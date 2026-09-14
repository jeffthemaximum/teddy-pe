export { createCoreStore } from "./store/configureStore";
export { memoryStorage } from "./services/storage";
export type { Storage } from "./services/storage";
export type { Logger } from "./services/logger";
export type { CoreDeps } from "./config";
export type { RootState } from "./store/rootReducer";

// The auth duck's public surface. Each app dispatches `authActions.signIn`
// etc. and reads state through `authSelectors`; the reducer and saga are
// already wired into the store by rootReducer/rootSaga and have no reason to
// be imported directly.
//
// authActions is deliberately narrowed to the three actions an app is
// allowed to dispatch. signInSucceeded, signInFailed, restoreFinished and
// meSucceeded are dispatched only by the saga: an app that could dispatch
// signInSucceeded or meSucceeded itself could put the store in a signed-in
// state holding a token, an athlete or a program year the server never
// sent.
//
// authSelectors carries selectAthlete and selectCurrentProgramYearId
// alongside the selectors that predate GET /api/v1/me. Both apps need
// them: the Year screen used to fetch the whole program-years list and
// pick out the one marked current, two round trips against a server that
// measured 6.6 to 7.6 seconds cold, purely to learn what this duck now
// already asked for once, at sign-in and at restore.
import { actions as authDuckActions, selectors as authSelectors } from "./ducks/auth";

export const authActions = {
  signIn: authDuckActions.signIn,
  signOut: authDuckActions.signOut,
  restoreSession: authDuckActions.restoreSession,
};
export { authSelectors };
export type { AuthState } from "./ducks/auth";
export type { User, Role, LoginResponse, Athlete } from "./types";

// The outbox's public surface is deliberately narrow, the same reasoning as
// authActions above: `replay()` is the only action an app ever dispatches
// (when connectivity is believed to be back). enqueue, replaySucceeded,
// replayFailed and queueRestored are saga- and duck-internal; a duck that
// wants to queue a write (journal, test results) enqueues through its own
// sibling import of ducks/outbox, not through this surface, because building
// a QueueableAction (dedupeKey, request) is that duck's job, not an app's.
//
// The selectors are narrowed for a second reason, and a sharper one. A
// queued write holds the raw words somebody typed, in plaintext, and the
// queue is the one slice a sign-out deliberately does not clear, because
// those words are still owed to the server. One iPad, three accounts: what
// an app reads through here must therefore be only the signed-in person's
// own writes. `selectQueue`, `selectPendingCount` and `selectReplaying` all
// are. `selectAllQueuedWrites` is not, which is why it is not on this list:
// it exists for the persist worker, whose job genuinely is the whole
// device's queue, and an app that could call it would read Teddy's unshared
// note out of Jeff's session without the server ever being involved.
import {
  actions as outboxDuckActions,
  selectors as outboxDuckSelectors,
} from "./ducks/outbox";

export const outboxActions = {
  replay: outboxDuckActions.replay,
};
export const outboxSelectors = {
  selectQueue: outboxDuckSelectors.selectQueue,
  selectPendingCount: outboxDuckSelectors.selectPendingCount,
  selectReplaying: outboxDuckSelectors.selectReplaying,
};
export type { OutboxState, QueueableAction, QueuedWrite } from "./ducks/outbox";

// The journal's public surface is narrowed the same way authActions and
// outboxActions are. `saveAthleteEntry`, `saveCoachEntry` and `setShared` are
// the three things an app ever dispatches; `athleteEntrySaved`,
// `coachEntrySaved`, `saveQueued`, `saveFailed` and the outbox reconciliation
// worker are saga-internal, dispatched only from inside the saga (or, for
// the reconciliation worker, from the outbox's own REPLAY_SUCCEEDED: see
// ducks/journal/sagas.ts). An app that could dispatch `athleteEntrySaved`
// directly could put a fabricated entry, `shared` included, into state the
// server never sent, the same reasoning Ruling 10 applied to auth.
import { actions as journalDuckActions, selectors as journalSelectors } from "./ducks/journal";

export const journalActions = {
  saveAthleteEntry: journalDuckActions.saveAthleteEntry,
  saveCoachEntry: journalDuckActions.saveCoachEntry,
  setShared: journalDuckActions.setShared,
  // The two reads a journal screen opens with. Without them the slice is
  // empty on every cold start and both journal screens have nothing to list:
  // an entry could only get into state by being saved in that same session.
  // `athleteEntriesFetched` and `coachEntriesFetched` stay off the surface
  // with the rest of the saga-internal actions, for the same reason
  // `athleteEntrySaved` does.
  fetchAthleteEntries: journalDuckActions.fetchAthleteEntries,
  fetchCoachEntries: journalDuckActions.fetchCoachEntries,
  // The delete Jeff asked for. It is a thing a person taps, so it is on the
  // surface; `entryDeleted` is not, for the same reason `athleteEntrySaved`
  // is not. An app that could dispatch `entryDeleted` could take an entry
  // out of state that the server still has, and the next fetch would put it
  // straight back with no explanation.
  deleteEntry: journalDuckActions.deleteEntry,
};
export { journalSelectors };
export type { JournalState } from "./ducks/journal";
// `JournalSide` joins the surface here for the first time, alongside the
// two payload types: `journalSelectors.selectIsEntryQueued` takes one as
// its first argument (a screen already knows whether it is the athlete or
// the coach side; this is just its name for that), so an app now has a
// real reason to name the type rather than only ever pass a bare string
// literal through.
// `DeleteEntryPayload` joins them because `journalActions.deleteEntry` takes
// one: a screen has to name the side, the date and the id of the row it is
// removing, and a mistyped object literal here would be a 404 against a
// route addressed by id rather than a compile error.
export type {
  SaveAthleteEntryPayload,
  SaveCoachEntryPayload,
  DeleteEntryPayload,
  JournalSide,
} from "./ducks/journal";
export type { CoachEntry, AthleteEntry, DrillRatingValue } from "./types";

// The test-results duck's public surface, narrowed the same way authActions,
// outboxActions and journalActions are. `fetchResults` and `saveResult` are
// the only two things an app ever dispatches: a save with an empty
// `rawValue` is how clearing a box is spelled (see ducks/testResults/actions
// .ts), so there is no separate "clear" action to expose either.
// `resultsFetched`, `resultSaved`, `resultDeleted`, `saveQueued` and
// `saveFailed` are saga-internal, dispatched only from inside the saga or
// from the outbox's own REPLAY_SUCCEEDED. An app that could dispatch
// `resultSaved` directly could put a height or a time on the board that no
// server ever recorded.
import {
  actions as testResultsDuckActions,
  selectors as testResultsSelectors,
} from "./ducks/testResults";

export const testResultsActions = {
  fetchResults: testResultsDuckActions.fetchResults,
  saveResult: testResultsDuckActions.saveResult,
};
export { testResultsSelectors };
export type { TestResultsState, SaveResultPayload } from "./ducks/testResults";
export type { TestResult, TestDate } from "./types";

// The six read ducks. Each is built by createFetchDuck (lib/createFetchDuck
// .ts), which bundles the app-facing pieces (actions.fetch, the read
// selectors) together with saga-internal ones (actions.succeeded,
// actions.failed, the raw reducer/saga/worker) in one object, because the
// store's own wiring needs all of it and an app needs only some of it.
// Re-exporting that object whole hands an app `actions.succeeded`, which is
// dispatchable and which the reducer folds straight into state with no
// server involved: `programYears.actions.succeeded({ fabricated: true })`
// would overwrite real program-year data with invented content, no
// different from an app dispatching `signInSucceeded` directly. So each of
// the six is narrowed here to the same shape authActions/outboxActions/
// journalActions/testResultsActions were: `fetch` is the one thing an app
// ever dispatches, and the three read selectors are the one thing an app
// ever reads through.
//
// `path` and `name` stay off the surface too, deliberately. They exist so
// createFetchDuck's own saga has exactly one copy of a duck's URL, and so
// rootReducer's wiring can be checked against it (see the comment on
// createFetchDuck's return value): an internal convenience for the saga
// that already runs inside this package, not something an app has any
// reason to call. An app that could read `path` and build its own request
// from it would be building a second, competing way to reach the same
// endpoint, which is the exact drift `path` exists to prevent in the first
// place.
import { programYears as programYearsDuck } from "./ducks/programYears";
import { programYear as programYearDuck } from "./ducks/programYear";
import { plan as planDuck } from "./ducks/plan";
import {
  week as weekDuck,
  selectWeek,
  selectDayByDate,
  selectWeekBudget,
  selectWeekSpend,
} from "./ducks/week";
import {
  drills as drillsDuck,
  selectDrills,
  selectDrillBySlug,
  selectDrillsMatching,
} from "./ducks/drills";
import { progression as progressionDuck } from "./ducks/progression";

export const programYears = {
  actions: { fetch: programYearsDuck.actions.fetch },
  selectors: programYearsDuck.selectors,
};
export const programYear = {
  actions: { fetch: programYearDuck.actions.fetch },
  selectors: programYearDuck.selectors,
};
export const plan = {
  actions: { fetch: planDuck.actions.fetch },
  selectors: planDuck.selectors,
};
export const week = {
  actions: { fetch: weekDuck.actions.fetch },
  selectors: weekDuck.selectors,
};
export { selectWeek, selectDayByDate, selectWeekBudget, selectWeekSpend };
export const drills = {
  actions: { fetch: drillsDuck.actions.fetch },
  selectors: drillsDuck.selectors,
};
export { selectDrills, selectDrillBySlug, selectDrillsMatching };
export const progression = {
  actions: { fetch: progressionDuck.actions.fetch },
  selectors: progressionDuck.selectors,
};

export type {
  ProgramYearSummary,
  ProgramYearDetail,
  MonthPlan,
  Week as WeekPayload,
  DayCard,
  DayBlock,
  Token,
  Drill,
  Progression as ProgressionPayload,
} from "./types";

// Typed react-redux hooks. useAppSelector and useAppDispatch are the only
// way either app should touch the store's dispatch and state types; both
// are thin wrappers, typed against RootState and this store's own dispatch,
// so neither app writes its own copy of that typing (or its own untyped
// useSelector/useDispatch, which is the thing this file exists to prevent).
export { useAppSelector, useAppDispatch } from "./store/hooks";
export type { AppDispatch } from "./store/hooks";
