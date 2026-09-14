import { useState, type FormEvent } from "react";
import { authActions, authSelectors, useAppDispatch, useAppSelector } from "@teddy-pe/core";
import { Loading } from "../components/Loading";
import { ErrorNote } from "../components/ErrorNote";

// The server sleeps when nobody has used it in a while. Waking a cold Fly
// machine and a suspended Neon branch together measured 6.6 to 7.6 seconds
// in production: normal for the first sign in of a day, not an error. Seven
// seconds of a dead-looking form reads as broken. Seven seconds of this
// reads as slow, which is the truth.
const WAKING_LABEL = "Waking up the server. This can take about ten seconds if it has been quiet a while.";

export function SignIn() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(authSelectors.selectAuthStatus);
  const error = useAppSelector(authSelectors.selectAuthError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signingIn = status === "signingIn";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    dispatch(authActions.signIn({ email, password }));
  }

  return (
    <main className="app-shell">
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <ErrorNote message={error} />}
        {signingIn && <Loading label={WAKING_LABEL} />}
        <button type="submit" disabled={signingIn}>
          {signingIn ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
