import { BrowserRouter, NavLink } from "react-router-dom";
import { authActions, authSelectors, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "./components/Loading";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SignIn } from "./screens/SignIn";
import { AppRoutes, navItemsFor } from "./routes";

// The session lives in storage, and by the time this ever renders, restoring
// it is already in flight: main.tsx dispatches restoreSession() on the store
// before createRoot(...).render() is even called, not from a useEffect here.
// A useEffect fires after first paint, so a dispatch from one would still let
// a perfectly good stored session commit the sign-in form for one frame
// before replacing it, which is exactly the flash this app is not supposed
// to show. Dispatching before the first render means the reducer is already
// past "anonymous" by the time this component's first render happens, so
// there is nothing to flash. This component only reads the status main.tsx
// already set in motion.
export function App() {
  const status = useAppSelector(authSelectors.selectAuthStatus);

  if (status === "restoring") {
    return (
      <main className="app-shell">
        <Loading label="Checking who's signed in." />
      </main>
    );
  }

  if (status !== "signedIn") {
    return <SignIn />;
  }

  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

// Everything a signed-in person sees around every screen: who the app
// thinks they are, a way to leave, and only the tabs the API will actually
// answer for their role. The role comes straight off the restored session
// (authSelectors.selectRole), never off a prop, so a reload lands on the
// same tabs rather than a blank slate waiting to be told who is signed in.
function Shell() {
  const dispatch = useAppDispatch();
  const role = useAppSelector(authSelectors.selectRole);
  const user = useAppSelector(authSelectors.selectUser);
  const items = navItemsFor(role);

  return (
    <div className="app-shell app-shell--signed-in">
      <header className="app-header">
        <span className="app-header__name">{user?.name}</span>
        <button type="button" onClick={() => dispatch(authActions.signOut())}>
          Sign out
        </button>
      </header>
      <nav aria-label="Main">
        <ul className="app-nav">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <ErrorBoundary>
        <main className="app-content">
          <AppRoutes role={role} />
        </main>
      </ErrorBoundary>
    </div>
  );
}
