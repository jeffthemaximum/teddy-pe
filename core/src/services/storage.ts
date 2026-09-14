// The one place web and native genuinely differ. Web hands us localStorage,
// native hands us SecureStore or AsyncStorage, and core never knows which.
// Everything else in this package is shared, which is what keeps the promise
// that no duck gets redefined in Phase 4.
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// For tests, and for any caller that wants a store with no persistence.
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    async getItem(k) {
      return map.get(k) ?? null;
    },
    async setItem(k, v) {
      map.set(k, v);
    },
    async removeItem(k) {
      map.delete(k);
    },
  };
}
