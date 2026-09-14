import { combineReducers } from "@reduxjs/toolkit";
import { reducer as auth } from "../ducks/auth";
import { SIGN_OUT, SESSION_EXPIRED } from "../ducks/auth/actionTypes";
import { reducer as outbox } from "../ducks/outbox";
import { reducer as journal } from "../ducks/journal";
import { reducer as testResults } from "../ducks/testResults";
import { programYears } from "../ducks/programYears";
import { programYear } from "../ducks/programYear";
import { plan } from "../ducks/plan";
import { week } from "../ducks/week";
import { drills } from "../ducks/drills";
import { progression } from "../ducks/progression";

const combined = combineReducers({
  auth,
  outbox,
  journal,
  testResults,
  programYears: programYears.reducer,
  programYear: programYear.reducer,
  plan: plan.reducer,
  week: week.reducer,
  drills: drills.reducer,
  progression: progression.reducer,
});

export type RootState = ReturnType<typeof combined>;

// Every slice's own initial value, computed once. This is what a sign-out
// resets the store back to, short of the two exceptions below.
const initialRootState = combined(undefined, { type: "@@core/INIT" });

// Teddy wrote something in the journal and did not share it. The Rails API,
// the payloads, the docs export and the journal reducer all honour that,
// and none of it matters if his words are still sitting in Redux after he
// signs out and Jeff signs in on the same iPad. The journal duck used to
// clear itself on auth/SIGN_OUT and auth/SESSION_EXPIRED as a stopgap; this
// is that made a property of the store instead of one duck's discipline, so
// the next duck that holds something sensitive does not have to remember to
// do it too.
//
// Two slices are deliberately left out of the reset:
//
// - `outbox`: a write queued because the app was offline, or the token
//   died mid-save, is owed to the server regardless of who is signed in
//   when it finally goes out. Signing out must not throw away words Teddy
//   already typed and is still waiting to send.
// - `auth`: its own reducer already decides what these two actions do to
//   it, and the two decisions differ. SESSION_EXPIRED sets "You were
//   signed out. Sign in again." so the sign-in screen can explain itself;
//   resetting auth to its bare initial state here too would erase that
//   message right after auth's own reducer set it.
export function rootReducer(state: RootState | undefined, action: { type: string }): RootState {
  const next = combined(state, action);
  if (action.type === SIGN_OUT || action.type === SESSION_EXPIRED) {
    return { ...initialRootState, auth: next.auth, outbox: next.outbox };
  }
  return next;
}
