# Phase 2b: the React web app, shell and read screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the web app Teddy and Jeff actually open: sign in, the shape of the year, this month, this week's day cards, and the drill glossary, all reading from `core/` and nothing else.

**Architecture:** Vite, React 18, TypeScript, `react-redux` through `core/`'s typed hooks. The app owns screens and styling. It owns no state logic, no API calls and no types: every duck, selector and payload type comes from `@teddy-pe/core`, because Phase 4's native app imports the same ones and the brief forbids redefining any of them.

**Tech Stack:** Vite 5, React 18.3, TypeScript 5.3, Vitest with React Testing Library. No component library, no CSS framework, no charting library in this plan.

**Spec:** `docs/superpowers/specs/2026-09-13-rewrite-design.md`, and the brief at `docs/rewrite-prompt.md`.

**Follows:** `docs/superpowers/plans/2026-09-14-phase-2a-core-package.md`, which built `core/`. Phase 2c covers the journal forms, the test sheet, the progression charts, the soft delete and the deploy.

## Global Constraints

- **Nothing about Teddy may be in the bundle.** The old site served HTML only to a signed-in visitor. A decoupled SPA has a publicly readable bundle by definition, so every byte of program content, drill text, plan data and anything about Teddy arrives from the API behind a JWT. Task 1 builds a test that fails if that stops being true, and the Phase 2 gate must show what an unauthenticated visitor can see.
- **No duck may be redefined.** If a screen needs state logic the surface does not expose, the answer is to change `core/`, not to write it here. Say so rather than working around it.
- **The server sleeps.** A cold Fly machine plus a suspended Neon branch measured **6.6 to 7.6 seconds** in production. Every screen that waits on data shows a real loading state on first paint, never a blank panel, and no timeout is shorter than the client's 15 seconds.
- **Teddy is 7 and is reading.** Anything he uses gets big targets, few words, and his own cue language. Anything Jeff uses can be denser.
- **Voice**, per `CLAUDE.md`: direct, warm, specific. No em dashes. No "it's not X, it's Y" constructions.
- **Test quality.** Phase 1 and 2a found twenty-two assertions that passed while checking nothing, and six cases where a correct assertion sat against a fixture that could not exercise it. Every task below names the fixture trap most likely to bite it. A test proves nothing until you have broken the code and watched it fail.

## What `core/` gives you

Read `core/src/index.ts` before starting. Its comments explain every narrowing. In short:

```ts
createCoreStore, memoryStorage, useAppSelector, useAppDispatch
authActions        { signIn, signOut, restoreSession }        + authSelectors
journalActions     { saveAthleteEntry, saveCoachEntry, setShared } + journalSelectors
testResultsActions { fetchResults, saveResult }               + testResultsSelectors
outboxActions      { replay }                                 + outboxSelectors
programYears, programYear, plan, week, drills, progression   each { actions: { fetch }, selectors }
selectWeek, selectDayByDate, selectWeekBudget, selectWeekSpend
selectDrills, selectDrillBySlug, selectDrillsMatching
```

Every duck's selectors are `selectData`, `selectIsLoading`, `selectError`. Types for every payload are exported too.

`core/` deliberately does not export `apiRequest` or `ApiError`. Every duck converts an error to a plain string before a selector returns it, so a screen renders `selectError(...)` directly.

---

## File structure

```
web/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx              mounts React, builds the store, injects browser storage
    storage.ts            the Storage adapter over localStorage, the one platform seam
    App.tsx               the shell: auth gate, nav, error boundary
    routes.tsx            route table
    screens/
      SignIn.tsx
      Year.tsx
      Month.tsx
      ThisWeek.tsx
      Glossary.tsx
    components/
      Loading.tsx         the cold-start state, used by every screen
      ErrorNote.tsx       a failure a person can act on
      DayCard.tsx
      DrillPanel.tsx
      Tokens.tsx          renders core's name_tokens / body_tokens
    styles.css
  __tests__/
```

One screen per file. Components are shared only once a second screen needs them, because a component extracted for one caller is a guess about the second.

---

