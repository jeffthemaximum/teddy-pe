import { apiRequest } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { LoginResponse, MeResponse } from "../../types";

// One key, one shape. Both apps read this, so it is named here rather than in
// either of them.
export const SESSION_KEY = "teddy-pe.session";

export function login(config: CoreConfig, credentials: { email: string; password: string }) {
  return apiRequest<LoginResponse>(config, {
    path: "/api/v1/auth/login",
    method: "POST",
    body: credentials,
  });
}

// GET /api/v1/me: who a token is actually signed in as, per the server, not
// per whatever a login response or storage said a moment ago. `token` is a
// parameter rather than read from config, because both call sites (a fresh
// login response, a session just parsed out of storage) hold a token this
// call has not yet confirmed is good for anything.
export function fetchMe(config: CoreConfig, token: string) {
  return apiRequest<MeResponse>(config, { path: "/api/v1/me", token });
}
