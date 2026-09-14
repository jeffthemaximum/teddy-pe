import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { browserStorage } from "./storage";
import { createAppStore } from "./bootstrap";
import { App } from "./App";
import "./styles.css";

// The API host is the one thing this bundle carries about the deployment, and
// it is not a secret: it is the public address of a server that answers 401 to
// everything without a token.
const baseUrl = import.meta.env.VITE_API_URL;
if (!baseUrl) {
  throw new Error("VITE_API_URL is not set. The app has no API to talk to.");
}

// createAppStore (src/bootstrap.ts) builds the store and dispatches
// restoreSession() on it before this ever calls render(). See that module
// for why: a useEffect fires after first paint, which is the flash the app
// is not supposed to show.
const store = createAppStore({ baseUrl, storage: browserStorage() });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
