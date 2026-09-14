import * as t from "./actionTypes";
import type { AuthAction } from "./actions";
import type { User } from "../../types";

export interface AuthState {
  status: "anonymous" | "restoring" | "signingIn" | "signedIn";
  user: User | null;
  token: string | null;
  error: string | null;
}

const initialState: AuthState = {
  status: "anonymous",
  user: null,
  token: null,
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
      return { status: "signedIn", user, token: jwt, error: null };
    }
    case t.SIGN_IN_FAILED:
      return {
        status: "anonymous",
        user: null,
        token: null,
        error: (action as Extract<AuthAction, { type: typeof t.SIGN_IN_FAILED }>).payload,
      };
    case t.RESTORE_SESSION:
      return { ...state, status: "restoring" };
    case t.RESTORE_FINISHED: {
      const session = (action as Extract<AuthAction, { type: typeof t.RESTORE_FINISHED }>)
        .payload;
      if (!session) return initialState;
      return { status: "signedIn", user: session.user, token: session.jwt, error: null };
    }
    case t.SESSION_EXPIRED:
      return {
        status: "anonymous",
        user: null,
        token: null,
        error: "You were signed out. Sign in again.",
      };
    case t.SIGN_OUT:
      return initialState;
    default:
      return state;
  }
}
