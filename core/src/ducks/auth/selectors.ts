import type { AuthState } from "./reducer";

interface WithAuth {
  auth: AuthState;
}

export const selectToken = (s: WithAuth) => s.auth.token;
export const selectUser = (s: WithAuth) => s.auth.user;
export const selectRole = (s: WithAuth) => s.auth.user?.role ?? null;
export const selectIsSignedIn = (s: WithAuth) => s.auth.status === "signedIn";
export const selectAuthError = (s: WithAuth) => s.auth.error;
export const selectAuthStatus = (s: WithAuth) => s.auth.status;
