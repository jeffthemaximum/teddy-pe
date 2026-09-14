import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { createCoreStore, memoryStorage } from "@teddy-pe/core";
import type { ProgramYearDetail, Token } from "@teddy-pe/core";
import { Year } from "../src/screens/Year";
import { DayCard } from "../src/components/DayCard";
import { Tokens } from "../src/components/Tokens";

// What a stylesheet looks like cannot be asserted, and this file does not
// pretend otherwise. Three things about it can be:
//
//   1. the size of a thing a seven-year-old has to hit with a finger,
//   2. whether a state that matters is said by anything other than a colour,
//   3. whether something too wide for a phone is allowed to push the page
//      sideways or made to scroll inside its own box.
//
// The first and third are rules in src/styles.css, so they are read out of
// the file rather than measured: jsdom has no layout engine, every width and
// height it reports is zero, and a test that measured them here would pass
// whatever the stylesheet said. The second is in the markup, where it can be
// asserted properly. What is left over, which is most of what "looks good"
// means, is checked by eye against a rendered screen and is not in here.

const CSS = readFileSync(join(__dirname, "..", "src", "styles.css"), "utf8");

interface Rule {
  selectors: string[];
  body: string;
}

// Enough of a CSS parser for the questions above: comments out, then every
// `selectors { declarations }` pair, including the ones nested inside a
// media query (the media wrapper itself never matches, because its body
// still holds braces).
function rules(): Rule[] {
  const source = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    out.push({
      selectors: match[1].split(",").map((s) => s.trim()).filter(Boolean),
      body: match[2],
    });
  }
  return out;
}

const RULES = rules();

// The last declaration of `property` in any rule whose selector list carries
// `selector` exactly. Last, not first, because that is the one that wins
// between two rules of equal weight.
function declared(selector: string, property: string): string | null {
  let found: string | null = null;
  for (const rule of RULES) {
    if (!rule.selectors.includes(selector)) continue;
    const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rule.body)) !== null) {
      found = match[1].trim();
    }
  }
  return found;
}

// Resolves the one custom property this file cares about, so a test can say
// "at least 44 pixels" rather than "spelled var(--tap)".
function pixels(value: string | null): number | null {
  if (value === null) return null;
  const direct = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (direct) return Number(direct[1]);
  if (value === "var(--tap)") return pixels(declared(":root", "--tap"));
  return null;
}

describe("the stylesheet parser this file leans on", () => {
  // Every assertion below is only as good as this. A parser that found
  // nothing would wave through a stylesheet with every rule deleted.
  it("finds a rule and reads a declaration out of it", () => {
    expect(RULES.length).toBeGreaterThan(50);
    expect(declared(":root", "--tap")).toBe("44px");
    expect(declared("nothing-is-styled-like-this", "min-height")).toBeNull();
  });
});

describe("a finger-sized target", () => {
  // 44 CSS pixels is the size a seven-year-old's finger actually lands on.
  const FLOOR = 44;

  it.each([
    ["button", "min-height"],
    ["button", "min-width"],
    [".app-nav a", "min-height"],
    [".app-nav a", "min-width"],
    // A drill token is a word inside a sentence, which is exactly why it
    // needs saying: a word is naturally far smaller than a thumb.
    [".token--drill", "min-height"],
    [".token--drill", "min-width"],
  ])("%s is at least 44 pixels tall and wide (%s)", (selector, property) => {
    const size = pixels(declared(selector, property));
    expect(size).not.toBeNull();
    expect(size as number).toBeGreaterThanOrEqual(FLOOR);
  });

  it("gives the screens he reads a bigger target than the floor", () => {
    // His screens are not a phone-sized compromise, they are the point.
    const size = pixels(declared(".this-week button", "min-height"));
    expect(size).not.toBeNull();
    expect(size as number).toBeGreaterThan(FLOOR);
  });
});

describe("a drill token in the middle of a sentence", () => {
  it("is laid out inline rather than as a full-width button", () => {
    // The defect this replaced: a drill token rendered as a full-width
    // primary button in the middle of a line of instructions.
    expect(declared(".token--drill", "display")).toBe("inline-block");
    expect(declared(".token--drill", "width")).not.toBe("100%");
  });

  it("keeps its inline shape on the screen whose buttons are biggest", () => {
    // .this-week button sets a button shape for that screen. A token caught
    // by that rule would go back to looking like a button.
    expect(declared(".this-week .token--drill", "font-size")).toBe("inherit");
    expect(declared(".this-week .token--drill", "border-radius")).not.toBeNull();
  });
});

