import { call, getContext, put, select, takeLatest } from "redux-saga/effects";
import { apiRequest, ApiError, isUnauthorized } from "../services/apiClient";
import { sessionExpired } from "../ducks/auth/actions";
import { selectToken } from "../ducks/auth/selectors";
import type { CoreConfig } from "../config";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function createFetchDuck<T, A = void>(opts: {
  name: string;
  path: (arg: A) => string;
}) {
  const FETCH = `${opts.name}/FETCH`;
  const SUCCEEDED = `${opts.name}/SUCCEEDED`;
  const FAILED = `${opts.name}/FAILED`;

  const actions = {
    fetch: (arg: A) => ({ type: FETCH, payload: arg }) as const,
    succeeded: (data: T) => ({ type: SUCCEEDED, payload: data }) as const,
    failed: (message: string) => ({ type: FAILED, payload: message }) as const,
  };

  const initialState: FetchState<T> = { data: null, loading: false, error: null };

  function reducer(
    state: FetchState<T> = initialState,
    action: { type: string; payload?: unknown },
  ): FetchState<T> {
    switch (action.type) {
      case FETCH:
        // Keep whatever is on screen. A blank panel on every refresh is how a
        // scale-to-zero server ends up feeling broken.
        return { ...state, loading: true, error: null };
      case SUCCEEDED:
        return { data: action.payload as T, loading: false, error: null };
      case FAILED:
        return { ...state, loading: false, error: action.payload as string };
      default:
        return state;
    }
  }

  function* worker(action: ReturnType<typeof actions.fetch>) {
    const config: CoreConfig = yield getContext("config");
    const token: string | null = yield select(selectToken);
    // Nothing about Teddy is fetchable unauthenticated. An anonymous fetch is
    // a bug in the caller, not a network request that should go out and fail.
    if (!token) return;

    try {
      const data: T = yield call(apiRequest, config, {
        path: opts.path(action.payload),
        token,
      });
      yield put(actions.succeeded(data));
    } catch (e) {
      // A 401 means the token is dead, and that is the only thing that signs
      // someone out here. A timeout from a sleeping Fly machine is normal in
      // this app (6.6 to 7.6 seconds cold) and must not be treated the same
      // way, or a slow connection would look identical to a dead session.
      if (isUnauthorized(e)) {
        yield put(sessionExpired());
        return;
      }
      yield put(actions.failed(e instanceof ApiError ? e.message : "Something went wrong."));
    }
  }

  function* saga() {
    yield takeLatest(FETCH, worker);
  }

  const selectors = {
    selectData: (s: Record<string, unknown>) => (s[opts.name] as FetchState<T>).data,
    selectIsLoading: (s: Record<string, unknown>) => (s[opts.name] as FetchState<T>).loading,
    selectError: (s: Record<string, unknown>) => (s[opts.name] as FetchState<T>).error,
  };

  // `path` is returned here so a duck has exactly one copy of its URL. An
  // earlier draft of this plan had each duck restate it, which is a second
  // place to drift and the defect Phase 1 found three times.
  return {
    actions,
    reducer,
    saga,
    worker,
    selectors,
    path: opts.path,
    types: { FETCH, SUCCEEDED, FAILED },
  };
}
