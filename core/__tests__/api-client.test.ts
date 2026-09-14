import { apiRequest, ApiError, isUnauthorized } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";

const config = {
  baseUrl: "https://api.test",
  storage: memoryStorage(),
  logger: silentLogger,
  timeoutMs: 15000,
};

function respond(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
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

  it("still produces a usable error when the body is not the envelope", async () => {
    // A proxy 502 is HTML, and a caller that crashes on it looks like a bug in
    // the app rather than a sleeping server.
    jest.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        status: 502,
        ok: false,
        json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      } as unknown as Response),
    );

    const err = await apiRequest<never>(config, { path: "/api/v1/me" }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("unreadable_response");
    expect(isUnauthorized(err)).toBe(false);
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
});