describe("nothing is said by colour alone", () => {
  it("tells the token styles apart by more than their colour", () => {
    // Two token styles that differ only in hue are two token styles a child
    // cannot tell apart, and neither can anyone reading in daylight.
    expect(declared(".token--bold", "font-weight")).not.toBeNull();
    expect(declared(".token--quote", "font-style")).toBe("italic");
  });

  it("marks the tab you are on with weight and a rule, not only a fill", () => {
    expect(declared(".app-nav a.active", "font-weight")).toBe("700");
    expect(declared(".app-nav a.active", "box-shadow")).not.toBeNull();
  });

  it("marks trouble with a heavy edge and bold words, not only red", () => {
    expect(declared(".error", "border-left")).toMatch(/^\d/);
    expect(declared(".error", "font-weight")).not.toBeNull();
  });

  it("marks today with the word Today as well as an edge", () => {
    const day = {
      id: 1,
      dow: "mon",
      date: "2026-09-14",
      name: "A day",
      role: "A role",
      minutes: "60",
      intensity: 2,
      hie: 0,
      summary_lines: ["One line"],
      drill_slugs: [],
    };
    const { container, rerender } = render(
      <DayCard day={day as never} isToday onSelectDrill={() => {}} />,
    );
    const today = container.querySelector("article")!;
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(today).toHaveAttribute("aria-current", "date");

    rerender(<DayCard day={day as never} isToday={false} onSelectDrill={() => {}} />);
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("draws the edge that marks today with shape, not just a shade", () => {
    // A 10px bar down one side is a shape. Two greens are not.
    expect(declared(".day-card--today", "border-left-width")).toMatch(/^\d/);
  });
});

// A minimal year, built to the ProgramYearDetail shape, carrying only what
// the three assertions below actually read. Deliberately plain words: this
// file is not the place to restate the program's own vocabulary.
const YEAR = {
  id: 7,
  label: "A year",
  starts_on: "2026-09-14",
  ends_on: "2027-08-15",
  status: "active",
  ball_now: "the one he uses now",
  rank_rule: "Earn seven of nine to move up",
  north_star: "Move well, on his own terms.",
  blocks: [
    {
      key: "one",
      name: "Section one",
      position: 1,
      starts_on: "2026-09-14",
      ends_on: "2026-10-25",
      focus: "Groove the basics.",
      current: true,
    },
    {
      key: "two",
      name: "Section two",
      position: 2,
      starts_on: "2026-10-26",
      ends_on: "2026-12-06",
      focus: "Add volume.",
      current: false,
    },
  ],
  areas: [
    {
      slug: "one",
      position: 1,
      name: "Area one",
      summary: "What this area is.",
      cells: [
        { block_key: "one", body: "Stage one." },
        { block_key: "two", body: "Stage two." },
      ],
    },
  ],
  day_roles: [
    {
      dow: "mon",
      position: 1,
      name: "A day",
      organized: [],
      minutes: "60",
      intensity: 2,
      note: "What this day is for.",
    },
  ],
  test_dates: [{ id: 1, position: 1, label: "First", display: "Sep 1", window: "one" }],
  ball_gates: [
    {
      position: 1,
      label: "Step one",
      from_ball: "this one",
      to_ball: "the next",
      status: "active",
      requirement: "Rally thirty in a row.",
    },
    {
      position: 2,
      label: "Step two",
      from_ball: "the next",
      to_ball: "the one after",
      status: "locked",
      requirement: "Rally forty in a row.",
    },
  ],
  patches: [
    { id: 1, area_slug: "one", name: "A patch", requirement: "Do it twice, on two days." },
  ],
  battery: { measures: [] },
} as unknown as ProgramYearDetail;

function renderYear() {
  const store = createCoreStore({ baseUrl: "https://api.test", storage: memoryStorage() });
  store.dispatch({
    type: "auth/RESTORE_FINISHED",
    payload: {
      jwt: "a.b.c",
      user: { id: 1, email: "someone@example.com", name: "Someone", role: "coach" },
      athlete: null,
      current_program_year_id: 7,
    },
  } as never);
  const view = render(
    <Provider store={store}>
      <Year />
    </Provider>,
  );
  act(() => {
    store.dispatch({ type: "programYear/SUCCEEDED", payload: YEAR } as never);
  });
  return view;
}

describe("the year on a phone", () => {
  it("puts the nine-areas table inside something that scrolls on its own", () => {
    // Nine areas across six sections is wider than any phone. Without this
    // the whole page scrolls sideways and every other screen goes with it.
    const { container } = renderYear();
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect((table as HTMLElement).closest(".scroll-x")).not.toBeNull();
  });

  it("lets that box be scrolled without a mouse", () => {
    const { container } = renderYear();
    expect(container.querySelector(".scroll-x")).toHaveAttribute("tabindex", "0");
  });

  it("scrolls the wide thing rather than letting it stretch the page", () => {
    expect(declared(".scroll-x", "overflow-x")).toBe("auto");
    expect(declared(".scroll-x", "max-width")).toBe("100%");
  });

  it("says which section and which step are the live ones in words", () => {
    renderYear();
    expect(screen.getByText("Current block")).toBeInTheDocument();
    expect(screen.getByText("Working on this now.")).toBeInTheDocument();
  });
});

describe("the drill list", () => {
  it("is laid out across the screen rather than as one tall column", () => {
    // Eighty-odd full-width buttons stacked in a single column is a scroll,
    // not a list.
    expect(declared(".glossary__list", "display")).toBe("grid");
    expect(declared(".glossary__list", "grid-template-columns")).toContain("auto-fill");
  });

  it("keeps the way back looking unlike a drill", () => {
    expect(declared(".glossary .back-link", "background")).toBe("transparent");
    expect(declared(".glossary__list button", "background")).not.toBe("transparent");
  });
});

describe("token markup", () => {
  it("carries each token's style into the class, so the sheet can tell them apart", () => {
    const tokens: Token[] = [
      { text: "one", type: "text", style: "plain" },
      { text: "two", type: "text", style: "bold" },
      { text: "three", type: "text", style: "quote" },
    ];
    render(<Tokens tokens={tokens} />);
    expect(screen.getByText("one").className).toContain("token--plain");
    expect(screen.getByText("two").className).toContain("token--bold");
    expect(screen.getByText("three").className).toContain("token--quote");
  });
});
