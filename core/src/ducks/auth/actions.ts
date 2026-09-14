import * as t from "./actionTypes";
import type { Athlete, LoginResponse, MeResponse, User } from "../../types";

export const signIn = (credentials: { email: string; password: string }) =>
  ({ type: t.SIGN_IN, payload: credentials }) as const;

export const signInSucceeded = (response: LoginResponse) =>
  ({ type: t.SIGN_IN_SUCCEEDED, payload: response }) as const;

export const signInFailed = (message: string) =>
  ({ type: t.SIGN_IN_FAILED, payload: message }) as const;

export const signOut = () => ({ type: t.SIGN_OUT }) as const;

export const restoreSession = () => ({ type: t.RESTORE_SESSION }) as const;

// Carries what /me confirmed for this token, not just what storage held:
// `user` is /me's own copy (a name or email changed elsewhere is picked up
// here rather than stale), and `athlete` / `current_program_year_id` are
// the whole reason this call exists. A restore that resolved without ever
// reaching /me (offline, a cold server) still uses this action, with
// `athlete` and `current_program_year_id` set to null: the cached user is
// good enough to render the app, and the two fields nothing could confirm
// stay unknown rather than invented.
export const restoreFinished = (
  session: {
    jwt: string;
    user: User;
    athlete: Athlete | null;
    current_program_year_id: number | null;
  } | null,
) => ({ type: t.RESTORE_FINISHED, payload: session }) as const;

export const sessionExpired = () => ({ type: t.SESSION_EXPIRED }) as const;

// Dispatched only after a sign-in has already reported success: this fills
// in athlete and current_program_year_id on a session that is signed in
// either way. Never dispatched for a restore, which folds the same /me
// result into restoreFinished instead, because restore does not report
// signed-in until /me has answered.
export const meSucceeded = (me: MeResponse) => ({ type: t.ME_SUCCEEDED, payload: me }) as const;

export type AuthAction =
  | ReturnType<typeof signIn>
  | ReturnType<typeof signInSucceeded>
  | ReturnType<typeof signInFailed>
  | ReturnType<typeof signOut>
  | ReturnType<typeof restoreSession>
  | ReturnType<typeof restoreFinished>
  | ReturnType<typeof sessionExpired>
  | ReturnType<typeof meSucceeded>;
