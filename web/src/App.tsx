import { useEffect, type ReactNode } from "react";
import { authActions, authSelectors, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "./components/Loading";
import { SignIn } from "./screens/SignIn";

// The session lives in storage, and the app already knows that on mount:
// showing the sign in form for a moment and then replacing it with someone's
// real name is how an app looks broken on every launch. So the shell asks
// core to restore whatever is there before it renders anything that assumes
// an answer, and shows a quiet, honest "checking" state until core says
// which one it is.
export function App({ children }: { children?: ReactNode }) {
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

  return <>{children}</>;
}
