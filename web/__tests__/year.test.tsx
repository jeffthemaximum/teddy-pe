import { act, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { ProgramYearDetail } from "@teddy-pe/core";
import { Year } from "../src/screens/Year";

// Built from the real shape (core/src/types.ts's ProgramYearDetail, verified
// against backend/spec/requests/program_years_spec.rb) and deliberately out
// of order: `position` is 1 to 6 for blocks, 1 to 9 for areas, 1 to 7 for
// day roles, but the arrays themselves are shuffled. A fixture already in
// order passes against a component that never sorts, which is the defect
// this project has found eight times.
const BLOCKS: ProgramYearDetail["blocks"] = [
  {
    key: "wolf",
    name: "Wolf",
    position: 4,
    starts_on: "2027-01-04",
    ends_on: "2027-02-14",
    focus: "Wall control, first touch under pressure",
    current: false,
  },
  {
    key: "cub",
    name: "Cub",
    position: 1,
    starts_on: "2026-09-14",
    ends_on: "2026-10-25",
    focus: "Groove the basics. Minutes over intensity.",
    current: false,
  },
  {
    key: "cheetah",
    name: "Cheetah",
    position: 6,
    starts_on: "2027-05-24",
    ends_on: "2027-07-04",
    focus: "Compete, hold the gains, taper the volume.",
    current: false,
  },
  {
    key: "coyote",
    name: "Coyote",
    position: 3,
    starts_on: "2026-12-07",
    ends_on: "2027-01-17",
    focus: "Speed off the wall. Quick first step.",
    current: true,
  },
  {
    key: "puma",
    name: "Puma",
    position: 5,
    starts_on: "2027-02-15",
    ends_on: "2027-03-28",
    focus: "Live points, game-speed decisions.",
    current: false,
  },
  {
    key: "fox",
    name: "Fox",
    position: 2,
    starts_on: "2026-10-26",
    ends_on: "2026-12-06",
    focus: "Build touches. Protect the wrist and shoulder.",
    current: false,
  },
];

// The area that carries the backwards-cells trap: cells listed in reverse
// block order so "matched by block_key" fails against a component that
// assumes cells already line up with blocks.
const TENNIS_CELLS = [
  { block_key: "cheetah", body: "Live-ball points at full speed." },
  { block_key: "puma", body: "Serve and forehand under game pressure." },
  { block_key: "wolf", body: "Wall rally 40 shots, first touch clean." },
  { block_key: "coyote", body: "Wall rally 30. Footwork into the ball." },
  { block_key: "fox", body: "Wall rally 20. Grip and prep." },
  { block_key: "cub", body: "Wall rally 10. Land like a cat between shots." },
];

function cellsInOrder(prefix: string): ProgramYearDetail["areas"][number]["cells"] {
  return ["cub", "fox", "coyote", "wolf", "puma", "cheetah"].map((block_key) => ({
    block_key,
    body: `${prefix} for ${block_key}`,
  }));
}

const AREAS: ProgramYearDetail["areas"] = [
  { slug: "throw", position: 5, name: "Throw", summary: "Arm care and mechanics.", cells: cellsInOrder("Throw work") },
  { slug: "speed", position: 1, name: "Speed", summary: "Acceleration and top end.", cells: cellsInOrder("Speed work") },
  { slug: "mindset", position: 9, name: "Mindset", summary: "Focus and composure.", cells: cellsInOrder("Mindset work") },
  { slug: "basketball", position: 7, name: "Basketball", summary: "Handling and shooting.", cells: cellsInOrder("Ball work") },
  { slug: "coordination", position: 3, name: "Coordination", summary: "Balance and body control.", cells: cellsInOrder("Coordination work") },
  { slug: "tennis", position: 6, name: "Tennis", summary: "Rally and racquet skill.", cells: TENNIS_CELLS },
  { slug: "power", position: 2, name: "Power", summary: "Jumps and throws.", cells: cellsInOrder("Power work") },
  { slug: "soccer", position: 8, name: "Soccer", summary: "Touch and first control.", cells: cellsInOrder("Touch work") },
  { slug: "strength", position: 4, name: "Strength", summary: "Bodyweight control.", cells: cellsInOrder("Strength work") },
];

const DAY_ROLES: ProgramYearDetail["day_roles"] = [
  { dow: "sat", position: 6, name: "Game Day", organized: [], minutes: "0", intensity: 0, note: "Home off. Let the game be the session." },
  { dow: "tue", position: 2, name: "Rings Day", organized: ["soccer touch"], minutes: "75 to 90", intensity: 2, note: "Soccer touch on the rings. Quiet feet." },
  { dow: "sun", position: 7, name: "Court Day", organized: ["ball skills"], minutes: "30 to 45", intensity: 1, note: "Quick card, then 15 minutes of ball skills." },
  { dow: "mon", position: 1, name: "Floor Day", organized: ["basketball handling"], minutes: "60 to 90", intensity: 2, note: "Basketball handling on the floor. Soft hands." },
  { dow: "thu", position: 4, name: "Wall Day", organized: ["tennis", "basketball skill"], minutes: "60 to 90", intensity: 3, note: "Tennis-heaviest day. Watch the shoulder." },
  { dow: "fri", position: 5, name: "Skate Day", organized: ["keeper work"], minutes: "45 to 60", intensity: 1, note: "Low impact keeper work. At most 5 high-intent." },
  { dow: "wed", position: 3, name: "Fast Day", organized: ["soccer at speed"], minutes: "60 to 90", intensity: 4, note: "The only high-impact home day. Land like a cat." },
];

const YEAR: ProgramYearDetail = {
  id: 42,
  label: "2026-27",
  starts_on: "2026-09-14",
  ends_on: "2027-08-15",
  status: "active",
  ball_now: "green",
  rank_rule: "Earn 7 of 9 to become a Fox",
  north_star: "Move like a natural athlete, on his own terms, having fun the whole way.",
  blocks: BLOCKS,
  areas: AREAS,
  patches: [
    { id: 1, block_key: "coyote", area_slug: "speed", name: "Quick Feet", requirement: "10-yard sprint under 2.6s" },
    { id: 2, block_key: "coyote", area_slug: "power", name: "Broad Jump", requirement: "Jump past his own height" },
    { id: 3, block_key: "coyote", area_slug: "coordination", name: "Balance Beam", requirement: "Cross the beam without a step off" },
    { id: 4, block_key: "coyote", area_slug: "strength", name: "Plank Hold", requirement: "Hold a plank for 60 seconds" },
    { id: 5, block_key: "coyote", area_slug: "throw", name: "Long Toss", requirement: "Accurate throw to 15 yards" },
    { id: 6, block_key: "coyote", area_slug: "tennis", name: "Wall Rally", requirement: "30 clean shots in a row" },
    { id: 7, block_key: "coyote", area_slug: "basketball", name: "Two Hand Handle", requirement: "Dribble both hands without looking" },
    { id: 8, block_key: "coyote", area_slug: "soccer", name: "First Touch", requirement: "Kill a rolled ball dead, both feet" },
    { id: 9, block_key: "coyote", area_slug: "mindset", name: "Reset Breath", requirement: "Names his own reset cue unprompted" },
  ],
  ball_gates: [
    { position: 1, from_ball: "orange", to_ball: "green", label: "Orange to Green", requirement: "Cross-court rallies of 10+ on green", status: "done" },
    { position: 2, from_ball: "green", to_ball: "yellow mini", label: "Green to Yellow (mini)", requirement: "Serve and rally the full box, 15+ in play", status: "active" },
    { position: 3, from_ball: "yellow mini", to_ball: "yellow", label: "Yellow (mini) to Full Yellow", requirement: "Full court points with topspin control", status: "locked" },
  ],
  battery: { tests: [], measures: [], results: [], progress: [] },
  test_dates: [
    { id: 5, window: "2027-07", label: "Final", display: "Late July", position: 5 },
    { id: 1, window: "2026-09", label: "Baseline", display: "Mid September", position: 1 },
    { id: 3, window: "2027-01", label: "Retest 2", display: "Mid January", position: 3 },
    { id: 2, window: "2026-11", label: "Retest 1", display: "Mid November", position: 2 },
    { id: 4, window: "2027-04", label: "Retest 3", display: "Mid April", position: 4 },
  ],
  day_roles: DAY_ROLES,
  current_block_key: "coyote",
  current_week_id: 900,
  patch_awards: [],
  rank_awards: [],
};

// Seeds the auth slice the way a real restore does, in one action, so a
// test does not have to run the sign-in or restore saga just to get a
// program year id in front of Year. `auth/RESTORE_FINISHED` is the same
// action core's own restoreSessionSaga dispatches once /api/v1/me answers
// (or, with current_program_year_id null, once it could not).
function seedAuth(store: ReturnType<typeof createCoreStore>, currentProgramYearId: number | null) {
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "frey.maxim@gmail.com", name: "Jeff", role: "coach" },
      athlete: null,
      current_program_year_id: currentProgramYearId,
    },
  });
}

