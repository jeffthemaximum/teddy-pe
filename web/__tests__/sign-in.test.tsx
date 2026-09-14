import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
});

describe("restoring a stored session", () => {
  it("does not flash the sign in form while a stored session is being restored", async () => {
    // The session is in storage and the app knows it. Showing a login form for
    // a moment and then replacing it is how an app looks broken on every launch.
    const storage = memoryStorage();
    await storage.setItem("teddy-pe.session", JSON.stringify({ jwt: "a.b.c", user: { id: 1, email: "a@b.c", name: "Jeff", role: "coach" } }));
    const store = createCoreStore({ baseUrl: "https://api.test", storage });
    render(<Provider store={store}><App /></Provider>);

    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
