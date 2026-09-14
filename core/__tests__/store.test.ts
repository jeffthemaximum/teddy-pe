import { createCoreStore, memoryStorage } from "../src";
import { storedConfig } from "../src/store/configureStore";

describe("the core store", () => {
  it("boots with the injected config and an empty state", () => {
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage: memoryStorage(),
    });

    expect(store.getState()).toEqual({});
  });

  it("refuses to boot without a baseUrl, rather than defaulting to one", () => {
    // A silent default would send a child's journal to whatever host happened
    // to be compiled in. Fail loudly at boot instead.
    expect(() =>
      createCoreStore({ baseUrl: "", storage: memoryStorage() }),
    ).toThrow("core needs a baseUrl");
  });

  it("defaults the timeout to 15 seconds, the floor the sleeping API needs", () => {
    // Read through the saga context rather than re-deriving it, so this fails
    // if someone changes the default in configureStore and not here.
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage: memoryStorage(),
    });
    expect(storedConfig(store).timeoutMs).toBe(15000);
  });
});
