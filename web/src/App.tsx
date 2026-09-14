import { useEffect } from "react";
import { BrowserRouter, NavLink } from "react-router-dom";
import { authActions, authSelectors, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "./components/Loading";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SignIn } from "./screens/SignIn";
import { AppRoutes, navItemsFor } from "./routes";

// The session lives in storage, and the app already knows that on mount:
// showing the sign in form for a moment and then replacing it with someone's
// real name is how an app looks broken on every launch. So the shell asks
// core to restore whatever is there before it renders anything that assumes
// an answer, and shows a quiet, honest "checking" state until core says
// which one it is.
export function App() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(authSelectors.selectAuthStatus);

  useEffect(() => {
    dispatch(authActions.restoreSession());
  }, [dispatch]);

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
