import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage, authActions } from "@teddy-pe/core";
import type { Role } from "@teddy-pe/core";
import { App } from "../src/App";
import { stubMe } from "../vitest.setup";

const USERS: Record<Role, { id: number; email: string; name: string; role: Role }> = {
  coach: { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" },
  athlete: { id: 2, email: "teddymaxim225@gmail.com", name: "Teddy", role: "athlete" },
  viewer: { id: 3, email: "emmabark22@gmail.com", name: "Emily Barker", role: "viewer" },
};

// Signed in the way a real launch does it: the session is in storage and the
// app restores it. Dispatching a fake signed-in action would not work anyway,
// because core deliberately keeps signInSucceeded off its public surface.
//
// restoreSession() is dispatched here, on the store, before render, the same
// order main.tsx uses and for the same reason: App itself no longer dispatches
// it from a useEffect, because a useEffect fires after first paint and that is
// the flash the app is not supposed to show (see src/main.tsx and the no-flash
// test in sign-in.test.tsx). A test that renders App has to set the store up
// the same way main.tsx does, or it is testing a bootstrap sequence the real
// app never runs.
async function renderAs(role: Role) {
  const storage = memoryStorage();
  await storage.setItem(
    "teddy-pe.session",
    JSON.stringify({ jwt: "a.b.c", user: USERS[role] }),
  );
  stubMe(USERS[role]);
  const store = createCoreStore({ baseUrl: "https://api.test", storage });
  store.dispatch(authActions.restoreSession());
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  await screen.findByRole("navigation");
  return store;
}

const tab = (name: RegExp) => screen.queryByRole("link", { name });

// Every test in this file that navigates the URL directly leaves window
// history where it left it otherwise, and BrowserRouter reads whatever is
// there at mount time. Reset it after every test, not just the ones that
// touch it, since jsdom's window (and its history) is shared for the whole
// file's run, not recreated per test.
afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("the shell", () => {
  it("shows Jeff every tab, including his own notes", async () => {
    await renderAs("coach");
    for (const name of [/year/i, /month/i, /this week/i, /glossary/i, /progress/i, /tests/i]) {
      expect(tab(name)).toBeInTheDocument();
    }
    expect(tab(/journal/i)).toBeInTheDocument();
    expect(tab(/notes/i)).toBeInTheDocument();
  });

  it("shows Teddy his journal and not his dad's notes", async () => {
    // The API answers 403 on coach_entries for him. A tab he can tap that
    // always fails teaches a 7-year-old that the app is broken.
    await renderAs("athlete");
    expect(tab(/journal/i)).toBeInTheDocument();
    expect(tab(/notes/i)).not.toBeInTheDocument();
  });

  it("shows Emily the program and neither journal", async () => {
    // Shared means shared with Dad, not published. The API answers 403 on
    // both journals for her, and the nav has to agree with that.
    await renderAs("viewer");
    expect(tab(/year/i)).toBeInTheDocument();
    expect(tab(/tests/i)).toBeInTheDocument();
    expect(tab(/journal/i)).not.toBeInTheDocument();
    expect(tab(/notes/i)).not.toBeInTheDocument();
  });

  it("shows no nav at all before anyone signs in", async () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    store.dispatch(authActions.restoreSession());
    render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("puts the signed-in person's name where they can see who they are", async () => {
    // Two people share this iPad. Knowing which of them the app thinks you
    // are is the difference between a private entry and a public one.
    // Scoped to the header landmark, which is the one place the shell ever
    // renders the signed-in person's name, rather than a bare page-wide
    // text search that any stray "teddy" elsewhere would also satisfy.
    await renderAs("athlete");
    const header = screen.getByRole("banner");
    expect(within(header).getByText(/teddy/i)).toBeInTheDocument();
  });

  it("offers a way to sign out, and tapping it actually dispatches signOut", async () => {
    const storage = memoryStorage();
    await storage.setItem(
      "teddy-pe.session",
      JSON.stringify({ jwt: "a.b.c", user: USERS.coach }),
    );
    stubMe(USERS.coach);
    const store = createCoreStore({ baseUrl: "https://api.test", storage });
    store.dispatch(authActions.restoreSession());
    const dispatched: unknown[] = [];
    const realDispatch = store.dispatch;
    store.dispatch = ((a: never) => {
      dispatched.push(a);
      return realDispatch(a);
    }) as typeof store.dispatch;

    render(<Provider store={store}><App /></Provider>);
    await screen.findByRole("navigation");

    const button = screen.getByRole("button", { name: /sign out/i });
    await userEvent.click(button);

    expect(dispatched).toContainEqual(authActions.signOut());
  });

  it("keeps the same tabs after a reload, because the role comes from the restored session", async () => {
    // The role is not held in component state. This is the test that fails if
    // someone decides to pass it down as a prop from the sign-in screen.
    const storage = memoryStorage();
    await storage.setItem(
      "teddy-pe.session",
      JSON.stringify({ jwt: "a.b.c", user: USERS.viewer }),
    );
    stubMe(USERS.viewer);
    const store = createCoreStore({ baseUrl: "https://api.test", storage });
    store.dispatch(authActions.restoreSession());

    const { unmount } = render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    await screen.findByRole("navigation");
    expect(tab(/journal/i)).not.toBeInTheDocument();

    // A literal reload: tear the whole tree down and build it again, reusing
    // the same store (a real reload would not even keep the store, only
    // localStorage; this is the cheaper half of that and worth keeping).
    unmount();
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    await screen.findByRole("navigation");
    expect(tab(/journal/i)).not.toBeInTheDocument();

    // The half that actually has teeth, verified by injecting the bug (see
    // the task report for the pasted proof). A role frozen inside Shell's
    // own state cannot fail the two checks above no matter what: Shell only
    // ever exists in the signedIn branch and is torn down and rebuilt on
    // every restoreSession replay regardless of where it reads role from, so
    // a fresh, correct value is unavoidable right after any such unmount.
    // A role frozen one level up, in App itself, which does *not* unmount
    // across a restoreSession replay (only the branch it returns does), and
    // handed down to Shell as a prop, is the actual shape of "passed down
    // from the sign in screen" the comment above warns about, and it *does*
    // survive an unmount of Shell alone. The only way to see that is to
    // change the session while the tree stays mounted, with no unmount at
    // all, and confirm the nav still catches up.
    await storage.setItem(
      "teddy-pe.session",
      JSON.stringify({ jwt: "z.y.x", user: USERS.coach }),
    );
    stubMe(USERS.coach);
    store.dispatch(authActions.restoreSession());
    expect(await screen.findByRole("link", { name: /notes/i })).toBeInTheDocument();
  });

  it("shows the read-only program, not a dead end, for a role this app has never heard of", async () => {
    // Role arrives as a plain string in the API's response; TypeScript's
    // Role type checks nothing at runtime. An unrecognized role is either a
    // bug in the API or a new account type, and the two safe assumptions
    // point different ways for different tabs: fail OPEN for the four
    // endpoints that answer 200 for every role Phase 1 tested (there is no
    // reason to expect a role we cannot name would be refused there either,
    // and the API still has the final say), fail CLOSED for the two that
    // are restricted by name, because a 403 tab is worse than no tab and a
    // guess should not be the one taking that risk.
    const storage = memoryStorage();
    const guest = { id: 9, email: "guest@example.com", name: "Guest", role: "guest" };
    await storage.setItem(
      "teddy-pe.session",
      JSON.stringify({ jwt: "a.b.c", user: guest }),
    );
    stubMe(guest);
    const store = createCoreStore({ baseUrl: "https://api.test", storage });
    store.dispatch(authActions.restoreSession());
    render(<Provider store={store}><App /></Provider>);
    await screen.findByRole("navigation");

    expect(tab(/year/i)).toBeInTheDocument();
    expect(tab(/tests/i)).toBeInTheDocument();
    expect(tab(/journal/i)).not.toBeInTheDocument();
    expect(tab(/notes/i)).not.toBeInTheDocument();
  });
});

describe("direct navigation to a route the role cannot use", () => {
  // The nav hides Notes and Journal from the roles that cannot use them, but
  // a typed or bookmarked URL bypasses the nav entirely. These prove the
  // route itself refuses, not just the tab.
  it("does not render the coach's notes for the athlete", async () => {
    window.history.pushState({}, "", "/notes");
    await renderAs("athlete");
    expect(screen.queryByText(/notes is coming soon/i)).not.toBeInTheDocument();
  });

  it("does not render the coach's notes for the viewer", async () => {
    window.history.pushState({}, "", "/notes");
    await renderAs("viewer");
    expect(screen.queryByText(/notes is coming soon/i)).not.toBeInTheDocument();
  });

  it("does not render the journal for the viewer", async () => {
    window.history.pushState({}, "", "/journal");
    await renderAs("viewer");
    expect(screen.queryByText(/journal is coming soon/i)).not.toBeInTheDocument();
  });

  it("does render the coach's notes for the coach, so the guard is not just blocking everyone", async () => {
    // Without this, all three examples above would also pass against a
    // guard that redirects home unconditionally, which guards nothing.
    window.history.pushState({}, "", "/notes");
    await renderAs("coach");
    expect(screen.getByText(/notes is coming soon/i)).toBeInTheDocument();
  });
});
