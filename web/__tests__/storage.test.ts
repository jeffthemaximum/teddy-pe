import { browserStorage } from "../src/storage";

describe("browserStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a value", async () => {
    const s = browserStorage();
    await s.setItem("k", "v");
    expect(await s.getItem("k")).toBe("v");
    await s.removeItem("k");
    expect(await s.getItem("k")).toBeNull();
  });

  it("returns null rather than throwing when storage is unavailable", async () => {
    // Safari in private mode throws on setItem. An app that crashes on boot
    // because it could not cache a token is worse than one that signs in again.
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    const s = browserStorage();
    await expect(s.setItem("k", "v")).resolves.toBeUndefined();
    window.localStorage.setItem = original;
  });

  it("returns null for a key that was never set", async () => {
    expect(await browserStorage().getItem("nope")).toBeNull();
  });
});
