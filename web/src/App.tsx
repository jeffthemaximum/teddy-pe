// The shell. This task only proves the app boots and the store is wired up;
// the auth gate, nav and error boundary land in the next task, once
// SignIn, Loading and ErrorNote exist to build them from.
export function App() {
  return (
    <main className="app-shell">
      <h1>Sign in</h1>
      <p>Getting the app ready.</p>
    </main>
  );
}
