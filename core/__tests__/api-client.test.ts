import { apiRequest, ApiError, isUnauthorized } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";

const config = {
  baseUrl: "https://api.test",
  storage: memoryStorage(),
  logger: silentLogger,
  timeoutMs: 15000,
};

// The client reads response.text() rather than response.json(), so it can
// tell an empty body (a 204 delete) apart from a body that is actually
// broken. These mocks match that: text() is the one method every case here
// needs.
function respond(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function respondWithText(status: number, text: string) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(text),
  } as Response);
}

describe("apiRequest", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends the bearer token when there is one", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => respond(200, { ok: true }));

    await apiRequest(config, { path: "/api/v1/me", token: "abc.def.ghi" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.test/api/v1/me");
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer abc.def.ghi",
    );
  });

  it("sends no Authorization header at all when there is no token", async () => {
    // An empty "Bearer " is a header that looks like credentials and is not.
    // Login must send nothing rather than something meaningless.
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => respond(200, { jwt: "x" }));

    await apiRequest(config, { path: "/api/v1/auth/login", method: "POST", body: {} });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(Object.keys(init!.headers as object)).not.toContain("Authorization");
  });

  it("unwraps the API's error envelope into an ApiError", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation(() =>
      respond(401, {
        error: { code: "unauthorized", message: "Invalid or missing token." },
      }),
    );

    // <never>: this call is only ever expected to reject in this test. Without
    // a type argument here, TS infers apiRequest's success type as `unknown`,
    // and `unknown` survives `.catch((e) => e)` untouched, so `err` below
    // would be typed `unknown` and every property access would fail to
    // compile. <never> is a compile-time hint only; it asserts nothing about
    // runtime behavior, which the assertions below still do.
    const err = await apiRequest<never>(config, { path: "/api/v1/me" }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthorized");
    expect(err.message).toBe("Invalid or missing token.");
    expect(isUnauthorized(err)).toBe(true);
  });

  it("falls back to unreadable_response when the error body is valid JSON but not the envelope", async () => {
    // A CDN or proxy in front of the API can return its own JSON body (a
    // load balancer's "Bad Gateway" object, say) that parses fine but has no
    // "error" key to unwrap. This must still produce a usable ApiError
    // rather than crash on `envelope.code`.
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => respond(502, { message: "Bad Gateway" }));

    const err = await apiRequest<never>(config, { path: "/api/v1/me" }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("unreadable_response");
    expect(isUnauthorized(err)).toBe(false);
  });

  it("still produces a usable error when a successful response's body cannot be parsed at all", async () => {
    // A sleeping server or a misconfigured proxy can answer a 200 with HTML
    // instead of JSON. response.ok being true must not make this look like
    // a successful, empty response: there is a body here, and it is broken.
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => respondWithText(200, "<html>not json</html>"));

    const err = await apiRequest<never>(config, { path: "/api/v1/me" }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(200);
    expect(err.code).toBe("unreadable_response");
  });

  it("resolves rather than throws on a successful response with an empty body", async () => {
    // The API answers a delete with a 204 and nothing else. response.text()
    // resolving to "" is not a parse failure: there was never a body to
    // parse, and the request still succeeded.
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => respondWithText(204, ""));

    const result = await apiRequest(config, {
      path: "/api/v1/journal/1",
      method: "DELETE",
    });

    expect(result).toBeUndefined();
  });

  it("gives up after the configured timeout and says so", async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          (init as RequestInit).signal?.addEventListener("abort", () =>
            rej(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const pending = apiRequest<never>(
      { ...config, timeoutMs: 15000 },
      { path: "/api/v1/me" },
    );
    const settled = pending.catch((e) => e);
    jest.advanceTimersByTime(15001);
    const err = await settled;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("timeout");
    jest.useRealTimers();
  });

  it("reports a genuine network failure as offline, not timeout", async () => {
    // The way a dead connection actually presents to fetch: a plain
    // rejection with no AbortError, no abort signal ever firing. An
    // implementation that mapped every fetch rejection to "timeout" would
    // still pass the timeout test above; this is the case that catches it.
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));

    const err = await apiRequest<never>(config, { path: "/api/v1/me" }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("offline");
  });
});
