import * as t from "./actionTypes";
import type { AuthAction } from "./actions";
import type { Athlete, User } from "../../types";

export interface AuthState {
  status: "anonymous" | "restoring" | "signingIn" | "signedIn";
  user: User | null;
  token: string | null;
  // Neither is known the moment sign-in reports success; both come from
  // /api/v1/me, which is fetched in the background rather than waited on
  // (see sagas.ts). null means "not fetched yet or /me could not say",
  // never "confirmed absent" — Athlete itself is nullable for that.
  athlete: Athlete | null;
  currentProgramYearId: number | null;
  error: string | null;
}

const initialState: AuthState = {
  status: "anonymous",
  user: null,
  token: null,
  athlete: null,
  currentProgramYearId: null,
  error: null,
};

export function reducer(
  state: AuthState = initialState,
  action: AuthAction | { type: string },
): AuthState {
  switch (action.type) {
    case t.SIGN_IN:
      return { ...state, status: "signingIn", error: null };
    case t.SIGN_IN_SUCCEEDED: {
      const { jwt, user } = (action as Extract<AuthAction, { type: typeof t.SIGN_IN_SUCCEEDED }>)
        .payload;
      // athlete and currentProgramYearId start null here on purpose: they
      // are not in a login response, only in /me's, and this state must
      // read as signed-in before that background fetch has any chance to
      // land (see the sign-in saga's own comment on why it does not wait).
      return {
        status: "signedIn",
        user,
        token: jwt,
        athlete: null,
        currentProgramYearId: null,
        error: null,
      };
    }
    case t.SIGN_IN_FAILED:
      return {
        status: "anonymous",
        user: null,
        token: null,
        athlete: null,
        currentProgramYearId: null,
        error: (action as Extract<AuthAction, { type: typeof t.SIGN_IN_FAILED }>).payload,
      };
    case t.RESTORE_SESSION:
      return { ...state, status: "restoring" };
    case t.RESTORE_FINISHED: {
      const session = (action as Extract<AuthAction, { type: typeof t.RESTORE_FINISHED }>)
        .payload;
      if (!session) return initialState;
      return {
        status: "signedIn",
        user: session.user,
        token: session.jwt,
        athlete: session.athlete,
        currentProgramYearId: session.current_program_year_id,
        error: null,
      };
    }
    case t.ME_SUCCEEDED: {
      // Only ever dispatched after SIGN_IN_SUCCEEDED (restore folds the
      // same /me result into RESTORE_FINISHED instead, above). The guard is
      // for the race where a sign-out lands before this background fetch
      // resolves: applying a late /me answer on top of whatever SIGN_OUT
      // already cleared would revive a session that was deliberately ended.
      if (state.status !== "signedIn") return state;
      const me = (action as Extract<AuthAction, { type: typeof t.ME_SUCCEEDED }>).payload;
      return {
        ...state,
        user: me.user,
        athlete: me.athlete,
        currentProgramYearId: me.current_program_year_id,
      };
    }
    case t.SESSION_EXPIRED:
      return {
        status: "anonymous",
        user: null,
        token: null,
        athlete: null,
        currentProgramYearId: null,
        error: "You were signed out. Sign in again.",
      };
    case t.SIGN_OUT:
      return initialState;
    default:
      return state;
  }
}