## Task 1: The app boots, and proves it holds no secrets

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`
- Create: `web/src/main.tsx`, `web/src/storage.ts`, `web/src/App.tsx`, `web/src/styles.css`
- Test: `web/__tests__/storage.test.ts`, `web/__tests__/bundle-privacy.test.ts`

**Interfaces:**
- Consumes: `createCoreStore`, `Storage` from `@teddy-pe/core`.
- Produces: `browserStorage(): Storage`; a mounted app with the store provided.

- [ ] **Step 1: Write the failing storage test**

`web/__tests__/storage.test.ts`:

```ts
import { browserStorage } from "../src/storage";

describe("browserStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a value", async () => {
    const s = browserStorage();
    await s.setItem("k", "v");
    expect(await s.getItem("k")).toBe("v");
    await s.removeItem("k");
    expect(await s.getItem("k")).toBeNull();
  });

  it("returns null rather than throwing when storage is unavailable", async () => {
    // Safari in private mode throws on setItem. An app that crashes on boot
    // because it could not cache a token is worse than one that signs in again.
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    const s = browserStorage();
    await expect(s.setItem("k", "v")).resolves.toBeUndefined();
    window.localStorage.setItem = original;
  });

  it("returns null for a key that was never set", async () => {
    expect(await browserStorage().getItem("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

`cd web && npx vitest run storage` — expect module not found.

- [ ] **Step 3: Write the adapter**

`web/src/storage.ts`:

```ts
import type { Storage } from "@teddy-pe/core";

// The one place this app differs from the native app. core/ takes storage as
// an interface precisely so Phase 4 can hand it expo-secure-store instead,
// with no duck rewritten.
export function browserStorage(): Storage {
  return {
    async getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // A private window, or a full disk. Losing the cached session means
        // signing in again, which is a nuisance. Crashing means the app does
        // not open at all.
      }
    },
    async removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Same reasoning.
      }
    },
  };
}
```

- [ ] **Step 4: Run the storage tests**

Expect 3 passing.

- [ ] **Step 5: Write the failing bundle-privacy test**

This is the test the Phase 2 gate rests on, and the brief calls it out by name. It builds the app for production and reads what comes out.

`web/__tests__/bundle-privacy.test.ts`:

```ts
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Words that exist only in Teddy's program. If any of these reach the bundle,
// a stranger with the URL can read something about a 7-year-old.
const MUST_NOT_APPEAR = [
  "Teddy",
  "teddymaxim",
  "Land Like a Cat",
  "Cub",
  "cartwheel",
  "high-intent",
  "Champion",
];

describe("the production bundle", () => {
  let files: string[];

  beforeAll(() => {
    execSync("npm run build", { cwd: join(__dirname, ".."), stdio: "pipe" });
    const dir = join(__dirname, "..", "dist", "assets");
    files = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8"));
  }, 120_000);

  it("was actually built, so this test is reading something", () => {
    // Without this, an empty dist would pass every assertion below.
    expect(files.length).toBeGreaterThan(0);
    expect(files.join("").length).toBeGreaterThan(1000);
  });

  it.each(MUST_NOT_APPEAR)("does not contain %s", (word) => {
    const found = files.filter((f) => f.toLowerCase().includes(word.toLowerCase()));
    expect(found).toHaveLength(0);
  });

  it("does contain the app's own chrome, proving the search works", () => {
    // If the search were broken, every assertion above would pass for the
    // wrong reason. This is the control.
    expect(files.some((f) => f.includes("Sign in"))).toBe(true);
  });
});
```

- [ ] **Step 6: Note the two guards, and why they are there**

The "was actually built" example and the "does contain" control both exist because a set of `not.toContain` assertions passes perfectly against an empty string. This project has found six cases where a correct assertion sat against a fixture that could not exercise it. A privacy test that passes because it is reading nothing is the most expensive possible version of that.

- [ ] **Step 7: Write the scaffold**

`web/package.json`:

```json
{
  "name": "@teddy-pe/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@teddy-pe/core": "file:../core",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-redux": "^9.1.2",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "~5.3.3",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

`web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

`web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createCoreStore } from "@teddy-pe/core";
import { browserStorage } from "./storage";
import { App } from "./App";
import "./styles.css";

// The API host is the one thing this bundle carries about the deployment, and
// it is not a secret: it is the public address of a server that answers 401 to
// everything without a token.
const baseUrl = import.meta.env.VITE_API_URL;
if (!baseUrl) {
  throw new Error("VITE_API_URL is not set. The app has no API to talk to.");
}

const store = createCoreStore({ baseUrl, storage: browserStorage() });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
```

- [ ] **Step 8: Run the build and the bundle test**

`cd web && npm install && npx vitest run` — expect the storage tests and the bundle tests to pass.

- [ ] **Step 9: Prove the privacy test can fail**

Add `const SECRET = "Land Like a Cat";` and use it in a rendered string somewhere in `App.tsx`. Run the bundle test and confirm it fails on that word. Remove it and confirm it passes. Paste both.

A privacy assertion nobody has watched fail is a privacy assertion nobody should trust.

- [ ] **Step 10: Commit**

```bash
git add web
git commit -m "A web app that boots, and a test that reads its own bundle"
```

---

## Task 2: Signing in, and a server that was asleep

**Files:**
- Create: `web/src/screens/SignIn.tsx`, `web/src/components/Loading.tsx`, `web/src/components/ErrorNote.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/__tests__/sign-in.test.tsx`

**Interfaces:**
- Consumes: `authActions`, `authSelectors`, `useAppSelector`, `useAppDispatch`.
- Produces: `<SignIn />`, `<Loading label={...} />`, `<ErrorNote message={...} />`. `App` restores the session on mount and renders `SignIn` when signed out.

- [ ] **Step 1: Write the failing tests**

`web/__tests__/sign-in.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage, authActions } from "@teddy-pe/core";
import { SignIn } from "../src/screens/SignIn";

function renderSignedOut() {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  const dispatched: unknown[] = [];
  const realDispatch = store.dispatch;
  store.dispatch = ((a: never) => {
    dispatched.push(a);
    return realDispatch(a);
  }) as typeof store.dispatch;
  render(
    <Provider store={store}>
      <SignIn />
    </Provider>,
  );
  return { store, dispatched };
}

describe("the sign in screen", () => {
  it("dispatches signIn with what was typed", async () => {
    const { dispatched } = renderSignedOut();

    await userEvent.type(screen.getByLabelText(/email/i), "frey.maxim@gmail.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(dispatched).toContainEqual(
      authActions.signIn({ email: "frey.maxim@gmail.com", password: "hunter2" }),
    );
  });

  it("shows the API's own message when sign in fails", async () => {
    // The server says "That email and password do not match." and deliberately
    // does not say which one was wrong. Writing our own copy here would leak
    // exactly what the server is careful not to.
    const { store } = renderSignedOut();
    store.dispatch({ type: "auth/SIGN_IN_FAILED", payload: "That email and password do not match." });

    expect(await screen.findByText("That email and password do not match.")).toBeInTheDocument();
  });

  it("says the server may be waking, because it takes seven seconds", async () => {
    // A cold Fly machine plus a suspended Neon branch measured 6.6 to 7.6
    // seconds. Seven seconds of nothing reads as broken; seven seconds of
    // "waking up" reads as slow.
    const { store } = renderSignedOut();
    store.dispatch(authActions.signIn({ email: "a@b.c", password: "x" }));

    expect(await screen.findByText(/waking/i)).toBeInTheDocument();
  });

  it("disables the button while a sign in is in flight, so one tap is one attempt", async () => {
    const { store } = renderSignedOut();
    store.dispatch(authActions.signIn({ email: "a@b.c", password: "x" }));

    expect(await screen.findByRole("button", { name: /waking|signing/i })).toBeDisabled();
  });

  it("does not submit an empty form", async () => {
    const { dispatched } = renderSignedOut();
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(dispatched.filter((a) => (a as { type: string }).type === "auth/SIGN_IN")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Write `Loading` and `ErrorNote`**

```tsx
// web/src/components/Loading.tsx
export function Loading({ label }: { label: string }) {
  return (
    <p className="loading" role="status" aria-live="polite">
      {label}
    </p>
  );
}
```

```tsx
// web/src/components/ErrorNote.tsx
export function ErrorNote({ message }: { message: string }) {
  // role="alert" so a screen reader says it without being asked. The message
  // comes from the API, which is careful about what it reveals.
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}
```

- [ ] **Step 4: Write `SignIn`**

Use `authSelectors.selectAuthStatus` to decide the button's label and disabled state, and `authSelectors.selectAuthError` for the message. The waking copy appears while the status is `signingIn`. Keep the form to two fields and one button.

- [ ] **Step 5: Run the tests**

Expect 5 passing.

- [ ] **Step 6: Prove the waking copy is tied to the status**

Change the condition so the waking text renders unconditionally. The "disables the button" example must still pass and nothing else should change, which tells you that example is not doing the work you think. Then change it so the text never renders and confirm the waking example fails. Paste both. A loading state asserted only by its presence is satisfied by a label that is always there.

- [ ] **Step 7: Restore the session on mount**

`App` dispatches `authActions.restoreSession()` once on mount, renders `Loading` while the status is `restoring`, `SignIn` while `anonymous`, and its children once `signedIn`.

- [ ] **Step 8: Write the failing test for that, run it, make it pass**

```tsx
it("does not flash the sign in form while a stored session is being restored", async () => {
  // The session is in storage and the app knows it. Showing a login form for
  // a moment and then replacing it is how an app looks broken on every launch.
  const storage = memoryStorage();
  await storage.setItem("teddy-pe.session", JSON.stringify({ jwt: "a.b.c", user: { id: 1, email: "a@b.c", name: "Jeff", role: "coach" } }));
  const store = createCoreStore({ baseUrl: "https://api.test", storage });
  render(<Provider store={store}><App /></Provider>);

  expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 9: Commit**

```bash
git add web
git commit -m "Signing in, and saying so when the server is still waking up"
```

---

## Task 3: The shell, and who is allowed where

**Files:**
- Create: `web/src/routes.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: `authSelectors.selectRole`.
- Produces: the nav, the routes, and an error boundary. Later tasks add screens to `routes.tsx`.

The three roles differ, and the app must not show a person a door that the API will slam. Emily is a viewer: the API answers 403 on both journals for her. Teddy is the athlete: the API answers 403 on the coach's notes.

- [ ] **Step 1: Write the failing tests**

```tsx
const screensFor = (role: "coach" | "athlete" | "viewer") => { /* render App with a signed-in store */ };

it("shows Jeff every tab", () => { /* year, month, week, glossary, journal, tests */ });

it("does not show Emily a journal tab at all", () => {
  // The API answers 403. A tab that always errors is worse than no tab,
  // because she will assume she is doing something wrong.
});

it("does not show Teddy the coach's notes", () => {});

it("shows the same tabs after a reload, because the role comes from the restored session", () => {});
```

Write these out fully when implementing, with a real store per role.

- [ ] **Step 2 to 5: run, implement, run, prove**

The proof that matters: make the nav render every tab regardless of role and confirm the Emily and Teddy examples both fail. A role test where every role sees the same thing is satisfied by no filtering at all.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "A shell that does not show a door the API will slam"
```

---

## Task 4: The Year

**Files:**
- Create: `web/src/screens/Year.tsx`
- Modify: `web/src/routes.tsx`
- Test: `web/__tests__/year.test.tsx`

**Interfaces:**
- Consumes: `programYear.actions.fetch`, `programYear.selectors`, `ProgramYearDetail`.

The Year payload is the shape of the whole program: six blocks, nine areas each with a cell per block, nine patches, three ball gates, the battery, the test dates, the seven day roles, and the north star. It is the densest screen in the app and it is Jeff's, not Teddy's, so it can be a table.

- [ ] **Step 1: Write the failing tests**

Cover: it fetches on mount with the current year id; it shows `Loading` before data and keeps showing the old data on a refetch rather than blanking; it renders all nine areas in `position` order; it marks the current block; it renders the ball gate whose `status` is active differently from the others; it shows `north_star`.

The fixture trap here: **build the fixture with areas out of order**, so "renders in position order" can fail. A fixture already in order passes against a component that does no sorting.

- [ ] **Step 2 to 6: run, implement, run, prove**

Prove the ordering by shuffling the fixture and confirming the test still passes, which means the component sorts, then removing the sort and confirming it fails.

- [ ] **Step 7: Commit**

---

## Task 5: The month

**Files:**
- Create: `web/src/screens/Month.tsx`
- Test: `web/__tests__/month.test.tsx`

**Interfaces:**
- Consumes: `plan.actions.fetch`, `plan.selectors`, `MonthPlan`.

Each week shows its theme, its dates, its sub-targets, its Challenge of the Week, and its high-intent effort spend against its budget. The day cards here are summaries: the month payload genuinely omits `blocks`, `dad_note`, `coach_entry` and `athlete_entry`, which appear only in the week payload.

- [ ] **Steps**

Tests cover: the fetch on mount for a month; all three weeks render; each week's spend and budget both appear; a Trials week is marked; a week over budget is visibly over.

The fixture trap: **the budget is 40 and week 1's spend is 28**, so a component that prints the spend twice, or the budget twice, looks right in a fixture where they are equal. Give the fixture weeks with different spends and assert both numbers per week.

---

## Task 6: This Week, and the day cards

**Files:**
- Create: `web/src/screens/ThisWeek.tsx`, `web/src/components/DayCard.tsx`, `web/src/components/Tokens.tsx`
- Test: `web/__tests__/this-week.test.tsx`, `web/__tests__/tokens.test.tsx`

**Interfaces:**
- Consumes: `week.actions.fetch`, `selectWeek`, `selectDayByDate`, `selectWeekBudget`, `selectWeekSpend`, `DayCard`, `DayBlock`, `Token`.

This is the screen Teddy opens. Big targets, few words, his own language.

`Tokens` renders `name_tokens` and `body_tokens`, which `core/` receives as flat arrays from the API rather than as HTML. A token has `text`, `type` and `style`, and a drill token also has `slug`. That flatness exists so the native app can render the same content without a HTML parser, so this component must not reassemble them into markup and then style the markup.

- [ ] **Steps**

`Tokens` tests: plain text renders as text; a token with `style` renders with that style; a drill token renders as something tappable carrying its slug; an unknown token type renders its text rather than disappearing.

That last one matters: a renderer that drops what it does not recognise loses a day's instructions silently the first time the API adds a token type.

Day card tests: today's card is distinguished; every day of the week renders; the effort count appears; Saturday shows as the home program being off rather than as an empty card.

The fixture trap: **a fixture with one token type proves nothing about a renderer that handles one type.** Build fixtures with several, including one unknown.

---

## Task 7: The glossary

**Files:**
- Create: `web/src/screens/Glossary.tsx`, `web/src/components/DrillPanel.tsx`
- Test: `web/__tests__/glossary.test.tsx`

**Interfaces:**
- Consumes: `drills.actions.fetch`, `selectDrills`, `selectDrillsMatching`, `selectDrillBySlug`, `Drill`.

84 drills. Search, and a panel showing one: its cue, how to do it, what to watch, and its area.

- [ ] **Steps**

Tests cover: it fetches on mount; typing filters; an alias match works; an empty query shows everything rather than nothing; selecting one opens the panel with its cue and steps; closing returns to the list; a slug that does not exist shows a message rather than a blank panel.

The fixture trap, and it is the one that already caught this project: **the alias must not be a substring of the drill's name.** A drill named `Cartwheel` with the alias `wheel` passes the alias test through its name. Use an alias like `flip`, and prove it by deleting the alias branch in `core/`'s selector and watching the test fail.

---

## Self-review

**Spec coverage.** The brief's Phase 2 names login, Year, month, This Week with day cards, Glossary, both journal forms, and cross-year progression charts. This plan covers the first five. The journal forms, the test sheet, the progression charts, the soft delete Jeff asked for and the deploy are Phase 2c, kept separate so each plan stays reviewable and building can start sooner.

**The two Phase 2 gate obligations** are tracked: the offline queue was decided and built in 2a, and what an unauthenticated visitor can see is Task 1's bundle test plus a live check at the 2c deploy.

**Placeholders.** Tasks 3 to 7 give test intent, fixture traps and proof steps rather than full test bodies. That is deliberate for screens whose markup does not exist yet and would otherwise be invented twice, and it is a real weakness by the planning skill's own rule. **Each of those tasks must have its tests written out in full before it is dispatched**, from the actual component API, not from this sketch. Tasks 1 and 2 are written out fully because they set the patterns the rest copy.

**Type consistency.** Every payload type named here is exported from `core/src/index.ts` under the name used. `Week` is exported as `WeekPayload` to avoid colliding with the `week` duck, and this plan uses that name.
