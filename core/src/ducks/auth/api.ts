import { apiRequest } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { LoginResponse } from "../../types";

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
