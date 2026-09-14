import { useLayoutEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage, authActions } from "@teddy-pe/core";
import { SignIn } from "../src/screens/SignIn";
import { App } from "../src/App";

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

  it("leaves the signingIn state once a sign in actually resolves", async () => {
    // The global fetch stub in vitest.setup.ts never resolves, which is
    // exactly right for the two tests above: they only need signingIn to be
    // reached, and reaching it is all core's reducer needs the SIGN_IN
    // action itself for, before any saga or fetch runs. But that stub also
    // means nothing in this file proves the button re-enables or the
    // waking copy goes away once a sign in actually finishes. This test
    // resolves fetch with a real login response for this one case only, so
    // it, and only it, gets past signingIn.
    // A short, real delay before resolving, not an instant one. An instant
    // mock races React's own render scheduling exactly the way the real DNS
    // failure did in vitest.setup.ts's comment: fast enough that the
    // signingIn commit and the signedIn commit can collapse into one and
    // the transient state is never observed. A real login response takes
    // measurable wall-clock time; this mirrors that instead of asserting
    // against a race.
    const originalFetch = global.fetch;
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({
                    jwt: "a.b.c",
                    user: { id: 1, email: "a@b.c", name: "Jeff", role: "coach" },
                  }),
                  { status: 200 },
                ),
              ),
            10,
          ),
        ),
    ) as typeof fetch;

    try {
      const { store } = renderSignedOut();
      store.dispatch(authActions.signIn({ email: "a@b.c", password: "x" }));

      // In flight: the waking copy is up and the button is disabled.
      expect(await screen.findByText(/waking/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /waking|signing/i })).toBeDisabled();

      // Resolved: the waking copy is gone and the button is itself again.
      await waitFor(() => {
        expect(screen.queryByText(/waking/i)).not.toBeInTheDocument();
      });
      const button = screen.getByRole("button", { name: /sign in/i });
      expect(button).not.toBeDisabled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("restoring a stored session", () => {
  it("does not flash the sign in form while a stored session is being restored", async () => {
    // The session is in storage and the app knows it. Showing a login form for
    // a moment and then replacing it is how an app looks broken on every launch.
    //
    // restoreSession() is dispatched here, before render, the same order
    // main.tsx uses: App itself no longer dispatches it from a useEffect (a
    // useEffect fires after first paint, which is the flash this guards
    // against; see src/main.tsx). Testing Library's render() also wraps
    // this whole mount in act(), which flushes any effect synchronously
    // regardless, so this test alone could pass even if App still dispatched
    // from an effect and the real app still flashed on every launch. That
    // gap is real; the test below closes it.
    const storage = memoryStorage();
    await storage.setItem("teddy-pe.session", JSON.stringify({ jwt: "a.b.c", user: { id: 1, email: "a@b.c", name: "Jeff", role: "coach" } }));
    const store = createCoreStore({ baseUrl: "https://api.test", storage });
    store.dispatch(authActions.restoreSession());
    render(<Provider store={store}><App /></Provider>);

    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("never commits the sign in form's first frame, checked without Testing Library's act() flush", async () => {
    // The gap in the test above: render() from @testing-library/react wraps
    // mount and any useEffect in act(), which flushes passive effects
    // synchronously. A real browser does not: it paints, then runs passive
    // effects afterward. This renders with raw createRoot instead (the same
    // call main.tsx makes), so nothing is synchronously flushing anything,
    // and reads the DOM at the true first commit (see the comment further
    // down for how that point is found without racing the scheduler).
    const storage = memoryStorage();
    await storage.setItem("teddy-pe.session", JSON.stringify({ jwt: "a.b.c", user: { id: 1, email: "a@b.c", name: "Jeff", role: "coach" } }));
    const store = createCoreStore({ baseUrl: "https://api.test", storage });

    // The order main.tsx uses: dispatch before the tree renders at all.
    store.dispatch(authActions.restoreSession());

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    // createRoot's initial mount is itself scheduled, not synchronous, so
    // there is nothing in the DOM the instant render() returns; a delay or a
    // MutationObserver only turns this into a different race (confirmed:
    // both flipped pass/fail on nothing but incidental timing while writing
    // this test). The one guarantee React actually makes, independent of
    // scheduling, is ordering: every useLayoutEffect for a commit runs
    // synchronously, still inside that commit, strictly before any
    // useEffect anywhere in the same tree gets a chance to run (that
    // includes App's restoreSession dispatch, useEffect-based or not). A
    // sibling that captures the DOM from its own useLayoutEffect is
    // therefore reading the true first frame no matter how the scheduler
    // happens to interleave things underneath it.
    const firstFrame = await new Promise<string>((resolve) => {
      let captured = false;
      function Snapshot() {
        useLayoutEffect(() => {
          if (!captured) {
            captured = true;
            resolve(container.textContent ?? "");
          }
        });
        return null;
      }
      root.render(
        <Provider store={store}>
          <Snapshot />
          <App />
        </Provider>,
      );
    });

    expect(firstFrame).not.toMatch(/sign in/i);

    // And it actually gets somewhere: not just "never shows sign in
    // because it never renders anything at all."
    await screen.findByRole("button", { name: /sign out/i });

    root.unmount();
    container.remove();
  });
});
