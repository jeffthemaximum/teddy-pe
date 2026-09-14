import * as t from "./actionTypes";
import type { LoginResponse, User } from "../../types";

export const signIn = (credentials: { email: string; password: string }) =>
  ({ type: t.SIGN_IN, payload: credentials }) as const;

export const signInSucceeded = (response: LoginResponse) =>
  ({ type: t.SIGN_IN_SUCCEEDED, payload: response }) as const;

export const signInFailed = (message: string) =>
  ({ type: t.SIGN_IN_FAILED, payload: message }) as const;

export const signOut = () => ({ type: t.SIGN_OUT }) as const;

export const restoreSession = () => ({ type: t.RESTORE_SESSION }) as const;

export const restoreFinished = (session: { jwt: string; user: User } | null) =>
  ({ type: t.RESTORE_FINISHED, payload: session }) as const;

export const sessionExpired = () => ({ type: t.SESSION_EXPIRED }) as const;

export type AuthAction =
  | ReturnType<typeof signIn>
  | ReturnType<typeof signInSucceeded>
  | ReturnType<typeof signInFailed>
  | ReturnType<typeof signOut>
  | ReturnType<typeof restoreSession>
  | ReturnType<typeof restoreFinished>
  | ReturnType<typeof sessionExpired>;
