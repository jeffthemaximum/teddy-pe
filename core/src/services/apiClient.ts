import type { CoreConfig } from "../config";
import type { ApiErrorEnvelope, ApiRequest } from "../types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

function hasName(e: unknown, name: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    (e as { name: unknown }).name === name
  );
}

export async function apiRequest<T>(
  config: CoreConfig,
  req: ApiRequest,
): Promise<T> {
  const controller = new AbortController();
  // 15000ms comes from config, never a shorter local constant. A cold Fly
  // machine with a suspended Neon branch measured 6.6 to 7.6 seconds; a
  // shorter timeout fails a request that was working correctly.
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  // No token means no header at all. An empty "Bearer " reads as a
  // credential and is not one.
  if (req.token) headers.Authorization = `Bearer ${req.token}`;

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${req.path}`, {
      method: req.method ?? "GET",
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    // The abort signal rejects fetch with a DOMException, which does not
    // extend Error in every runtime, so this checks .name rather than
    // `instanceof Error`.
    if (hasName(e, "AbortError")) {
      throw new ApiError(0, "timeout", "That took too long. Try again.");
    }
    throw new ApiError(
      0,
      "offline",
      "No connection. Check the network and try again.",
    );
  }
  clearTimeout(timer);

  // Read as text first, not response.json() directly, so an empty body (a
  // 204 delete, most often) can be told apart from a body that is actually
  // broken. response.json() rejects on both, which is exactly the bug: a
  // successful, empty delete looked identical to a sleeping proxy handing
  // back garbage.
  // A mocked Response in a test must implement .text(), not .json(): a
  // fixture with only .json() fails here with "text is not a function",
  // which reads as a bug in this client rather than in the fixture.
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiError(
      response.status,
      "unreadable_response",
      "Something went wrong. Try again.",
    );
  }

  let body: unknown;
  if (text === "") {
    // Nothing to parse and nothing wrong. Resolves to undefined rather than
    // null: T is whatever the caller declared for a body-less response (void
    // most often), and `undefined` is what "there is no value" already means
    // in TypeScript, so callers don't need a null check they wouldn't
    // otherwise have.
    if (response.ok) {
      return undefined as T;
    }
    // An error status with an empty body has no envelope to unwrap. Leave
    // body empty and fall through to the same fallback code and message an
    // unparseable error body gets below.
  } else {
    try {
      body = JSON.parse(text);
    } catch {
      // A proxy 502 or a sleeping server can hand back HTML instead of JSON.
      // Whether or not response.ok is true, there is nothing usable to
      // parse, so there is exactly one way to fail here, not two.
      throw new ApiError(
        response.status,
        "unreadable_response",
        "Something went wrong. Try again.",
      );
    }
  }

  if (!response.ok) {
    const envelope = (body as Partial<ApiErrorEnvelope>)?.error;
    throw new ApiError(
      response.status,
      envelope?.code ?? "unreadable_response",
      envelope?.message ?? "Something went wrong. Try again.",
    );
  }

  return body as T;
}
