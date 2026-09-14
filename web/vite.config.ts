import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // core/ carries its own copies of react and react-redux (installed for its
  // own Jest suite), separate from this app's. Without dedupe the two land
  // as two live React instances: core's useAppDispatch/useAppSelector call
  // hooks against a React that never rendered this tree's Provider, and
  // every hook throws. This app has exactly one copy of each in its own
  // node_modules; dedupe tells Vite to resolve every nested copy to that one
  // rather than to whichever package required it.
  resolve: {
    dedupe: ["react", "react-dom", "react-redux"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
