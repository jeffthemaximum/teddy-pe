import { createCoreStore, memoryStorage } from "../src";
import { storedConfig } from "../src/store/configureStore";

describe("the core store", () => {
  it("constructs without throwing for valid input", () => {
    // A narrow smoke test: construction succeeds and saga wiring runs. This
    // does not check that the injected config landed correctly, because
    // combineReducers({}) returns {} whether or not it did. See the test
    // below for that check.
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage: memoryStorage(),
    });

    expect(store.getState().auth.status).toBe("anonymous");
  });

  it("resolves the injected baseUrl and storage into config", () => {
    const storage = memoryStorage();
    const store = createCoreStore({
      baseUrl: "https://example.test",
      storage,
    });

    const config = storedConfig(store);
    expect(config.baseUrl).toBe("https://example.test");
    expect(config.storage).toBe(storage);
  });

  it("refuses to boot without a baseUrl, rather than defaulting to one", () => {
    // A silent default would send a child's journal to whatever host happened
    // to be compiled in. Fail loudly at boot instead.
    expect(() =>
      createCoreStore({ baseUrl: "", storage: memoryStorage() }),
    ).toThrow("core needs a baseUrl");
  });

  it("refuses to boot with a whitespace-only baseUrl, same as an empty one", () => {
    // "   " is falsy-adjacent but not falsy, so a bare `!deps.baseUrl` check
    // lets it through. It has to be trimmed before it is tested.
    expect(() =>
      createCoreStore({ baseUrl: "   ", storage: memoryStorage() }),
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