function renderYear(currentProgramYearId: number | null = 42) {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  seedAuth(store, currentProgramYearId);
  const dispatched: { type: string; payload?: unknown }[] = [];
  const realDispatch = store.dispatch;
  store.dispatch = ((action: never) => {
    dispatched.push(action as { type: string; payload?: unknown });
    return realDispatch(action);
  }) as typeof store.dispatch;
  const utils = render(
    <Provider store={store}>
      <Year />
    </Provider>,
  );
  return { store, dispatched, ...utils };
}

describe("the Year view", () => {
  it("asks for the current year once on mount", () => {
    // Not twice. A screen that refetches on every render hammers a server
    // that takes seven seconds to wake.
    const { store, dispatched, rerender } = renderYear(42);

    const yearFetches = () => dispatched.filter((a) => a.type === "programYear/FETCH");
    expect(yearFetches()).toHaveLength(1);
    expect(yearFetches()[0].payload).toBe(42);

    // A rerender with nothing about the current year changed must not ask
    // again.
    rerender(
      <Provider store={store}>
        <Year />
      </Provider>,
    );
    expect(yearFetches()).toHaveLength(1);
  });

  it("shows a waiting message rather than a blank panel while the current year id is not known yet", () => {
    // selectCurrentProgramYearId is null both while /api/v1/me is still in
    // flight right after sign-in, and, more lastingly, when a restore
    // succeeded on a cached session because /me could not answer for a
    // reason that says nothing about the token (a cold server, no
    // connection). core deliberately lets that restore succeed rather than
    // sign someone out over a slow tunnel, so a signed-in person can sit
    // here with no id yet, and this screen must say something rather than
    // leave the content area empty.
    renderYear(null);

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("says the server may be waking rather than showing a blank panel", () => {
    // selectIsLoading true, no data yet.
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/FETCH", payload: 42 }); });

    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("keeps what is on screen while refetching", () => {
    // data present AND loading true. Blanking on every refresh is what makes
    // a scale-to-zero server feel broken.
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });
    expect(screen.getByRole("heading", { name: "2026-27" })).toBeInTheDocument();

    act(() => { store.dispatch({ type: "programYear/FETCH", payload: 42 }); });

    expect(screen.getByRole("heading", { name: "2026-27" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/waking/i);
  });

  it("shows the error the API gave, not one of ours", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/FAILED", payload: "That program year could not be found." }); });

    expect(screen.getByRole("alert")).toHaveTextContent("That program year could not be found.");
  });

  it("renders all nine areas in position order, not the order they arrived", () => {
    // The fixture is shuffled. This fails if the component does not sort.
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const rowHeaders = screen.getAllByRole("rowheader").map((el) => el.textContent);
    expect(rowHeaders).toEqual([
      "Speed",
      "Power",
      "Coordination",
      "Strength",
      "Throw",
      "Tennis",
      "Basketball",
      "Soccer",
      "Mindset",
    ]);
  });

  it("renders all six blocks in position order", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /the six blocks/i });
    const items = within(region).getAllByRole("listitem");
    const blockNames = items.map((el) => el.querySelector("strong")?.textContent);
    expect(blockNames).toEqual(["Cub", "Fox", "Coyote", "Wolf", "Puma", "Cheetah"]);
  });

  it("marks the current block, and only that one", () => {
    // Assert the others are NOT marked. Asserting only that one is marked
    // passes against a component that marks all six.
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /the six blocks/i });
    const items = within(region).getAllByRole("listitem");

    const marked = items.filter((el) => /current block/i.test(el.textContent ?? ""));
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toMatch(/coyote/i);
  });

  it("shows when each block runs, not just its name and focus", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /the six blocks/i });
    const items = within(region).getAllByRole("listitem");
    const cub = items.find((el) => el.textContent?.includes("Cub"));
    expect(cub?.textContent).toMatch(/2026-09-14 to 2026-10-25/);
  });

  it("shows what each area covers, not just its name", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    expect(screen.getByText("Rally and racquet skill.")).toBeInTheDocument();
    expect(screen.getByText("Acceleration and top end.")).toBeInTheDocument();
  });

  it("shows each area's cell for each block, matched by block_key", () => {
    // The cells are not in block order either. Give one area cells listed
    // backwards and assert the cell text lands under the right block.
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const columnHeaders = screen.getAllByRole("columnheader").map((el) => el.textContent);
    const wolfColumn = columnHeaders.indexOf("Wolf");
    expect(wolfColumn).toBeGreaterThan(0);

    const tennisRow = screen.getByRole("rowheader", { name: "Tennis" }).closest("tr");
    expect(tennisRow).not.toBeNull();
    const cells = within(tennisRow as HTMLTableRowElement).getAllByRole("cell");
    // columnHeaders[0] is the leading "Area" header, which has no matching
    // cell, so the cell index is one less than the column header index.
    expect(cells[wolfColumn - 1].textContent).toBe("Wall rally 40 shots, first touch clean.");
  });

  it("shows the active ball gate differently from the others", () => {
    // Green is the default rally ball this year and the gates are skill
    // gated, never date gated. Assert on status, and assert the inactive
    // ones are not marked active.
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /tennis ball gates/i });
    const items = within(region).getAllByRole("listitem");

    const active = items.filter((el) => /working on this now/i.test(el.textContent ?? ""));
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toMatch(/green to yellow/i);
    expect(active[0].textContent).toMatch(/\bactive\b/i);

    const others = items.filter((el) => !/working on this now/i.test(el.textContent ?? ""));
    expect(others).toHaveLength(2);
    expect(others.some((el) => /\bdone\b/i.test(el.textContent ?? ""))).toBe(true);
    expect(others.some((el) => /\blocked\b/i.test(el.textContent ?? ""))).toBe(true);
  });

  it("names each ball gate's ball change, not just its label", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /tennis ball gates/i });
    const items = within(region).getAllByRole("listitem");
    const active = items.find((el) => /working on this now/i.test(el.textContent ?? ""));
    expect(active?.textContent).toMatch(/green to yellow mini/i);
  });

  it("shows the north star", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    expect(
      screen.getByText("Move like a natural athlete, on his own terms, having fun the whole way."),
    ).toBeInTheDocument();
  });

  it("renders the seven day roles in weekday order", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /seven day roles/i });
    const names = within(region)
      .getAllByRole("listitem")
      .map((el) => el.querySelector("strong")?.textContent);

    expect(names).toEqual([
      "Floor Day",
      "Rings Day",
      "Fast Day",
      "Wall Day",
      "Skate Day",
      "Game Day",
      "Court Day",
    ]);
  });

  it("shows each day role's minutes, intensity and what it organizes, not just its name", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    const region = screen.getByRole("region", { name: /seven day roles/i });
    const items = within(region).getAllByRole("listitem");
    const wall = items.find((el) => el.textContent?.includes("Wall Day"));
    expect(wall?.textContent).toMatch(/60 to 90 minutes/);
    expect(wall?.textContent).toMatch(/intensity 3/);
    expect(wall?.textContent).toMatch(/tennis, basketball skill/);
  });

  it("shows each test date's window alongside its label", () => {
    const { store } = renderYear();
    act(() => { store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR }); });

    expect(screen.getByText("Baseline: Mid September (2026-09)")).toBeInTheDocument();
  });

  it("renders nothing about a year that has not loaded rather than throwing", () => {
    // Every screen can render before its data arrives. A component that
    // throws on null data turns a slow server into a crash. The id is
    // known here (so the effect fires and skips the "waiting for an id"
    // branch), but the FETCH action it dispatches is intercepted before it
    // can reach the reducer, freezing the component in the instant between
    // "the id arrived" and "the resulting fetch updated loading" - the
    // exact gap the component's own fallback (`return null`) is for.
    const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
    seedAuth(store, 42);
    const realDispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => {
      if (action.type === "programYear/FETCH") return action;
      return realDispatch(action);
    }) as typeof store.dispatch;

    const { container } = render(
      <Provider store={store}>
        <Year />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
