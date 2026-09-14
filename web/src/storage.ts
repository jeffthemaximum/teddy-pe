import type { Storage } from "@teddy-pe/core";

// The one place this app differs from the native app. core/ takes storage as
// an interface precisely so Phase 4 can hand it expo-secure-store instead,
// with no duck rewritten.
export function browserStorage(): Storage {
  return {
    async getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // A private window, or a full disk. Losing the cached session means
        // signing in again, which is a nuisance. Crashing means the app does
        // not open at all.
      }
    },
    async removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Same reasoning.
      }
    },
  };
}
