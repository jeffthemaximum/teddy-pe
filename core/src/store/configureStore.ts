import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { rootReducer } from "./rootReducer";
import { rootSaga } from "./rootSaga";
import { silentLogger } from "../services/logger";
import type { CoreConfig, CoreDeps } from "../config";

// Test-only: lets a test assert the resolved config rather than restating it.
// Kept out of src/index.ts, since the package's public surface is asserted
// in a later task and a test hook has no business in it.
const CONFIGS = new WeakMap<object, CoreConfig>();
export function storedConfig(store: object): CoreConfig {
  const c = CONFIGS.get(store);
  if (!c) throw new Error("not a core store");
  return c;
}

export function createCoreStore(deps: CoreDeps) {
  if (!deps.baseUrl) {
    throw new Error("core needs a baseUrl");
  }

  const config: CoreConfig = {
    baseUrl: deps.baseUrl.replace(/\/$/, ""),
    storage: deps.storage,
    logger: deps.logger ?? silentLogger,
    timeoutMs: deps.timeoutMs ?? 15000,
  };

  // Sagas reach config through context rather than an import, so a test can
  // stand up two stores against two fake servers without them colliding.
  const saga = createSagaMiddleware({ context: { config } });

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ thunk: false }).concat(saga),
  });

  saga.run(rootSaga);

  CONFIGS.set(store, config);
  return store;
}
