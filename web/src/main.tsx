import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createCoreStore, authActions } from "@teddy-pe/core";
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

// Dispatched here, on the store, before the first render, not from a
// useEffect in App. A useEffect fires after first paint: on a real launch
// with a perfectly good stored session, that would commit the sign-in form
// for one frame and then replace it once the effect ran, which is exactly
// the flash the app is not supposed to show. Dispatching now moves the
// reducer to "restoring" synchronously, so React's very first render
// already sees it and there is nothing to flash.
store.dispatch(authActions.restoreSession());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
