import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { Drill } from "@teddy-pe/core";
import { Glossary } from "../src/screens/Glossary";

// Three drills, each proving something different, none of them sharing a
// word with another on purpose:
//
// Star Jump's alias is "moonwalk". That word is nowhere in "Star Jump",
// nowhere in its slug "star-jump", and nowhere in any other drill's name,
// slug or alias below. This is the fixture this project got wrong once
// already: an earlier alias test used a drill named "Cartwheel" with the
// alias "wheel", and "cartwheel".includes("wheel") is true, so the test
// passed whether or not the alias branch of the search actually ran. Picking
// a word that cannot appear by coincidence is what makes the alias test
// below actually exercise the alias code rather than the name code.
//
// Wall Taps and Balance Beam Walk sit next to each other so the "filters as
// you type" test has a real distractor to fail against: "wall" is a real
// substring of "Wall Taps" but not of "Balance Beam Walk" ("Walk" is spelled
// with one L, not two), so a search for "wall" that returned both would be
// wrong, not just imprecise. Their aliases, "quick feet" and "tightrope",
// are equally disjoint from every other name, slug and alias here.
const STAR_JUMP: Drill = {
  slug: "star-jump",
  name: "Star Jump",
  area_name: "Explosiveness",
  aliases: ["moonwalk"],
  short: "Jump like a star and land like a cat.",
  how: ["Load low, arms back.", "Explode up, arms and legs wide.", "Land soft, knees soft."],
  watch: "Knees should track over his toes on the landing, not cave in.",
  cue: "Explode, then freeze.",
  video: null,
};

const WALL_TAPS: Drill = {
  slug: "wall-taps",
  name: "Wall Taps",
  area_name: "Touch",
  aliases: ["quick feet"],
  short: "Fast feet against the wall, low and light.",
  how: ["Stand close to the wall.", "Tap fast, both feet.", "Keep the hips still."],
  watch: "Heels should barely touch the floor between taps.",
  cue: "Light feet, quiet floor.",
  video: null,
};

const BALANCE_BEAM_WALK: Drill = {
  slug: "balance-beam-walk",
  name: "Balance Beam Walk",
  area_name: "Balance",
  aliases: ["tightrope"],
  short: "Walk a straight line without wobbling.",
  how: ["Arms out to the sides.", "Eyes on the far wall.", "One slow step at a time."],
  watch: "Watch for his hips swinging side to side to catch balance.",
  cue: "Eyes up, feet quiet.",
  video: null,
};

const DRILLS: Drill[] = [STAR_JUMP, WALL_TAPS, BALANCE_BEAM_WALK];

function renderGlossary() {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  return {
    store,
    ...render(
      <Provider store={store}>
        <Glossary />
      </Provider>,
    ),
  };
}

function drillList() {
  return screen.getByRole("list", { name: "Drills" });
}

function drillNames() {
  return Array.from(drillList().querySelectorAll(":scope > li")).map((li) => li.textContent?.trim());
}

function searchBox() {
  return screen.getByRole("searchbox", { name: /find a drill/i });
}

describe("the drill glossary", () => {
  it("asks for the drills once on mount", () => {
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const dispatched: { type: string; payload?: unknown }[] = [];
    const realDispatch = store.dispatch;
    store.dispatch = ((action: never) => {
      dispatched.push(action as { type: string; payload?: unknown });
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { rerender } = render(
      <Provider store={store}>
        <Glossary />
      </Provider>,
    );

    const drillFetches = () => dispatched.filter((a) => a.type === "drills/FETCH");
    expect(drillFetches()).toHaveLength(1);

    // A rerender with nothing changed must not ask again. The drills
    // endpoint is global, not scoped to a program year, so there is no id
    // here that could change and legitimately trigger a second ask.
    rerender(
      <Provider store={store}>
        <Glossary />
      </Provider>,
    );
    expect(drillFetches()).toHaveLength(1);
  });

  it("says the server may be waking rather than showing a blank list", () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/FETCH" });
    });

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("keeps the list on screen while refetching", () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });
    expect(screen.getByRole("button", { name: "Star Jump" })).toBeInTheDocument();

    act(() => {
      store.dispatch({ type: "drills/FETCH" });
    });

    expect(screen.getByRole("button", { name: "Star Jump" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/FAILED", payload: "The drill list could not be found." });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("The drill list could not be found.");
  });

  it("lists every drill before anything is typed", () => {
    // An empty query shows everything rather than nothing. Teddy opens this
    // screen to browse as often as to search.
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    expect(drillNames()).toEqual(["Star Jump", "Wall Taps", "Balance Beam Walk"]);
  });

  it("filters as you type", async () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    await userEvent.type(searchBox(), "wall");

    // "wall" is a real substring of Wall Taps's own name, but not of
    // Balance Beam Walk's ("Walk" has one L). A search that matched both
    // would be wrong, not merely loose, so this checks the exact set, not
    // just that Wall Taps is present.
    expect(drillNames()).toEqual(["Wall Taps"]);
  });

  it("finds a drill by an alias that is not part of its name", async () => {
    // THE FIXTURE MATTERS HERE: "moonwalk" appears nowhere in "Star Jump",
    // nowhere in "star-jump", and nowhere in any other drill's name, slug
    // or alias in this fixture. A search that only ever checked name and
    // slug, with the alias branch dead code, could not pass this.
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    await userEvent.type(searchBox(), "moonwalk");

    expect(drillNames()).toEqual(["Star Jump"]);
  });

  it("says so when nothing matches, rather than showing an empty page", async () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    await userEvent.type(searchBox(), "xyzzyquux");

    expect(screen.queryByRole("list", { name: "Drills" })).not.toBeInTheDocument();
    expect(screen.getByText(/no drill/i)).toBeInTheDocument();
  });

  it("opens a drill's panel with its cue, its steps and what to watch", async () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    await userEvent.click(screen.getByRole("button", { name: "Star Jump" }));

    expect(screen.getByText(STAR_JUMP.cue)).toBeInTheDocument();
    for (const step of STAR_JUMP.how) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText(new RegExp(STAR_JUMP.watch))).toBeInTheDocument();
  });

  it("shows a drill's area", async () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    await userEvent.click(screen.getByRole("button", { name: "Wall Taps" }));

    expect(screen.getByText("Touch")).toBeInTheDocument();
  });

  it("closes the panel and returns to the list", async () => {
    const { store } = renderGlossary();
    act(() => {
      store.dispatch({ type: "drills/SUCCEEDED", payload: { drills: DRILLS } });
    });

    await userEvent.click(screen.getByRole("button", { name: "Star Jump" }));
    expect(screen.getByText(STAR_JUMP.cue)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Drills" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("list", { name: "Drills" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Star Jump" })).toBeInTheDocument();
    expect(screen.queryByText(STAR_JUMP.cue)).not.toBeInTheDocument();
  });

  it("renders nothing rather than throwing before the drills have loaded", () => {
    // Every screen can render before its data arrives. The FETCH the
    // component dispatches on mount is intercepted before it can reach the
    // reducer, freezing state in the instant before loading or data or
    // error has anything to say, which is the exact gap the component's own
    // fallback (`return null`) exists for.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "drills/FETCH") return action;
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <Glossary />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
