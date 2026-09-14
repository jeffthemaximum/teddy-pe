import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayCard, DayBlock } from "@teddy-pe/core";
import { TodayCard } from "../src/components/TodayCard";

// Three blocks, so "one open at a time" can be told apart from "the one you
// tapped opens". A two-block fixture cannot: closing the first and opening
// the second looks the same either way.
function block(id: number, name: string, body: string): DayBlock {
  return {
    id,
    position: id,
    minutes: "10",
    name,
    tag: null,
    name_tokens: [{ text: name, type: "text", style: "plain" }],
    body_tokens: [{ text: body, type: "text", style: "plain" }],
    drill_slugs: [],
  };
}

const DAY: DayCard = {
  id: 1,
  dow: "thu",
  date: "2026-09-17",
  name: "Wall Day",
  role: "Wall Day",
  minutes: "100 to 120",
  intensity: 3,
  hie: 8,
  summary_lines: ["Tennis heaviest."],
  drill_slugs: [],
  dad_note: "Watch his contact point.",
  blocks: [block(1, "Wake Up", "Animal walks."), block(2, "New Thing", "Cartwheel."), block(3, "Play", "His pick.")],
};

describe("TodayCard", () => {
  it("opens the first block on arrival", () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    expect(screen.getByText("Animal walks.")).toBeInTheDocument();
    expect(screen.queryByText("Cartwheel.")).toBeNull();
  });

  it("lists every block whether open or not", () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("opens the one tapped and closes the one that was open", async () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /New Thing/ }));

    expect(screen.getByText("Cartwheel.")).toBeInTheDocument();
    expect(screen.queryByText("Animal walks.")).toBeNull();
    expect(screen.queryByText("His pick.")).toBeNull();
  });

  it("closes a block tapped a second time", async () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Wake Up/ }));

    expect(screen.queryByText("Animal walks.")).toBeNull();
  });

  it("says which block is open, for a screen reader", async () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    const wakeUp = screen.getByRole("button", { name: /Wake Up/ });
    expect(wakeUp).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: /New Thing/ }));
    expect(wakeUp).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the dad note and the summary lines", () => {
    render(<TodayCard day={DAY} onSelectDrill={() => {}} />);
    expect(screen.getByText(/Watch his contact point/)).toBeInTheDocument();
    expect(screen.getByText("Tennis heaviest.")).toBeInTheDocument();
  });

  // Game Day: the home program is off, the card carries no blocks at all,
  // and the summary lines are the whole answer.
  it("shows a card with no blocks as its summary alone", () => {
    render(<TodayCard day={{ ...DAY, blocks: [], dad_note: undefined }} onSelectDrill={() => {}} />);
    expect(screen.getByText("Tennis heaviest.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("hands a tapped drill token back to its caller", async () => {
    const opened: string[] = [];
    const withDrill: DayCard = {
      ...DAY,
      blocks: [
        {
          ...block(1, "Wake Up", "Do the "),
          body_tokens: [
            { text: "Do the ", type: "text", style: "plain" },
            { text: "bear walk", type: "drill", style: "link", slug: "bear-walk" },
          ],
        },
      ],
    };
    render(<TodayCard day={withDrill} onSelectDrill={(slug) => opened.push(slug)} />);

    await userEvent.click(screen.getByRole("button", { name: "bear walk" }));

    expect(opened).toEqual(["bear-walk"]);
  });
});
