import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// No test in this app should depend on a real network round trip. Left
// unstubbed, a sign in attempt here would call the real fetch, which for a
// fake host like "https://api.test" fails on DNS lookup in a handful of
// milliseconds: fast enough to race React's own render scheduling and make
// the transient "signingIn" state disappear before a test ever observes it.
// A test that wants a specific response (success, a rejection, a timeout)
// stubs fetch itself for that one case; this default just keeps everyone
// else from resolving mid-test.
vi.stubGlobal(
  "fetch",
  vi.fn(() => new Promise(() => {})),
);
