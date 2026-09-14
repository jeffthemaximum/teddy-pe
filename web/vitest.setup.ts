import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import type { User } from "@teddy-pe/core";

// No test in this app should depend on a real network round trip. Left
// unstubbed, a sign in attempt here would call the real fetch, which for a
// fake host like "https://api.test" fails on DNS lookup in a handful of
// milliseconds: fast enough to race React's own render scheduling and make
// the transient "signingIn" state disappear before a test ever observes it.
// A test that wants a specific response (success, a rejection, a timeout)
// stubs fetch itself for that one case; this default just keeps everyone
// else from resolving mid-test.
const neverResolves = () => new Promise<never>(() => {});

vi.stubGlobal("fetch", vi.fn(neverResolves));

// core now fetches GET /api/v1/me after both a sign-in and a restore, and
// holds status "restoring" until it answers (see
// core/src/ducks/auth/sagas.ts). Every test that renders a signed-in shell
// therefore needs /me to resolve, or it hangs against the default above
// forever. stubMe() is how a test turns that one route on.
//
// Role arrives off the API as a plain string; TypeScript's Role union
// checks nothing at runtime (see the "role this app has never heard of"
// test in shell.test.tsx), so the stub accepts any string role rather than
// only the three this app currently knows how to render.
type MeUser = Omit<User, "role"> & { role: string };

// The shape backend/app/controllers/api/v1/me_controller.rb answers with.
// Not reached for from @teddy-pe/core: MeResponse is duck-internal, not
// part of core's public surface, so it is written out here instead.
interface MeResponse {
  user: MeUser;
  athlete: { id: number; name: string; birthday: string } | null;
  current_program_year_id: number | null;
}

// Teddy's own record, captured from the deployed API. Nothing in these
// tests asserts against the athlete or the program year, only against who
// is signed in and what role they render as, so one fixed athlete for
// every user under test is enough to unblock a restore or a sign-in and
// never a reason to invent a different one per role.
const ATHLETE = { id: 1, name: "Teddy Maxim", birthday: "2019-01-09" };
const PROGRAM_YEAR_ID = 1;

/**
 * Installs a fetch stub that answers GET /api/v1/me as `user`, while every
 * other request keeps hanging forever, same as the file-level default
 * above. Routed by URL rather than answering everything: a test that
 * reaches some other real endpoint this stub was not told about still
 * hangs and times out, visibly, instead of quietly passing against
 * invented data.
 *
 * The `user` /me answers with has to be the same person the test put in
 * storage or dispatched signIn as. A stub that always answered "Jeff,
 * coach" would pass the athlete and viewer shell tests for the wrong
 * reason, or fail them on a role mismatch nobody wrote. So this is a
 * function a test calls with its own user, right before rendering, rather
 * than one global answer installed once for the whole file.
 */
export function stubMe(user: MeUser) {
  const me: MeResponse = {
    user,
    athlete: ATHLETE,
    current_program_year_id: PROGRAM_YEAR_ID,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/v1/me")) {
        return Promise.resolve(new Response(JSON.stringify(me), { status: 200 }));
      }
      return neverResolves();
    }),
  );
}
