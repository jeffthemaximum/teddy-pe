import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Token } from "@teddy-pe/core";
import { Tokens } from "../src/components/Tokens";

// Types this file has actually seen plus one it has not. "sidebar" is not
// a type any duck or backend serializer sends today (grep core/ and
// backend/ for it and it is not there); it stands in for whatever type the
// API adds next, which this component cannot have been coded against.
//
// Two tokens share the exact text "Ready" but carry different styles
// ("cue" and "warning"), so a renderer that ignored `style` and always
// produced the same markup could still pass "renders plain text as text"
// and "keeps tokens in order" by accident. Only the style-specific
// assertion can tell them apart, and it has to, because they render as
// two elements with identical text content otherwise.
const FIXTURE: Token[] = [
  { text: "Ready", type: "text", style: "cue" },
  { text: "Ready", type: "text", style: "warning" },
  { text: "Split step", type: "drill", style: "plain", slug: "split-step" },
  { text: "watch the ball all the way in", type: "sidebar", style: "plain" },
];

describe("Tokens", () => {
  it("renders plain text as text", () => {
    render(<Tokens tokens={[{ text: "Land like a cat", type: "text", style: "plain" }]} />);
    expect(screen.getByText("Land like a cat")).toBeInTheDocument();
  });

  it("applies a token's style rather than ignoring it", () => {
    render(<Tokens tokens={FIXTURE} />);
    const [cue, warning] = screen.getAllByText("Ready");

    // Same text, different style: this can only pass if `style` actually
    // reaches the DOM, and reaches it differently for each token.
    expect(cue.className).toContain("cue");
    expect(warning.className).toContain("warning");
    expect(cue.className).not.toBe(warning.className);
  });

  it("opens a drill by its slug when its token is tapped", async () => {
    // "Tappable" has to mean something happens on tap, not just that the
    // element carrying the slug happens to be a <button>. Without an
    // onSelectDrill call wired to onClick, a person can tap this all day
    // and the glossary never hears about it: nothing before this test
    // could tell that state apart from a working handler, because nothing
    // ever tapped the button.
    const onSelectDrill = vi.fn();
    render(<Tokens tokens={FIXTURE} onSelectDrill={onSelectDrill} />);
    const drill = screen.getByRole("button", { name: "Split step" });
    expect(drill).toHaveAttribute("data-slug", "split-step");

    await userEvent.click(drill);

    expect(onSelectDrill).toHaveBeenCalledTimes(1);
    expect(onSelectDrill).toHaveBeenCalledWith("split-step");
  });

  it("does not call onSelectDrill for a tap on plain text", async () => {
    const onSelectDrill = vi.fn();
    render(<Tokens tokens={FIXTURE} onSelectDrill={onSelectDrill} />);

    await userEvent.click(screen.getAllByText("Ready")[0]);

    expect(onSelectDrill).not.toHaveBeenCalled();
  });

  it("renders an unknown token type's text rather than dropping it", () => {
    // This is the one that matters. A renderer that silently drops what it
    // does not recognise loses a day's instructions the first time the API
    // adds a token type, and nothing reports it.
    render(<Tokens tokens={FIXTURE} />);
    expect(screen.getByText("watch the ball all the way in")).toBeInTheDocument();
  });

  it("renders an empty token array as nothing, not as a crash", () => {
    const { container } = render(<Tokens tokens={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps tokens in the order they arrived", () => {
    const { container } = render(<Tokens tokens={FIXTURE} />);
    const texts = Array.from(container.childNodes).map((node) => node.textContent);
    expect(texts).toEqual(["Ready", "Ready", "Split step", "watch the ball all the way in"]);
  });
});
