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
    // Pinned behind UTC so a date test that only fails a UTC-midnight
    // parsing bug (`new Date("2026-09-17")` instead of building from the
    // date's own local parts) actually fails here. A CI box that happened
    // to sit in UTC would let that exact bug through silently, since
    // parsing as UTC and reporting in UTC land on the same day.
    env: { TZ: "America/Los_Angeles" },
  },
});
