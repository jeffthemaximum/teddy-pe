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
//
// authActions is deliberately narrowed to the three actions an app is
// allowed to dispatch. signInSucceeded, signInFailed and restoreFinished are
// dispatched only by the saga: an app that could dispatch signInSucceeded
// itself could put the store in a signed-in state holding a token the server
// never issued.
import { actions as authDuckActions, selectors as authSelectors } from "./ducks/auth";

export const authActions = {
  signIn: authDuckActions.signIn,
  signOut: authDuckActions.signOut,
  restoreSession: authDuckActions.restoreSession,
};
export { authSelectors };
export type { AuthState } from "./ducks/auth";
export type { User, Role, LoginResponse } from "./types";
