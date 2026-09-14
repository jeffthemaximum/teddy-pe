// Typed wrappers around react-redux's own useSelector/useDispatch, so both
// apps get RootState and this store's dispatch type at every call site
// instead of writing `useSelector((s: RootState) => ...)` by hand.
//
// react-redux is a real dependency of this package: the hooks it exports
// are the only thing core needs from it. React itself is a peer dependency,
// declared in package.json but never installed here as a dependency, so the
// web app and the native app each bring their own copy of React. Two copies
// of React in one tree break hooks in ways that are miserable to debug, and
// this package must never be the reason that happens.
import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";
import type { createCoreStore } from "./configureStore";
import type { RootState } from "./rootReducer";

// Derived from createCoreStore's own return type rather than written out by
// hand, so a change to the store's middleware (thunk, another saga) changes
// this type too, instead of silently drifting from what dispatch can
// actually accept.
export type AppDispatch = ReturnType<typeof createCoreStore>["dispatch"];

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
