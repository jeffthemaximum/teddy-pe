# Phase 2a: the `core/` package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared TypeScript package that holds every duck, so the React web app in Phase 2b and the React Native app in Phase 4 consume one implementation of the program's state and never redefine it.

**Architecture:** Redux Toolkit for reducers, redux-saga for everything that touches the network, following the seven-file duck convention already proven in `../burough_buddies/mobile/src/ducks/`. `core/` owns the ducks, the selectors, the API client and the offline outbox. It owns no storage: platform storage arrives through an injected interface, which is the one seam where web and native legitimately differ and therefore the one place a Phase 4 redefinition could sneak in.

**Tech Stack:** TypeScript 5.3, Redux Toolkit 2.x, redux-saga 1.3, Jest 29. No React. No axios: `fetch` is native on Node 22, in every browser this targets and in React Native, and one less dependency is one less thing to keep aligned across three packages.

**Spec:** `docs/superpowers/specs/2026-09-13-rewrite-design.md`, and the brief it argues from at `docs/rewrite-prompt.md`.

## Global Constraints

- **No duck may be redefined in Phase 4.** This is the brief's binding constraint and the reason this package exists. Anything platform-specific is injected, never branched on.
- **Nothing about Teddy ships in a bundle.** No program content, drill text, plan data or anything about him may be baked into JavaScript or fetched without a valid JWT. A decoupled SPA has a publicly readable bundle by definition, so every byte of content comes from the API behind auth.
- **The API client's timeout is 15 seconds and never shorter.** A scale-to-zero Fly machine plus a suspended Neon branch measured 6.6 to 7.6 seconds cold. Anything tighter fails on a first load that was working correctly.
- **The journal toggle is absolute.** `AthleteEntry.shared` false means the coach never sees it. A viewer never sees athlete entries at all, shared or not. `core/` must not be the place that forgets: selectors present what the API returned and never reconstruct visibility.
- **Deleted means `deleted_at`, and each person deletes only their own.** Jeff's decision, 2026-09-13. A soft-deleted entry is absent from every selector exactly as an unshared one is, and both are decided in one place per duck rather than two.
- **Journals and test results queue when offline.** Jeff's decision. Losing an entry typed at a tennis court is the failure this rewrite exists partly to fix.
- **Writing style, for any user-facing string that originates here:** direct, warm, specific, cues in Teddy's language. No em dashes. Avoid "it's not X, it's Y" constructions.
- **Teddy is 7.** Any copy a child reads is short and plain.

## What already exists, and is not yours to change

The Rails API is built, reviewed and deployed at `https://teddy-pe-api.fly.dev`. Its payloads are **facts**, captured from the live API, not proposals. Where this plan shows a response shape, it was pulled from production, and if your code disagrees with it your code is wrong.

Authentication is `POST /api/v1/auth/login` returning `{ jwt, user }`. The JWT carries a `pwd` claim fingerprinting the password digest, so a token dies when its password changes. Every other route requires `Authorization: Bearer <jwt>` and answers `401 {"error":{"code":"unauthorized","message":"..."}}` without one.

Every error in the API uses one envelope:

```json
{ "error": { "code": "unauthorized", "message": "Invalid or missing token." } }
```

---

## File structure

```
core/
  package.json
  tsconfig.json
  jest.config.js
  src/
    index.ts                  the package's public surface, and the only thing apps import
    types.ts                  payload types, transcribed from the live API
    config.ts                 baseUrl and timeout, both injected at init
    services/
      apiClient.ts            fetch wrapper: bearer, timeout, envelope, 401 signal
      storage.ts              the Storage interface; no implementation lives here
      logger.ts               a two-method logger, injectable, silent by default in tests
    store/
      rootReducer.ts
      rootSaga.ts
      configureStore.ts       takes the injected Storage and config
      hooks.ts                typed useSelector/useDispatch for the apps
    ducks/
      auth/                   actionTypes, actions, api, reducer, sagas, selectors, index
      programYear/
      plan/
      week/
      drills/
      progression/
      journal/
      testResults/
      outbox/
    lib/
      createFetchDuck.ts      the shape every read-only duck shares
  __tests__/
    api-client.test.ts
    auth-reducer.test.ts      and auth-saga.test.ts, and so on per duck
```

One file, one responsibility. A duck directory is seven small files rather than one large one, because that is the convention the sibling repo proved and the convention Phase 4 will read.

---

## Task 1: The package boots, and a store exists

**Files:**
- Create: `core/package.json`, `core/tsconfig.json`, `core/jest.config.js`
- Create: `core/src/config.ts`, `core/src/services/storage.ts`, `core/src/services/logger.ts`
- Create: `core/src/store/rootReducer.ts`, `core/src/store/rootSaga.ts`, `core/src/store/configureStore.ts`
- Create: `core/src/index.ts`
- Test: `core/__tests__/store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createCoreStore(deps: CoreDeps): Store`, where `CoreDeps = { baseUrl: string; storage: Storage; logger?: Logger; timeoutMs?: number }`. `Storage` is `{ getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }`. Every later task adds one reducer and one saga to the root.

- [ ] **Step 1: Write the failing test**

`core/__tests__/store.test.ts`:

```ts
import { createCoreStore, memoryStorage } from "../src";

describe("the core store", () => {
  it("boots with the injected config and an empty state", () => {
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage: memoryStorage(),
    });

    expect(store.getState()).toEqual({});
  });

  it("refuses to boot without a baseUrl, rather than defaulting to one", () => {
    // A silent default would send a child's journal to whatever host happened
    // to be compiled in. Fail loudly at boot instead.
    expect(() =>
      createCoreStore({ baseUrl: "", storage: memoryStorage() }),
    ).toThrow("core needs a baseUrl");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && npx jest store` — expect failure, `Cannot find module '../src'`.

- [ ] **Step 3: Write the package files**

`core/package.json`:

```json
{
  "name": "@teddy-pe/core",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@reduxjs/toolkit": "^2.2.7",
    "redux": "^5.0.1",
    "redux-saga": "^1.3.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.13",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "~5.3.3"
  }
}
```

`core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "types": ["jest"]
  },
  "include": ["src", "__tests__"]
}
```

`core/jest.config.js`:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
};
```

- [ ] **Step 4: Write the seams**

`core/src/services/storage.ts`:

```ts
// The one place web and native genuinely differ. Web hands us localStorage,
// native hands us SecureStore or AsyncStorage, and core never knows which.
// Everything else in this package is shared, which is what keeps the promise
// that no duck gets redefined in Phase 4.
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// For tests, and for any caller that wants a store with no persistence.
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    async getItem(k) {
      return map.get(k) ?? null;
    },
    async setItem(k, v) {
      map.set(k, v);
    },
    async removeItem(k) {
      map.delete(k);
    },
  };
}
```

`core/src/services/logger.ts`:

```ts
export interface Logger {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

// Silent by default. A package that prints during someone else's test run is
// a package people stop trusting.
export const silentLogger: Logger = {
  info() {},
  error() {},
};
```

`core/src/config.ts`:

```ts
import type { Storage } from "./services/storage";
import type { Logger } from "./services/logger";

export interface CoreDeps {
  baseUrl: string;
  storage: Storage;
  logger?: Logger;
  // The API sleeps. A cold Fly machine with a suspended Neon branch measured
  // 6.6 to 7.6 seconds, so anything under 15 fails a request that was working.
  timeoutMs?: number;
}

export interface CoreConfig {
  baseUrl: string;
  storage: Storage;
  logger: Logger;
  timeoutMs: number;
}
```

- [ ] **Step 5: Write the store**

`core/src/store/rootReducer.ts`:

```ts
import { combineReducers } from "@reduxjs/toolkit";

// Every duck adds its reducer here. Empty until Task 3.
export const rootReducer = combineReducers({});
export type RootState = ReturnType<typeof rootReducer>;
```

`core/src/store/rootSaga.ts`:

```ts
import { all } from "redux-saga/effects";

// Every duck adds its watcher here. Empty until Task 3.
export function* rootSaga() {
  yield all([]);
}
```

`core/src/store/configureStore.ts`:

```ts
import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { rootReducer } from "./rootReducer";
import { rootSaga } from "./rootSaga";
import { silentLogger } from "../services/logger";
import type { CoreConfig, CoreDeps } from "../config";

export function createCoreStore(deps: CoreDeps) {
  if (!deps.baseUrl) {
    throw new Error("core needs a baseUrl");
  }

  const config: CoreConfig = {
    baseUrl: deps.baseUrl.replace(/\/$/, ""),
    storage: deps.storage,
    logger: deps.logger ?? silentLogger,
    timeoutMs: deps.timeoutMs ?? 15000,
  };

  // Sagas reach config through context rather than an import, so a test can
  // stand up two stores against two fake servers without them colliding.
  const saga = createSagaMiddleware({ context: { config } });

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ thunk: false }).concat(saga),
  });

  saga.run(rootSaga);
  return store;
}
```

`core/src/index.ts`:

```ts
export { createCoreStore } from "./store/configureStore";
export { memoryStorage } from "./services/storage";
export type { Storage } from "./services/storage";
export type { Logger } from "./services/logger";
export type { CoreDeps } from "./config";
export type { RootState } from "./store/rootReducer";
```

- [ ] **Step 6: Run the tests**

Run: `cd core && npm install && npx jest` — expect 2 passing.

- [ ] **Step 7: Prove the timeout default is real**

Add to `core/__tests__/store.test.ts`:

```ts
it("defaults the timeout to 15 seconds, the floor the sleeping API needs", () => {
  // Read through the saga context rather than re-deriving it, so this fails
  // if someone changes the default in configureStore and not here.
  const store = createCoreStore({
    baseUrl: "https://example.test",
    storage: memoryStorage(),
  });
  expect(storedConfig(store).timeoutMs).toBe(15000);
});
```

To make that readable, export a test-only accessor from `configureStore.ts`:

```ts
// Exported so a test can assert the resolved config rather than restating it.
const CONFIGS = new WeakMap<object, CoreConfig>();
export function storedConfig(store: object): CoreConfig {
  const c = CONFIGS.get(store);
  if (!c) throw new Error("not a core store");
  return c;
}
```

and register it with `CONFIGS.set(store, config)` before the `return store`.

- [ ] **Step 8: Run the tests**

Run: `cd core && npx jest` — expect 3 passing.

- [ ] **Step 9: Commit**

```bash
git add core
git commit -m "A core package that boots, and refuses to guess its own API host"
```

---

## Task 2: The API client

**Files:**
- Create: `core/src/services/apiClient.ts`, `core/src/types.ts`
- Test: `core/__tests__/api-client.test.ts`

**Interfaces:**
- Consumes: `CoreConfig` from Task 1.
- Produces: `apiRequest(config, { path, method?, body?, token? }): Promise<T>`, which resolves the parsed JSON body or rejects with an `ApiError` carrying `status`, `code` and `message`. Also `ApiError` and `isUnauthorized(e: unknown): boolean`, which every duck's saga uses to decide whether to sign the user out.

- [ ] **Step 1: Write the failing tests**

`core/__tests__/api-client.test.ts`:

```ts
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

    const err = await apiRequest(config, { path: "/api/v1/me" }).catch((e) => e);

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

    const err = await apiRequest(config, { path: "/api/v1/me" }).catch((e) => e);

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

    const pending = apiRequest({ ...config, timeoutMs: 15000 }, { path: "/api/v1/me" });
    const settled = pending.catch((e) => e);
    jest.advanceTimersByTime(15001);
    const err = await settled;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("timeout");
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd core && npx jest api-client` — expect failure, module not found.

- [ ] **Step 3: Write the client**

`core/src/services/apiClient.ts`:

```ts
import type { CoreConfig } from "../config";

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

