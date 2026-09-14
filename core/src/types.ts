// Shared request/response shapes for the API client. Kept apart from
// apiClient.ts so a duck can describe the request it wants to make without
// importing the client's implementation.

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequest {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  // Absent or null means "no token": no Authorization header goes out.
  token?: string | null;
}

// The API's error envelope, exactly as the deployed server sends it:
// {"error":{"code":"...","message":"..."}}
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}
