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
// Both come from /api/v1/me and both apps need them: the Year screen no
// longer has to fetch the whole program-years list and pick out the one
// marked current just to learn its id.
export const selectAthlete = (s: WithAuth) => s.auth.athlete;
export const selectCurrentProgramYearId = (s: WithAuth) => s.auth.currentProgramYearId;