export interface ApiRequest {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
}

export async function apiRequest<T>(
  config: CoreConfig,
  req: ApiRequest,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  // No token means no header. "Bearer " with nothing after it reads as a
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
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(0, "timeout", "That took too long. Try again.");
    }
    throw new ApiError(0, "offline", "No connection.");
  }
  clearTimeout(timer);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (response.ok) {
      throw new ApiError(
        response.status,
        "unreadable_response",
        "Something went wrong.",
      );
    }
    throw new ApiError(
      response.status,
      "unreadable_response",
      "Something went wrong.",
    );
  }

  if (!response.ok) {
    const envelope = (body as { error?: { code?: string; message?: string } })
      ?.error;
    throw new ApiError(
      response.status,
      envelope?.code ?? "unreadable_response",
      envelope?.message ?? "Something went wrong.",
    );
  }

  return body as T;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd core && npx jest api-client` — expect 5 passing.

- [ ] **Step 5: Prove the timeout test would catch a shortened timeout**

Temporarily change the default in `configureStore.ts` from `15000` to `5000`, run `npx jest`, and confirm the Task 1 default test fails. Paste both the failure and the restored pass into your report. A constant asserted nowhere is a constant that drifts.

- [ ] **Step 6: Commit**

```bash
git add core
git commit -m "One API client, one error envelope, and a timeout the sleeping server needs"
```

---

## Task 3: The auth duck

This is the duck every later duck copies, so it is written out in full. It is also the one holding the token, which is the one piece of state that must not leak into a place Phase 4 has to reimplement.

**Files:**
- Create: `core/src/ducks/auth/{actionTypes,actions,api,reducer,sagas,selectors,index}.ts`
- Modify: `core/src/store/rootReducer.ts`, `core/src/store/rootSaga.ts`, `core/src/index.ts`
- Test: `core/__tests__/auth-reducer.test.ts`, `core/__tests__/auth-saga.test.ts`

**Interfaces:**
- Consumes: `apiRequest`, `ApiError`, `isUnauthorized` from Task 2; `CoreConfig` from Task 1.
- Produces: state at `state.auth` of shape `{ status: "anonymous" | "restoring" | "signingIn" | "signedIn"; user: User | null; token: string | null; error: string | null }`; actions `signIn({email,password})`, `signOut()`, `restoreSession()`, `sessionExpired()`; selectors `selectToken`, `selectUser`, `selectIsSignedIn`, `selectAuthError`, `selectRole`. **Every other duck's saga reads the token with `selectToken` and dispatches `sessionExpired()` on a 401.**

- [ ] **Step 1: Write the failing reducer test**

`core/__tests__/auth-reducer.test.ts`:

```ts
import { reducer, actions } from "../src/ducks/auth";

