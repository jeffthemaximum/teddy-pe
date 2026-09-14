import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage, authActions } from "@teddy-pe/core";
import type { Role } from "@teddy-pe/core";
import { App } from "../src/App";

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
    await renderAs("athlete");
    expect(screen.getByText(/teddy/i)).toBeInTheDocument();
  });

  it("offers a way to sign out", async () => {
    await renderAs("coach");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("keeps the same tabs after a reload, because the role comes from the restored session", async () => {
    // The role is not held in component state. This is the test that fails if
    // someone decides to pass it down as a prop from the sign-in screen.
    await renderAs("viewer");
    expect(tab(/journal/i)).not.toBeInTheDocument();
  });
});
