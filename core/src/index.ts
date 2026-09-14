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
// allowed to dispatch. signInSucceeded, signInFailed and restoreFinished are
// dispatched only by the saga: an app that could dispatch signInSucceeded
// itself could put the store in a signed-in state holding a token the server
// never issued.
import { actions as authDuckActions, selectors as authSelectors } from "./ducks/auth";

export const authActions = {
  signIn: authDuckActions.signIn,
  signOut: authDuckActions.signOut,
  restoreSession: authDuckActions.restoreSession,
};
export { authSelectors };
export type { AuthState } from "./ducks/auth";
export type { User, Role, LoginResponse } from "./types";

// The outbox's public surface is deliberately narrow, the same reasoning as
// authActions above: `replay()` is the only action an app ever dispatches
// (when connectivity is believed to be back). enqueue, replaySucceeded,
// replayFailed and queueRestored are saga- and duck-internal; a duck that
// wants to queue a write (journal, test results) enqueues through its own
// sibling import of ducks/outbox, not through this surface, because building
// a QueueableAction (dedupeKey, request) is that duck's job, not an app's.
import { actions as outboxDuckActions, selectors as outboxSelectors } from "./ducks/outbox";

export const outboxActions = {
  replay: outboxDuckActions.replay,
};
export { outboxSelectors };
export type { OutboxState, QueueableAction, QueuedWrite } from "./ducks/outbox";

// The journal's public surface is narrowed the same way authActions and
// outboxActions are. `saveAthleteEntry`, `saveCoachEntry` and `setShared` are
// the three things an app ever dispatches; `athleteEntrySaved`,
// `coachEntrySaved`, `saveQueued`, `saveFailed` and the outbox reconciliation
// worker are saga-internal, dispatched only from inside the saga (or, for
// the reconciliation worker, from the outbox's own REPLAY_SUCCEEDED — see
// ducks/journal/sagas.ts). An app that could dispatch `athleteEntrySaved`
// directly could put a fabricated entry, `shared` included, into state the
// server never sent — the same reasoning Ruling 10 applied to auth.
import { actions as journalDuckActions, selectors as journalSelectors } from "./ducks/journal";

export const journalActions = {
  saveAthleteEntry: journalDuckActions.saveAthleteEntry,
  saveCoachEntry: journalDuckActions.saveCoachEntry,
  setShared: journalDuckActions.setShared,
};
export { journalSelectors };
export type { JournalState } from "./ducks/journal";
export type { CoachEntry, AthleteEntry, DrillRatingValue } from "./types";

// The six read ducks. Each is already wired into the store by
// rootReducer/rootSaga; an app dispatches `<duck>.actions.fetch(...)` and
// reads through `<duck>.selectors` or the derived selectors below.
export { programYears } from "./ducks/programYears";
export { programYear } from "./ducks/programYear";
export { plan } from "./ducks/plan";
export { week, selectWeek, selectDayByDate, selectWeekBudget, selectWeekSpend } from "./ducks/week";
export { drills, selectDrills, selectDrillBySlug, selectDrillsMatching } from "./ducks/drills";
export { progression } from "./ducks/progression";

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