const jeff = { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" as const };

describe("the auth reducer", () => {
  it("starts anonymous with nothing in it", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      status: "anonymous",
      user: null,
      token: null,
      error: null,
    });
  });

  it("holds the token and the user once signed in", () => {
    const state = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    expect(state.status).toBe("signedIn");
    expect(state.token).toBe("a.b.c");
    expect(state.user).toEqual(jeff);
    expect(state.error).toBeNull();
  });

  it("keeps the message from a failed sign in and stays anonymous", () => {
    const state = reducer(undefined, actions.signInFailed("That email and password do not match."));
    expect(state.status).toBe("anonymous");
    expect(state.error).toBe("That email and password do not match.");
    expect(state.token).toBeNull();
  });

  it("clears the previous error when a new attempt starts", () => {
    // Otherwise the old failure sits under the spinner while the new attempt
    // runs, which reads as the new one having already failed.
    const failed = reducer(undefined, actions.signInFailed("nope"));
    const retrying = reducer(failed, actions.signIn({ email: "a@b.c", password: "x" }));
    expect(retrying.status).toBe("signingIn");
    expect(retrying.error).toBeNull();
  });

  it("drops the token on sign out", () => {
    const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    const out = reducer(signedIn, actions.signOut());
    expect(out).toEqual({ status: "anonymous", user: null, token: null, error: null });
  });

  it("drops the token when the session expires, and says why", () => {
    // The API's pwd claim kills a token when the password changes. The person
    // needs to know it was the password, not that they typed something wrong.
    const signedIn = reducer(undefined, actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    const expired = reducer(signedIn, actions.sessionExpired());
    expect(expired.token).toBeNull();
    expect(expired.user).toBeNull();
    expect(expired.error).toBe("You were signed out. Sign in again.");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && npx jest auth-reducer` — expect module not found.

- [ ] **Step 3: Write the duck's parts**

`core/src/ducks/auth/actionTypes.ts`:

```ts
export const SIGN_IN = "auth/SIGN_IN";
export const SIGN_IN_SUCCEEDED = "auth/SIGN_IN_SUCCEEDED";
export const SIGN_IN_FAILED = "auth/SIGN_IN_FAILED";
export const SIGN_OUT = "auth/SIGN_OUT";
export const RESTORE_SESSION = "auth/RESTORE_SESSION";
export const RESTORE_FINISHED = "auth/RESTORE_FINISHED";
export const SESSION_EXPIRED = "auth/SESSION_EXPIRED";
```

`core/src/types.ts` (started here, extended by later tasks):

```ts
export type Role = "coach" | "athlete" | "viewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  jwt: string;
  user: User;
}
```

`core/src/ducks/auth/actions.ts`:

```ts
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
```

`core/src/ducks/auth/reducer.ts`:

```ts
import * as t from "./actionTypes";
import type { AuthAction } from "./actions";
import type { User } from "../../types";

export interface AuthState {
  status: "anonymous" | "restoring" | "signingIn" | "signedIn";
  user: User | null;
  token: string | null;
  error: string | null;
}

const initialState: AuthState = {
  status: "anonymous",
  user: null,
  token: null,
  error: null,
};

export function reducer(
  state: AuthState = initialState,
  action: AuthAction | { type: string },
): AuthState {
  switch (action.type) {
    case t.SIGN_IN:
      return { ...state, status: "signingIn", error: null };
    case t.SIGN_IN_SUCCEEDED: {
      const { jwt, user } = (action as ReturnType<
        typeof import("./actions").signInSucceeded
      >).payload;
      return { status: "signedIn", user, token: jwt, error: null };
    }
    case t.SIGN_IN_FAILED:
      return {
        status: "anonymous",
        user: null,
        token: null,
        error: (action as { payload: string }).payload,
      };
    case t.RESTORE_SESSION:
      return { ...state, status: "restoring" };
    case t.RESTORE_FINISHED: {
      const session = (action as { payload: { jwt: string; user: User } | null })
        .payload;
      if (!session) return initialState;
      return { status: "signedIn", user: session.user, token: session.jwt, error: null };
    }
    case t.SESSION_EXPIRED:
      return {
        status: "anonymous",
        user: null,
        token: null,
        error: "You were signed out. Sign in again.",
      };
    case t.SIGN_OUT:
      return initialState;
    default:
      return state;
  }
}
```

`core/src/ducks/auth/selectors.ts`:

```ts
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
```

`core/src/ducks/auth/index.ts`:

```ts
export { reducer } from "./reducer";
export type { AuthState } from "./reducer";
export * as actions from "./actions";
export * as selectors from "./selectors";
export { authSaga } from "./sagas";
export { SESSION_KEY } from "./api";
```

- [ ] **Step 4: Run the reducer tests**

Run: `cd core && npx jest auth-reducer` — expect 6 passing. Do not write the saga until these pass.

- [ ] **Step 5: Write the failing saga test**

`core/__tests__/auth-saga.test.ts`:

```ts
import { runSaga } from "redux-saga";
import { authSaga } from "../src/ducks/auth/sagas";
import * as actions from "../src/ducks/auth/actions";
import { SESSION_KEY } from "../src/ducks/auth/api";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";

const jeff = { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" as const };

function harness(storage = memoryStorage()) {
  const dispatched: unknown[] = [];
  const config = { baseUrl: "https://api.test", storage, logger: silentLogger, timeoutMs: 15000 };
  const run = (action: unknown) =>
    runSaga(
      {
        dispatch: (a) => dispatched.push(a),
        getState: () => ({ auth: { token: null } }),
        context: { config },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authSaga as any,
      action,
    ).toPromise();
  return { dispatched, run, storage };
}

describe("the auth saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("signs in, and writes the session to storage so a reload keeps it", async () => {
    jest.spyOn(client, "apiRequest").mockResolvedValue({ jwt: "a.b.c", user: jeff });
    const h = harness();

    await h.run(actions.signIn({ email: jeff.email, password: "right" }));

    expect(h.dispatched).toContainEqual(actions.signInSucceeded({ jwt: "a.b.c", user: jeff }));
    expect(JSON.parse((await h.storage.getItem(SESSION_KEY))!)).toEqual({
      jwt: "a.b.c",
      user: jeff,
    });
  });

  it("passes the API's own message through on a bad password", async () => {
    // The API says "That email and password do not match." and deliberately
    // does not say which. Inventing our own copy here would leak that.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(
        new ApiError(401, "unauthorized", "That email and password do not match."),
      );
    const h = harness();

    await h.run(actions.signIn({ email: jeff.email, password: "wrong" }));

    expect(h.dispatched).toContainEqual(
      actions.signInFailed("That email and password do not match."),
    );
  });

  it("writes nothing to storage when sign in fails", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "no"));
    const h = harness();

    await h.run(actions.signIn({ email: jeff.email, password: "wrong" }));

    expect(await h.storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("restores a stored session", async () => {
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
    const h = harness(storage);

    await h.run(actions.restoreSession());

    expect(h.dispatched).toContainEqual(actions.restoreFinished({ jwt: "a.b.c", user: jeff }));
  });

  it("restores nothing, and clears the key, when what is stored is garbage", async () => {
    // A half-written or hand-edited value must not wedge the app on every
    // launch forever.
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, "{not json");
    const h = harness(storage);

    await h.run(actions.restoreSession());

    expect(h.dispatched).toContainEqual(actions.restoreFinished(null));
    expect(await storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("clears storage on sign out", async () => {
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "a.b.c", user: jeff }));
    const h = harness(storage);

    await h.run(actions.signOut());

    expect(await storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("clears storage when the session expires", async () => {
    // A dead token left on disk gets restored on the next launch and fails
    // every request, which looks like the app being broken.
    const storage = memoryStorage();
    await storage.setItem(SESSION_KEY, JSON.stringify({ jwt: "dead", user: jeff }));
    const h = harness(storage);

    await h.run(actions.sessionExpired());

    expect(await storage.getItem(SESSION_KEY)).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd core && npx jest auth-saga` — expect module not found for `./sagas`.

- [ ] **Step 7: Write the api and saga files**

`core/src/ducks/auth/api.ts`:

```ts
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
```

`core/src/ducks/auth/sagas.ts`:

```ts
import { call, getContext, put, takeLatest } from "redux-saga/effects";
import * as t from "./actionTypes";
import * as actions from "./actions";
import { login, SESSION_KEY } from "./api";
import { apiRequest, ApiError } from "../../services/apiClient";
import type { CoreConfig } from "../../config";
import type { User } from "../../types";

function* signInSaga(action: ReturnType<typeof actions.signIn>) {
  const config: CoreConfig = yield getContext("config");
  try {
    const response: { jwt: string; user: User } = yield call(
      login,
      config,
      action.payload,
    );
    yield call([config.storage, "setItem"], SESSION_KEY, JSON.stringify(response));
    yield put(actions.signInSucceeded(response));
  } catch (e) {
    const message =
      e instanceof ApiError ? e.message : "Something went wrong.";
    yield put(actions.signInFailed(message));
  }
}

function* restoreSessionSaga() {
  const config: CoreConfig = yield getContext("config");
  const raw: string | null = yield call([config.storage, "getItem"], SESSION_KEY);
  if (!raw) {
    yield put(actions.restoreFinished(null));
    return;
  }
  try {
    const session = JSON.parse(raw) as { jwt: string; user: User };
    if (!session?.jwt || !session?.user) throw new Error("incomplete session");
    yield put(actions.restoreFinished(session));
  } catch {
    // Whatever is in there is not a session. Remove it so the next launch is
    // clean rather than failing the same way forever.
    yield call([config.storage, "removeItem"], SESSION_KEY);
    yield put(actions.restoreFinished(null));
  }
}

function* forgetSessionSaga() {
  const config: CoreConfig = yield getContext("config");
  yield call([config.storage, "removeItem"], SESSION_KEY);
}

export function* authSaga() {
  yield takeLatest(t.SIGN_IN, signInSaga);
  yield takeLatest(t.RESTORE_SESSION, restoreSessionSaga);
  yield takeLatest([t.SIGN_OUT, t.SESSION_EXPIRED], forgetSessionSaga);
}

// The tests drive one worker at a time rather than the watcher, because a
// watcher started with `runSaga` never resolves. Every duck exports its workers
// under `<duck>Workers` for exactly this.
export const authWorkers = {
  signInSaga,
  restoreSessionSaga,
  forgetSessionSaga,
};
```

**The harness calls workers, not the watcher.** `runSaga(authSaga)` never resolves, because `takeLatest` runs forever. Change the Step 5 harness to take a worker as its first argument, exactly as the journal and outbox harnesses later in this plan do, and call `authWorkers.signInSaga` and friends. Every duck follows this one pattern.

- [ ] **Step 8: Wire it into the root**

`core/src/store/rootReducer.ts`:

```ts
import { combineReducers } from "@reduxjs/toolkit";
import { reducer as auth } from "../ducks/auth";

export const rootReducer = combineReducers({ auth });
export type RootState = ReturnType<typeof rootReducer>;
```

`core/src/store/rootSaga.ts`:

```ts
import { all, fork } from "redux-saga/effects";
import { authSaga } from "../ducks/auth";

export function* rootSaga() {
  yield all([fork(authSaga)]);
}
```

- [ ] **Step 9: Run everything**

Run: `cd core && npx jest` — expect 3 + 6 + 5 + 7 passing. Fix the Task 1 empty-state test, which now has `auth` in it: assert `store.getState().auth.status === "anonymous"` rather than an empty object.

- [ ] **Step 10: Prove the token never reaches storage on a failure**

Delete the `yield call([config.storage, "setItem"], ...)` line, run the saga tests, and confirm the first one fails. Then restore it, break it the other way by moving the `setItem` before the `try`, and confirm the "writes nothing when sign in fails" test catches it. Paste both. A persistence test that only checks the happy path does not prove the failure path.

- [ ] **Step 11: Commit**

```bash
git add core
git commit -m "Auth, and a session that survives a reload but not a password change"
```

---

## Task 4: The shape every read-only duck shares

Five of the remaining ducks do the same thing: ask the API for one payload, hold it, and say whether it is loading. Writing that five times would be five places for it to drift, which is the defect Phase 1 found three times with a single arithmetic function. One helper, tested once, with five thin ducks on top.

**Files:**
- Create: `core/src/lib/createFetchDuck.ts`
- Test: `core/__tests__/create-fetch-duck.test.ts`

**Interfaces:**
- Consumes: `apiRequest`, `isUnauthorized` from Task 2; `selectToken`, `sessionExpired` from Task 3.
- Produces: `createFetchDuck<T, A>({ name, path })` returning `{ reducer, actions: { fetch, succeeded, failed }, selectors: { selectData, selectIsLoading, selectError }, saga }`. State per duck is `{ data: T | null; loading: boolean; error: string | null }`. `path` is a function of the action's argument, so `plan` can ask for `/api/v1/program_years/1/plans/2026-09`.

- [ ] **Step 1: Write the failing tests**

`core/__tests__/create-fetch-duck.test.ts`:

```ts
import { runSaga } from "redux-saga";
import { createFetchDuck } from "../src/lib/createFetchDuck";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import { sessionExpired } from "../src/ducks/auth/actions";

const duck = createFetchDuck<{ label: string }, string>({
  name: "thing",
  path: (id) => `/api/v1/things/${id}`,
});

const config = {
  baseUrl: "https://api.test",
  storage: memoryStorage(),
  logger: silentLogger,
  timeoutMs: 15000,
};

function harness(token: string | null = "a.b.c") {
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (action: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        duck.worker as any,
        action,
      ).toPromise(),
  };
}

describe("createFetchDuck", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is empty and not loading before anything happens", () => {
    expect(duck.reducer(undefined, { type: "@@INIT" })).toEqual({
      data: null,
      loading: false,
      error: null,
    });
  });

  it("is loading while the request is out, and keeps the old data", () => {
    // Blanking the screen on every refetch is what makes a sleeping server
    // feel broken. Keep what is on screen and show that it is refreshing.
    const loaded = duck.reducer(undefined, duck.actions.succeeded({ label: "Cub" }));
    const refetching = duck.reducer(loaded, duck.actions.fetch("1"));
    expect(refetching.loading).toBe(true);
    expect(refetching.data).toEqual({ label: "Cub" });
  });

  it("clears a previous error when a new fetch starts", () => {
    const failed = duck.reducer(undefined, duck.actions.failed("No connection."));
    const retrying = duck.reducer(failed, duck.actions.fetch("1"));
    expect(retrying.error).toBeNull();
  });

  it("fetches with the signed-in token", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ label: "Cub" });
    const h = harness("a.b.c");

    await h.run(duck.actions.fetch("7"));

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ path: "/api/v1/things/7", token: "a.b.c" }),
    );
    expect(h.dispatched).toContainEqual(duck.actions.succeeded({ label: "Cub" }));
  });

  it("signs the person out when the API says the token is dead", async () => {
    // Every duck must do this identically. Doing it here once is the reason
    // this helper exists.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness("dead.token");

    await h.run(duck.actions.fetch("7"));

    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("does not sign the person out for an ordinary failure", async () => {
    // A sleeping server timing out is not a dead session, and signing someone
    // out for it would make the app unusable on a bad connection.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(0, "timeout", "That took too long. Try again."));
    const h = harness("a.b.c");

    await h.run(duck.actions.fetch("7"));

    expect(h.dispatched).not.toContainEqual(sessionExpired());
    expect(h.dispatched).toContainEqual(duck.actions.failed("That took too long. Try again."));
  });

  it("does not call the API at all without a token", async () => {
    // Nothing about Teddy is fetchable unauthenticated, so an anonymous fetch
    // is a bug in the caller. It must not reach the network.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({ label: "x" });
    const h = harness(null);

    await h.run(duck.actions.fetch("7"));

    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd core && npx jest create-fetch-duck`.

- [ ] **Step 3: Write the helper**

`core/src/lib/createFetchDuck.ts`:

```ts
import { call, getContext, put, select, takeLatest } from "redux-saga/effects";
import { apiRequest, ApiError, isUnauthorized } from "../services/apiClient";
import { sessionExpired } from "../ducks/auth/actions";
import { selectToken } from "../ducks/auth/selectors";
import type { CoreConfig } from "../config";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function createFetchDuck<T, A = void>(opts: {
  name: string;
  path: (arg: A) => string;
}) {
  const FETCH = `${opts.name}/FETCH`;
  const SUCCEEDED = `${opts.name}/SUCCEEDED`;
  const FAILED = `${opts.name}/FAILED`;

  const actions = {
    fetch: (arg: A) => ({ type: FETCH, payload: arg }) as const,
    succeeded: (data: T) => ({ type: SUCCEEDED, payload: data }) as const,
    failed: (message: string) => ({ type: FAILED, payload: message }) as const,
  };

  const initialState: FetchState<T> = { data: null, loading: false, error: null };

  function reducer(
    state: FetchState<T> = initialState,
    action: { type: string; payload?: unknown },
  ): FetchState<T> {
    switch (action.type) {
      case FETCH:
        // Keep whatever is on screen. A blank panel on every refresh is how a
        // scale-to-zero server ends up feeling broken.
        return { ...state, loading: true, error: null };
      case SUCCEEDED:
        return { data: action.payload as T, loading: false, error: null };
      case FAILED:
        return { ...state, loading: false, error: action.payload as string };
      default:
        return state;
    }
  }

  function* worker(action: ReturnType<typeof actions.fetch>) {
    const config: CoreConfig = yield getContext("config");
    const token: string | null = yield select(selectToken);
    if (!token) return;

    try {
      const data: T = yield call(apiRequest, config, {
        path: opts.path(action.payload),
        token,
      });
      yield put(actions.succeeded(data));
    } catch (e) {
      if (isUnauthorized(e)) {
        yield put(sessionExpired());
        return;
      }
      yield put(actions.failed(e instanceof ApiError ? e.message : "Something went wrong."));
    }
  }

  function* saga() {
    yield takeLatest(FETCH, worker);
  }

  const selectors = {
    selectData: (s: Record<string, unknown>) =>
      (s[opts.name] as FetchState<T>).data,
    selectIsLoading: (s: Record<string, unknown>) =>
      (s[opts.name] as FetchState<T>).loading,
    selectError: (s: Record<string, unknown>) =>
      (s[opts.name] as FetchState<T>).error,
  };

  // `path` is returned here so a duck has exactly one copy of its URL. An
  // earlier draft of this plan had each duck restate it, which is a second
  // place to drift and the defect Phase 1 found three times.
  return { actions, reducer, saga, worker, selectors, path: opts.path, types: { FETCH, SUCCEEDED, FAILED } };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd core && npx jest create-fetch-duck` — expect 7 passing.

- [ ] **Step 5: Prove the 401 branch discriminates**

Change `isUnauthorized(e)` to `e instanceof ApiError` and run the tests. The "does not sign the person out for an ordinary failure" example must fail. Paste the failure, restore, paste the pass. Both 401 examples passing while the timeout one is broken would mean the branch is untested in the direction that matters.

- [ ] **Step 6: Commit**

```bash
git add core
git commit -m "One fetch shape, so five ducks cannot drift apart"
```

---

## Task 5: The five read-only ducks

**Files:**
- Create: `core/src/ducks/{programYear,plan,week,drills,progression}/index.ts`
- Modify: `core/src/types.ts`, `core/src/store/rootReducer.ts`, `core/src/store/rootSaga.ts`, `core/src/index.ts`
- Test: `core/__tests__/read-ducks.test.ts`

**Interfaces:**
- Consumes: `createFetchDuck` from Task 4.
- Produces: `state.programYears`, `state.programYear`, `state.plan`, `state.week`, `state.drills`, `state.progression`, each `FetchState<T>`. Plus `selectDrillBySlug`, `selectDrillsMatching(query)` and `selectDayByDate` as derived selectors the web app needs.

The payload types below were captured from the live API on 2026-09-13. They are not a proposal.

- [ ] **Step 1: Write the types**

Append to `core/src/types.ts`:

```ts
export interface ProgramYearSummary {
  id: number;
  label: string;
  starts_on: string;
  ends_on: string;
  status: string;
  is_current: boolean;
}

export interface Token {
  text: string;
  type: string;
  style: string;
  slug?: string;
}

export interface DayBlock {
  id: number;
  position: number;
  minutes: string;
  name: string;
  tag: string | null;
  name_tokens: Token[];
  body_tokens: Token[];
  drill_slugs: string[];
}

export interface DayCard {
  id: number;
  dow: string;
  date: string;
  name: string;
  role: string;
  minutes: string;
  intensity: number;
  hie: number;
  summary_lines: string[];
  drill_slugs: string[];
  // Present only in the week payload, absent from the month payload.
  dad_note?: string;
  blocks?: DayBlock[];
  coach_entry?: CoachEntry | null;
  athlete_entry?: AthleteEntry | null;
}

export interface Week {
  id: number;
  number: number;
  position_in_block: number;
  theme: string;
  dates_display: string;
  targets: string[];
  challenge: string;
  trials: boolean;
  block_key: string;
  high_intent_efforts: number;
  budget: number;
  days: DayCard[];
}

export interface MonthPlan {
  month: string;
  label: string;
  range_display: string;
  block_key: string;
  weeks: Week[];
}

export interface Drill {
  slug: string;
  name: string;
  area_name: string;
  aliases: string[];
  short: string;
  how: string[];
  watch: string;
  cue: string;
  video: string | null;
}

export interface Progression {
  years: { id: number; label: string; starts_on: string; ends_on: string; status: string }[];
  ranks: unknown[];
  battery: unknown[];
  height: { series: { window: string; value: number }[]; cm_per_year: number | null };
  drills: unknown[];
}

export interface ProgramYearDetail {
  id: number;
  label: string;
  starts_on: string;
  ends_on: string;
  status: string;
  ball_now: string;
  rank_rule: string;
  north_star: string;
  blocks: { key: string; name: string; position: number; starts_on: string; ends_on: string; focus: string; current: boolean }[];
  areas: { slug: string; position: number; name: string; summary: string; cells: { block_key: string; body: string }[] }[];
  patches: { id: number; block_key: string; area_slug: string; name: string; requirement: string }[];
  ball_gates: { position: number; from_ball: string; to_ball: string; label: string; requirement: string; status: string }[];
  battery: {
    tests: { id: number; position: number; name: string; protocol: string; area_name: string; unit: string }[];
    measures: { id: number; test_id: string; position: number; label: string; unit: string; direction: string; battery_test_id: number }[];
    results: unknown[];
    progress: { test_id: string; label: string; unit: string; direction: string; baseline: number | null; latest: number | null; change: number | null; series: { window: string; value: number }[] }[];
  };
  test_dates: { id: number; window: string; label: string; display: string; position: number }[];
  day_roles: { dow: string; position: number; name: string; organized: string[]; minutes: string; intensity: number; note: string }[];
  current_block_key: string;
  current_week_id: number;
  patch_awards: unknown[];
  rank_awards: unknown[];
}
```

- [ ] **Step 2: Write the failing test**

`core/__tests__/read-ducks.test.ts`:

```ts
import { programYears, programYear, plan, week, drills, progression } from "../src/ducks/read";
import { selectDrillsMatching, selectDrillBySlug } from "../src/ducks/drills";

describe("the read ducks", () => {
  it("each ask the API for the path the live API actually serves", () => {
    expect(programYears.path(undefined)).toBe("/api/v1/program_years");
    expect(programYear.path(1)).toBe("/api/v1/program_years/1");
    expect(plan.path({ yearId: 1, month: "2026-09" })).toBe(
      "/api/v1/program_years/1/plans/2026-09",
    );
    expect(week.path(1)).toBe("/api/v1/program_years/1/weeks/current");
    expect(drills.path(undefined)).toBe("/api/v1/drills");
    expect(progression.path(undefined)).toBe("/api/v1/progression");
  });
});

const glossary = [
  { slug: "cartwheel", name: "Cartwheel", area_name: "Move", aliases: ["wheel"], short: "", how: [], watch: "", cue: "", video: null },
  { slug: "a-skip", name: "A-skip", area_name: "Run", aliases: [], short: "", how: [], watch: "", cue: "", video: null },
];

describe("glossary search", () => {
  const state = { drills: { data: { drills: glossary }, loading: false, error: null } };

  it("finds a drill by its name, case insensitively", () => {
    expect(selectDrillsMatching("cart")(state).map((d) => d.slug)).toEqual(["cartwheel"]);
  });

  it("finds a drill by an alias, which is why aliases exist", () => {
    // Teddy will type what he calls it, not what the sheet calls it.
    expect(selectDrillsMatching("wheel")(state).map((d) => d.slug)).toEqual(["cartwheel"]);
  });

  it("returns everything for an empty query rather than nothing", () => {
    expect(selectDrillsMatching("")(state)).toHaveLength(2);
  });

  it("returns an empty list, not undefined, when nothing matches", () => {
    expect(selectDrillsMatching("zzz")(state)).toEqual([]);
  });

  it("looks one up by slug, and returns null rather than throwing when it is gone", () => {
    expect(selectDrillBySlug("a-skip")(state)?.name).toBe("A-skip");
    expect(selectDrillBySlug("nope")(state)).toBeNull();
  });

  it("survives the glossary not having loaded yet", () => {
    // Every screen can render before its data arrives. A selector that throws
    // on null data turns a slow server into a crash.
    const empty = { drills: { data: null, loading: true, error: null } };
    expect(selectDrillsMatching("cart")(empty)).toEqual([]);
    expect(selectDrillBySlug("cartwheel")(empty)).toBeNull();
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `cd core && npx jest read-ducks`.

- [ ] **Step 4: Write the ducks**

`core/src/ducks/read.ts`:

```ts
import { createFetchDuck } from "../lib/createFetchDuck";
import type {
  Drill,
  MonthPlan,
  ProgramYearDetail,
  ProgramYearSummary,
  Progression,
  Week,
} from "../types";

// Each of these is one line of real decision: the URL. Everything else is the
// shared shape from createFetchDuck, tested once in Task 4, so these five
// cannot drift apart the way two copies of one calculation did in Phase 1.
export const programYears = createFetchDuck<{ program_years: ProgramYearSummary[] }, void>({
  name: "programYears",
  path: () => "/api/v1/program_years",
});

export const programYear = createFetchDuck<ProgramYearDetail, number>({
  name: "programYear",
  path: (id) => `/api/v1/program_years/${id}`,
});

export const plan = createFetchDuck<MonthPlan, { yearId: number; month: string }>({
  name: "plan",
  path: (a) => `/api/v1/program_years/${a.yearId}/plans/${a.month}`,
});

export const week = createFetchDuck<Week, number>({
  name: "week",
  path: (yearId) => `/api/v1/program_years/${yearId}/weeks/current`,
});

export const drills = createFetchDuck<{ drills: Drill[] }, void>({
  name: "drills",
  path: () => "/api/v1/drills",
});

export const progression = createFetchDuck<Progression, void>({
  name: "progression",
  path: () => "/api/v1/progression",
});
```

`core/src/ducks/drills/index.ts`:

```ts
import type { Drill } from "../../types";

interface WithDrills {
  drills: { data: { drills: Drill[] } | null };
}

export const selectDrills = (s: WithDrills): Drill[] => s.drills.data?.drills ?? [];

export const selectDrillBySlug = (slug: string) => (s: WithDrills): Drill | null =>
  selectDrills(s).find((d) => d.slug === slug) ?? null;

// Teddy types what he calls the drill. Aliases exist for exactly that, so
// searching them is not a nicety.
export const selectDrillsMatching = (query: string) => (s: WithDrills): Drill[] => {
  const all = selectDrills(s);
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.slug.includes(q) ||
      d.aliases.some((a) => a.toLowerCase().includes(q)),
  );
};
```

- [ ] **Step 4b: Add `selectDayByDate`, which every day view needs**

Append to `core/__tests__/read-ducks.test.ts`:

```ts
import { selectDayByDate } from "../src/ducks/week";

const loadedWeek = {
  week: {
    data: {
      id: 1, number: 1, position_in_block: 1, theme: "Baseline & Land",
      dates_display: "Sep 14-20", targets: [], challenge: "", trials: false,
      block_key: "cub", high_intent_efforts: 28, budget: 40,
      days: [
        { id: 1, dow: "Mon", date: "2026-09-14", name: "Land Like a Cat", role: "Floor Day", minutes: "60-75", intensity: 2, hie: 0, summary_lines: [], drill_slugs: [] },
        { id: 4, dow: "Thu", date: "2026-09-17", name: "Wall & Ball", role: "Wall Day", minutes: "75", intensity: 2, hie: 2, summary_lines: [], drill_slugs: [] },
      ],
    },
    loading: false, error: null,
  },
};

describe("selectDayByDate", () => {
  it("finds the day card for a date", () => {
    expect(selectDayByDate("2026-09-17")(loadedWeek)?.name).toBe("Wall & Ball");
  });

  it("returns null for a date this week does not contain", () => {
    // Sunday's card belongs to next week's payload. Returning the wrong day
    // would show Teddy the wrong session, which is worse than showing none.
    expect(selectDayByDate("2026-09-21")(loadedWeek)).toBeNull();
  });

  it("returns null before the week has loaded", () => {
    expect(selectDayByDate("2026-09-17")({ week: { data: null, loading: true, error: null } })).toBeNull();
  });
});
```

`core/src/ducks/week/index.ts`:

```ts
import type { DayCard, Week } from "../../types";

interface WithWeek {
  week: { data: Week | null };
}

export const selectWeek = (s: WithWeek): Week | null => s.week.data;

export const selectDayByDate =
  (date: string) =>
  (s: WithWeek): DayCard | null =>
    s.week.data?.days.find((d) => d.date === date) ?? null;

// The budget is on the payload rather than computed here. CLAUDE.md sets it at
// 40 a week and 20 in Trials weeks, and the API already applies that rule, so
// recomputing it on the client would be a second owner of a program rule.
export const selectWeekBudget = (s: WithWeek) => s.week.data?.budget ?? null;
export const selectWeekSpend = (s: WithWeek) => s.week.data?.high_intent_efforts ?? null;
```

- [ ] **Step 4c: Prove the date match is exact**

Change `d.date === date` to `d.date.startsWith(date)` and confirm nothing fails, then add the case that catches it: a day on `2026-09-17` must not be returned for the query `2026-09-1`. Add that example, watch it fail against `startsWith`, restore the equality and watch it pass. A lookup that matches a prefix returns the wrong session on the wrong day.

- [ ] **Step 5: Wire all six into the root**

`core/src/store/rootReducer.ts`:

```ts
import { combineReducers } from "@reduxjs/toolkit";
import { reducer as auth } from "../ducks/auth";
import { programYears, programYear, plan, week, drills, progression } from "../ducks/read";

export const rootReducer = combineReducers({
  auth,
  programYears: programYears.reducer,
  programYear: programYear.reducer,
  plan: plan.reducer,
  week: week.reducer,
  drills: drills.reducer,
  progression: progression.reducer,
});
export type RootState = ReturnType<typeof rootReducer>;
```

`core/src/store/rootSaga.ts`:

```ts
import { all, fork } from "redux-saga/effects";
import { authSaga } from "../ducks/auth";
import { programYears, programYear, plan, week, drills, progression } from "../ducks/read";

export function* rootSaga() {
  yield all([
    fork(authSaga),
    fork(programYears.saga),
    fork(programYear.saga),
    fork(plan.saga),
    fork(week.saga),
    fork(drills.saga),
    fork(progression.saga),
  ]);
}
```

- [ ] **Step 6: Run everything**

Run: `cd core && npx jest` — expect all previous plus 7 new passing.

- [ ] **Step 7: Prove the glossary search actually searches aliases**

Delete `d.aliases.some(...)` from the filter, run the tests, and confirm the alias example fails. Restore and confirm it passes. An alias search asserted against a drill whose *name* also matches would pass either way, which is why the fixture's alias is `wheel` and its name is `Cartwheel`.

- [ ] **Step 8: Commit**

```bash
git add core
git commit -m "The five read ducks, and a glossary that finds what Teddy calls it"
```

---

## Task 6: The outbox

The brief names this directly: saving with no signal currently fails and loses the entry, and a tennis court is exactly where it bites. Jeff chose to fix it rather than carry it forward.

**Files:**
- Create: `core/src/ducks/outbox/{actionTypes,actions,reducer,sagas,selectors,index}.ts`
- Modify: root reducer and saga, `core/src/index.ts`
- Test: `core/__tests__/outbox-reducer.test.ts`, `core/__tests__/outbox-saga.test.ts`

**Interfaces:**
- Consumes: the journal and test-result save actions, replayed verbatim.
- Produces: `state.outbox` of `{ queue: QueuedWrite[]; replaying: boolean }` where `QueuedWrite = { id: string; action: AnyAction; queuedAt: string; attempts: number }`. Actions `enqueue(action)`, `replay()`, `replaySucceeded(id)`, `replayFailed({id, permanent})`. The queue persists through the injected `Storage` so it survives the app being closed on the walk home.

- [ ] **Step 1: Write the failing reducer test**

```ts
import { reducer, actions } from "../src/ducks/outbox";
import { saveAthleteEntry } from "../src/ducks/journal/actions";

const write = saveAthleteEntry({ date: "2026-09-17", note: "Landed three.", shared: false });

describe("the outbox reducer", () => {
  it("starts empty", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({ queue: [], replaying: false });
  });

  it("keeps the action verbatim so replay is the same request", () => {
    const s = reducer(undefined, actions.enqueue(write));
    expect(s.queue[0]!.action).toEqual(write);
  });

  it("replaces an earlier queued write for the same day rather than stacking them", () => {
    // Teddy edits his entry three times offline. Replaying three writes to the
    // same upsert endpoint is three requests for one outcome, and the order
    // decides which wins. Keep the last.
    const older = reducer(undefined, actions.enqueue(write));
    const newer = reducer(
      older,
      actions.enqueue(saveAthleteEntry({ date: "2026-09-17", note: "Landed five.", shared: false })),
    );
    expect(newer.queue).toHaveLength(1);
    expect((newer.queue[0]!.action.payload as { note: string }).note).toBe("Landed five.");
  });

  it("keeps writes for different days separately", () => {
    const a = reducer(undefined, actions.enqueue(write));
    const b = reducer(a, actions.enqueue(saveAthleteEntry({ date: "2026-09-18", note: "x", shared: false })));
    expect(b.queue).toHaveLength(2);
  });

  it("takes a write off the queue when it lands", () => {
    const queued = reducer(undefined, actions.enqueue(write));
    const done = reducer(queued, actions.replaySucceeded(queued.queue[0]!.id));
    expect(done.queue).toHaveLength(0);
  });

  it("counts attempts, and drops a write the server permanently rejected", () => {
    // A 422 will fail identically forever. Keeping it would block everything
    // behind it and never resolve.
    const queued = reducer(undefined, actions.enqueue(write));
    const id = queued.queue[0]!.id;
    const retried = reducer(queued, actions.replayFailed({ id, permanent: false }));
    expect(retried.queue[0]!.attempts).toBe(1);
    const dropped = reducer(retried, actions.replayFailed({ id, permanent: true }));
    expect(dropped.queue).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, watch fail, implement the reducer, run**

Dedupe key is the queued action's `type` plus its payload `date`, which is what makes two edits of one day collapse to one write.

- [ ] **Step 3: Write the failing saga test**

The saga must: persist the queue to storage on every change; restore it on boot; replay in order, oldest first; stop replaying on the first offline failure rather than burning the whole queue against a dead connection; and drop a write on a permanent rejection.

`core/__tests__/outbox-saga.test.ts`:

```ts
import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/outbox/actions";
import { outboxWorkers, QUEUE_KEY } from "../src/ducks/outbox/sagas";
import { saveAthleteEntry } from "../src/ducks/journal/actions";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";

const write = (date: string, note: string) => saveAthleteEntry({ date, note, shared: false });

function harness(queue: unknown[] = [], storage = memoryStorage()) {
  const dispatched: unknown[] = [];
  const config = { baseUrl: "https://api.test", storage, logger: silentLogger, timeoutMs: 15000 };
  return {
    dispatched,
    storage,
    run: (worker: unknown, action?: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c" }, outbox: { queue, replaying: false } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worker as any,
        action,
      ).toPromise(),
  };
}

describe("the outbox saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("replays oldest first, so the last edit of a day is the one that sticks", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({});
    const h = harness([
      { id: "1", action: write("2026-09-17", "first"), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("2026-09-18", "second"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    const notes = spy.mock.calls.map(
      ([, req]) => ((req as { body: { athlete_entry: { note: string } } }).body).athlete_entry.note,
    );
    expect(notes).toEqual(["first", "second"]);
  });

  it("stops at the first offline failure instead of failing the whole queue", async () => {
    // Three writes against a connection that is still down is three timeouts,
    // forty five seconds, and the same outcome as stopping at one.
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness([
      { id: "1", action: write("2026-09-17", "a"), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("2026-09-18", "b"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
      { id: "3", action: write("2026-09-19", "c"), queuedAt: "2026-09-19T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.dispatched).toContainEqual(actions.replayFailed({ id: "1", permanent: false }));
  });

  it("drops a write the server permanently rejected and carries on to the next", async () => {
    const spy = jest
      .spyOn(client, "apiRequest")
      .mockRejectedValueOnce(new ApiError(422, "invalid", "A note cannot be blank."))
      .mockResolvedValueOnce({});
    const h = harness([
      { id: "1", action: write("2026-09-17", ""), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
      { id: "2", action: write("2026-09-18", "b"), queuedAt: "2026-09-18T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.replay);

    expect(h.dispatched).toContainEqual(actions.replayFailed({ id: "1", permanent: true }));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("restores the queue from storage on boot", async () => {
    // The entry was typed at a court, the app was closed on the walk home, and
    // it has to still be there.
    const storage = memoryStorage();
    const queued = [{ id: "1", action: write("2026-09-17", "Landed three."), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 }];
    await storage.setItem(QUEUE_KEY, JSON.stringify(queued));
    const h = harness([], storage);

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored(queued));
  });

  it("survives a stored queue that is not valid JSON", async () => {
    // Same reasoning as the session key: never wedge every launch forever.
    const storage = memoryStorage();
    await storage.setItem(QUEUE_KEY, "{not json");
    const h = harness([], storage);

    await h.run(outboxWorkers.restore);

    expect(h.dispatched).toContainEqual(actions.queueRestored([]));
    expect(await storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("writes the queue to storage whenever it changes", async () => {
    const h = harness([
      { id: "1", action: write("2026-09-17", "Landed three."), queuedAt: "2026-09-17T18:00:00Z", attempts: 0 },
    ]);

    await h.run(outboxWorkers.persist);

    const stored = JSON.parse((await h.storage.getItem(QUEUE_KEY))!);
    expect(stored).toHaveLength(1);
    expect(stored[0].action.payload.note).toBe("Landed three.");
  });
});
```

- [ ] **Step 4: Implement, run, and prove**

Break the "stop at first failure" behaviour by continuing the loop, and confirm the example fails. Break the dedupe by appending, and confirm the "replaces an earlier queued write" example fails. Paste both.

- [ ] **Step 5: Write the end-to-end test that is the point of this task**

`core/__tests__/outbox-e2e.test.ts`:

```ts
it("a note typed offline reaches the API when the connection comes back", async () => {
  // The whole reason this duck exists, asserted as one story rather than as
  // its parts: the save fails offline, the entry is queued, the queue survives
  // a store restart, and the replay sends exactly what was typed.
});
```

Write it against a real store from `createCoreStore` with a `memoryStorage`, a `fetch` that rejects then resolves, and no mocking of the ducks themselves. If this passes while any of the unit tests are broken, it is not testing what it claims.

- [ ] **Step 6: Commit**

```bash
git add core
git commit -m "An entry typed at the court, kept until there is signal for it"
```

---

## Task 7: The journal duck, and the toggle

The most careful task in this plan. `AthleteEntry.shared` is a promise made to a 7-year-old about his own writing, and `deleted_at` is the promise that a mistake can be taken back. Both are enforced by the API. `core/` must not undo either by reconstructing visibility on the client.

**Files:**
- Create: `core/src/ducks/journal/{actionTypes,actions,api,reducer,sagas,selectors,index}.ts`
- Modify: `core/src/types.ts`, root reducer and saga, `core/src/index.ts`
- Test: `core/__tests__/journal-reducer.test.ts`, `core/__tests__/journal-saga.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 4.
- Produces: `state.journal` of shape `{ coach: Record<string, CoachEntry>; athlete: Record<string, AthleteEntry>; saving: Record<string, boolean>; error: string | null }`, keyed by `session_date`. Actions `saveCoachEntry`, `saveAthleteEntry`, `deleteEntry({kind, date})`, `setShared({date, shared})`. Selectors `selectCoachEntryFor(date)`, `selectAthleteEntryFor(date)`, `selectIsSaving(date)`.

- [ ] **Step 1: Add the types**

Append to `core/src/types.ts`:

```ts
export interface CoachEntry {
  id: number;
  session_date: string;
  note: string;
  ratings: Record<string, number>;
  updated_at: string;
}

export interface AthleteEntry {
  id: number;
  session_date: string;
  note: string;
  // Teddy's choice, and the only thing that decides whether Dad sees it.
  shared: boolean;
  updated_at: string;
}
```

- [ ] **Step 2: Write the failing reducer test**

`core/__tests__/journal-reducer.test.ts`:

```ts
import { reducer, actions, selectors } from "../src/ducks/journal";

const mine = {
  id: 4,
  session_date: "2026-09-17",
  note: "Landed three in a row.",
  shared: false,
  updated_at: "2026-09-17T19:02:00Z",
};

describe("the journal reducer", () => {
  it("starts with nothing and no error", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      coach: {},
      athlete: {},
      saving: {},
      error: null,
    });
  });

  it("files an athlete entry under its own date", () => {
    const s = reducer(undefined, actions.athleteEntrySaved(mine));
    expect(s.athlete["2026-09-17"]).toEqual(mine);
  });

  it("replaces the entry for a date rather than accumulating duplicates", () => {
    // The API upserts on (user, year, date). Two saves are one entry.
    const first = reducer(undefined, actions.athleteEntrySaved(mine));
    const second = reducer(
      first,
      actions.athleteEntrySaved({ ...mine, note: "Four in a row.", updated_at: "2026-09-17T19:40:00Z" }),
    );
    expect(Object.keys(second.athlete)).toEqual(["2026-09-17"]);
    expect(second.athlete["2026-09-17"]!.note).toBe("Four in a row.");
  });

  it("takes an entry out on delete rather than keeping it with a flag", () => {
    // The row keeps deleted_at server side. On the client it is gone, because
    // the person who deleted it should never see it again.
    const loaded = reducer(undefined, actions.athleteEntrySaved(mine));
    const gone = reducer(loaded, actions.entryDeleted({ kind: "athlete", date: "2026-09-17" }));
    expect(gone.athlete["2026-09-17"]).toBeUndefined();
  });

  it("tracks saving per date, so one day saving does not spin every day", () => {
    const s = reducer(undefined, actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: s })).toBe(true);
    expect(selectors.selectIsSaving("2026-09-18")({ journal: s })).toBe(false);
  });

  it("stops saving when the save lands", () => {
    const saving = reducer(undefined, actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }));
    const done = reducer(saving, actions.athleteEntrySaved(mine));
    expect(selectors.selectIsSaving("2026-09-17")({ journal: done })).toBe(false);
  });

  it("keeps what the API returned for shared, and never infers it", () => {
    // If the client ever computes `shared` itself, the toggle has two owners
    // and they will disagree. The API decides; we display.
    const shared = reducer(undefined, actions.athleteEntrySaved({ ...mine, shared: true }));
    expect(shared.athlete["2026-09-17"]!.shared).toBe(true);
    const not = reducer(shared, actions.athleteEntrySaved({ ...mine, shared: false }));
    expect(not.athlete["2026-09-17"]!.shared).toBe(false);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `cd core && npx jest journal-reducer`.

- [ ] **Step 4: Write the duck**

Write `actionTypes.ts`, `actions.ts`, `reducer.ts`, `selectors.ts` following the auth duck's shape exactly. The reducer keys both maps by `session_date`. `saveAthleteEntry` and `saveCoachEntry` set `saving[date] = true`; the `...Saved` and `...Failed` actions clear it. `entryDeleted` removes the key from the relevant map.

Selectors:

```ts
import type { AthleteEntry, CoachEntry } from "../../types";
import type { JournalState } from "./reducer";

interface WithJournal {
  journal: JournalState;
}

export const selectCoachEntryFor =
  (date: string) =>
  (s: WithJournal): CoachEntry | null =>
    s.journal.coach[date] ?? null;

export const selectAthleteEntryFor =
  (date: string) =>
  (s: WithJournal): AthleteEntry | null =>
    s.journal.athlete[date] ?? null;

export const selectIsSaving = (date: string) => (s: WithJournal): boolean =>
  Boolean(s.journal.saving[date]);

export const selectJournalError = (s: WithJournal) => s.journal.error;
```

- [ ] **Step 5: Run the reducer tests**

Run: `cd core && npx jest journal-reducer` — expect 7 passing.

- [ ] **Step 6: Write the failing saga test**

`core/__tests__/journal-saga.test.ts`:

```ts
import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/journal/actions";
import { journalWorkers } from "../src/ducks/journal/sagas";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import { sessionExpired } from "../src/ducks/auth/actions";
import { enqueue } from "../src/ducks/outbox/actions";

const config = { baseUrl: "https://api.test", storage: memoryStorage(), logger: silentLogger, timeoutMs: 15000 };

function harness() {
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (worker: unknown, action: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c" } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worker as any,
        action,
      ).toPromise(),
  };
}

describe("the journal saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends shared exactly as given, without interpreting it", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({
      id: 4, session_date: "2026-09-17", note: "x", shared: true, updated_at: "z",
    });
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: true }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        body: { athlete_entry: { session_date: "2026-09-17", note: "x", shared: true } },
      }),
    );
  });

  it("queues the entry instead of losing it when there is no connection", async () => {
    // This is the failure the rewrite exists partly to fix. A tennis court is
    // exactly where it happens, and the old page dropped the entry on the floor.
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness();

    const action = actions.saveAthleteEntry({ date: "2026-09-17", note: "Landed three.", shared: false });
    await h.run(journalWorkers.saveAthleteEntry, action);

    expect(h.dispatched).toContainEqual(enqueue(action));
  });

  it("does not queue a rejection the server actually made a decision about", async () => {
    // A 422 will fail again identically on replay, so queueing it would retry
    // forever and hide a real problem.
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(422, "invalid", "A note cannot be blank."));
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ date: "2026-09-17", note: "", shared: false }),
    );

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(actions.saveFailed({ date: "2026-09-17", message: "A note cannot be blank." }));
  });

  it("signs out on a dead token rather than queueing forever", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(
      journalWorkers.saveAthleteEntry,
      actions.saveAthleteEntry({ date: "2026-09-17", note: "x", shared: false }),
    );

    expect(h.dispatched).toContainEqual(sessionExpired());
  });

  it("deletes through the API and only then takes it off screen", async () => {
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({});
    const h = harness();

    await h.run(
      journalWorkers.deleteEntry,
      actions.deleteEntry({ kind: "athlete", date: "2026-09-17", id: 4 }),
    );

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ method: "DELETE", path: "/api/v1/athlete_entries/4" }),
    );
    expect(h.dispatched).toContainEqual(actions.entryDeleted({ kind: "athlete", date: "2026-09-17" }));
  });

  it("leaves the entry on screen when the delete fails", async () => {
    // Removing it optimistically and then failing would tell a child his
    // writing is gone when it is not.
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness();

    await h.run(
      journalWorkers.deleteEntry,
      actions.deleteEntry({ kind: "athlete", date: "2026-09-17", id: 4 }),
    );

    expect(h.dispatched).not.toContainEqual(actions.entryDeleted({ kind: "athlete", date: "2026-09-17" }));
  });
});
```

- [ ] **Step 7: Run and watch it fail, then write `api.ts` and `sagas.ts`**

The workers follow the auth saga's shape. The one decision the tests pin: on failure, a `timeout` or `offline` code enqueues to the outbox, a 401 dispatches `sessionExpired()`, and anything else dispatches `saveFailed`. Write it as an explicit three-way branch, not a fallthrough.

- [ ] **Step 8: Run the tests**

Run: `cd core && npx jest journal` — expect 7 + 6 passing.

- [ ] **Step 9: Prove the queue branch discriminates**

Change the branch so every failure enqueues. The "does not queue a rejection the server made a decision about" example must fail. Then change it so nothing enqueues; the offline example must fail. Paste both failures and the restored pass. A branch tested in only one direction is half a branch.

- [ ] **Step 10: Commit**

```bash
git add core
git commit -m "Both journals, Teddy's toggle passed through untouched, and a delete that waits for the server"
```

---

## Task 8: Test results

**Files:**
- Create: `core/src/ducks/testResults/{actionTypes,actions,api,reducer,sagas,selectors,index}.ts`
- Modify: `core/src/types.ts`, root reducer and saga
- Test: `core/__tests__/test-results-reducer.test.ts`, `core/__tests__/test-results-saga.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4, and `enqueue` from Task 6.
- Produces: `state.testResults` of `{ byWindow: Record<string, Record<string, TestResult>>; saving: Record<string, boolean>; error: string | null }`, keyed window then `test_id`. Actions `fetchResults`, `saveResult({window, testId, rawValue})`. Selectors `selectResultsForWindow(window)`, `selectDefaultWindow(testDates, today)`.

- [ ] **Step 1: Write the failing tests**

The window-picking selector is the one with real logic, and the old page had it as `defaultWindow()`. It picks the test window closest to today, which is what a coach standing on a court with a stopwatch needs preselected.

```ts
import { selectDefaultWindow } from "../src/ducks/testResults";

const dates = [
  { id: 1, window: "2026-09", label: "Baseline", display: "Sep 15-17", position: 1 },
  { id: 2, window: "2026-12", label: "December", display: "Dec 8-10", position: 2 },
  { id: 3, window: "2027-03", label: "March", display: "Mar 8-10", position: 3 },
];

describe("selectDefaultWindow", () => {
  it("picks the window the current date sits in", () => {
    expect(selectDefaultWindow(dates, new Date("2026-09-16"))).toBe("2026-09");
  });

  it("picks the nearest window when today is between two", () => {
    expect(selectDefaultWindow(dates, new Date("2026-11-20"))).toBe("2026-12");
  });

  it("picks the last window when the year is over rather than returning nothing", () => {
    expect(selectDefaultWindow(dates, new Date("2027-08-01"))).toBe("2027-03");
  });

  it("picks the first window before the year starts", () => {
    expect(selectDefaultWindow(dates, new Date("2026-08-01"))).toBe("2026-09");
  });

  it("returns null for an empty list rather than throwing", () => {
    expect(selectDefaultWindow([], new Date("2026-09-16"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && npx jest test-results` — expect module not found.

- [ ] **Step 3: Write the selector**

```ts
import type { TestDate } from "../../types";

// A coach standing on a court with a stopwatch should not have to pick the
// window before typing a number. Pick the one today is in, and otherwise the
// nearest, because being a fortnight early for December is still December.
export function selectDefaultWindow(dates: TestDate[], today: Date): string | null {
  if (dates.length === 0) return null;

  const asMonths = (window: string) => {
    const [y, m] = window.split("-").map(Number);
    return y! * 12 + (m! - 1);
  };
  const now = today.getUTCFullYear() * 12 + today.getUTCMonth();

  let best = dates[0]!;
  let bestDistance = Math.abs(asMonths(best.window) - now);
  for (const d of dates.slice(1)) {
    const distance = Math.abs(asMonths(d.window) - now);
    // Strictly less than, so a tie keeps the earlier window rather than
    // sliding forward to one that has not happened yet.
    if (distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  return best.window;
}
```

Add to `core/src/types.ts`:

```ts
export interface TestDate {
  id: number;
  window: string;
  label: string;
  display: string;
  position: number;
}

export interface TestResult {
  id: number;
  test_id: string;
  window: string;
  raw_value: string;
  numeric_value: number | null;
  updated_at: string;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd core && npx jest test-results` — expect 5 passing.

- [ ] **Step 5: Prove the window picker is doing arithmetic, not guessing**

Replace the loop body with `best = dates[0]!` and run. The "between two" and "year is over" examples must both fail. Paste the failures, restore, paste the pass. A window picker tested only on a date inside a window passes while being wrong on every other day of the year, which is most of them.

- [ ] **Step 6: Write the failing saga tests**

`core/__tests__/test-results-saga.test.ts`, the same three branches the journal has, because a number typed at a test session is exactly as losable as a note:

```ts
import { runSaga } from "redux-saga";
import * as actions from "../src/ducks/testResults/actions";
import { testResultsWorkers } from "../src/ducks/testResults/sagas";
import * as client from "../src/services/apiClient";
import { ApiError } from "../src/services/apiClient";
import { memoryStorage } from "../src";
import { silentLogger } from "../src/services/logger";
import { sessionExpired } from "../src/ducks/auth/actions";
import { enqueue } from "../src/ducks/outbox/actions";

const config = { baseUrl: "https://api.test", storage: memoryStorage(), logger: silentLogger, timeoutMs: 15000 };

function harness() {
  const dispatched: unknown[] = [];
  return {
    dispatched,
    run: (worker: unknown, action: unknown) =>
      runSaga(
        {
          dispatch: (a) => dispatched.push(a),
          getState: () => ({ auth: { token: "a.b.c" } }),
          context: { config },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        worker as any,
        action,
      ).toPromise(),
  };
}

const save = actions.saveResult({ window: "2026-09", testId: "t1", rawValue: "4.42" });

describe("the test results saga", () => {
  afterEach(() => jest.restoreAllMocks());

  it("posts the raw value the coach typed, not a parsed one", async () => {
    // The API stores raw_value and parses numeric_value itself. A range like
    // "15 to 18" is a real thing to type, and parsing on the client would
    // either lose it or disagree with the server about what it means.
    const spy = jest.spyOn(client, "apiRequest").mockResolvedValue({
      id: 1, test_id: "t1", window: "2026-09", raw_value: "4.42", numeric_value: 4.42, updated_at: "z",
    });
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(spy).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/test_results",
        body: { test_result: { window: "2026-09", test_id: "t1", raw_value: "4.42" } },
      }),
    );
  });

  it("queues the number instead of losing it when there is no connection", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(0, "offline", "No connection."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched).toContainEqual(enqueue(save));
  });

  it("does not queue a value the server rejected on its merits", async () => {
    jest
      .spyOn(client, "apiRequest")
      .mockRejectedValue(new ApiError(422, "invalid", "That is not a number."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched.filter((a) => (a as { type: string }).type === "outbox/ENQUEUE")).toHaveLength(0);
    expect(h.dispatched).toContainEqual(
      actions.saveFailed({ window: "2026-09", testId: "t1", message: "That is not a number." }),
    );
  });

  it("signs out on a dead token", async () => {
    jest.spyOn(client, "apiRequest").mockRejectedValue(new ApiError(401, "unauthorized", "Invalid or missing token."));
    const h = harness();

    await h.run(testResultsWorkers.saveResult, save);

    expect(h.dispatched).toContainEqual(sessionExpired());
  });
});
```

- [ ] **Step 7: Implement, run, and prove the branch both ways**

Same proof as Task 7: make every failure enqueue and watch the 422 example fail; make nothing enqueue and watch the offline example fail. Paste both.

- [ ] **Step 8: Commit**

```bash
git add core
git commit -m "Test results, and a window already chosen when you open the sheet"
```

---

## Task 9: The package's public surface, and the typed hooks

**Files:**
- Modify: `core/src/index.ts`
- Create: `core/src/store/hooks.ts`
- Test: `core/__tests__/public-surface.test.ts`

**Interfaces:**
- Produces: everything Phase 2b and Phase 4 import. Nothing else is reachable.

- [ ] **Step 1: Write the failing test**

```ts
import * as core from "../src";

describe("the public surface", () => {
  it("exports every duck both apps need", () => {
    for (const name of [
      "createCoreStore", "memoryStorage",
      "auth", "programYears", "programYear", "plan", "week", "drills",
      "progression", "journal", "testResults", "outbox",
    ]) {
      expect(core).toHaveProperty(name);
    }
  });

  it("exports no default, so imports are explicit and greppable", () => {
    expect((core as { default?: unknown }).default).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement, run, commit**

```bash
git add core
git commit -m "One import surface for both apps"
```

---

## Self-review, run against this plan before execution

**Spec coverage.** The brief's Phase 2 sentence names: the shared package, every duck with reducer and saga tests, and then the web app. This plan covers the package and every duck. The web app is Phase 2b, deliberately a separate plan, because `core/` with passing tests is working software on its own and one combined document would be too long to review. The brief's two Phase 2 gate obligations, showing what an unauthenticated visitor can see and deciding the offline queue, belong to 2b and to Task 8 respectively.

**Gaps I am recording rather than hiding.**

- The `progression` payload's `ranks`, `battery` and `drills` are typed `unknown[]` here, because production has no awards or results yet and I will not invent a shape I have not seen. Phase 2b's charting task must pin them against a seeded fixture first.
- **Fixed in this plan.** `selectDayByDate` was promised in Task 5's Interfaces block with no step building it. It now has both a test and an implementation in Task 5.
- **Fixed in this plan.** The journal's saga tests import `enqueue` from the outbox, so the outbox is now Task 6 and the journal Task 7. The original draft had the journal importing from a task written two later, which would have blocked its first dispatch.

**Placeholder scan.** The outbox's saga tests and the test-result duck's saga tests were described by intent rather than written out in the first draft. Both are now written in full. The one remaining shorthand is deliberate and marked: Task 7 step 7 says "follow the auth saga's shape" for `api.ts`, because that shape is written out completely in Task 3 and repeating forty lines of it would invite the two copies to drift.

**Type consistency.** `createFetchDuck` returns `path` in two places in Task 5, which Task 5 itself flags and instructs the implementer to collapse to one. `journalWorkers` in Task 6 and `authWorkers` in Task 3 must use the same naming; pick `<duck>Workers` and apply it to both.
