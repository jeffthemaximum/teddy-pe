import { createCoreStore, authActions } from "@teddy-pe/core";
import type { CoreDeps } from "@teddy-pe/core";

// The one sequence that has to run before anything renders: build the
// store, then dispatch restoreSession() on it immediately, before React
// ever mounts. A useEffect fires after first paint, so a dispatch from one
// would still let a perfectly good stored session commit the sign-in form
// for one frame before replacing it, which is the flash App is not supposed
// to show (see App.tsx). Dispatching here, before render, means the reducer
// is already past "anonymous" by the time anything asks React to mount.
//
// main.tsx calls this to boot the real app, and nothing else calls
// createCoreStore directly for that purpose. Tests that render App call it
// too, for the same reason main.tsx does: a test that built its own store
// and dispatched restoreSession by hand was testing a bootstrap sequence
// only the test ran, not the one main.tsx ships, and a regression that
// moved this dispatch into App itself would not have shown up in a test
// that dispatched it independently either way. Routing both through this
// one function means a test exercises the real sequence, not an imitation
// of it.
export function createAppStore(deps: CoreDeps) {
  const store = createCoreStore(deps);
  store.dispatch(authActions.restoreSession());
  return store;
}
