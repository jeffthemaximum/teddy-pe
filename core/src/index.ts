export { createCoreStore } from "./store/configureStore";
export { memoryStorage } from "./services/storage";
export type { Storage } from "./services/storage";
export type { Logger } from "./services/logger";
export type { CoreDeps } from "./config";
export type { RootState } from "./store/rootReducer";

// The auth duck's public surface. Each app dispatches `authActions.signIn`
// etc. and reads state through `authSelectors`; the reducer and saga are
// already wired into the store by rootReducer/rootSaga and have no reason to
// be imported directly.
export { actions as authActions, selectors as authSelectors } from "./ducks/auth";
export type { AuthState } from "./ducks/auth";
export type { User, Role, LoginResponse } from "./types";
