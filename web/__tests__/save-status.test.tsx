import { render, screen } from "@testing-library/react";
import { SaveStatus } from "../src/components/SaveStatus";

// The four states, and the order they win in. A form that is both saving and
// holding a queued write is saving; a form with a queued write has not
// reached the server whatever its entry says it was last saved at.
describe("SaveStatus", () => {
  it("says nothing before anything has been written", () => {
    const { container } = render(<SaveStatus saving={false} queued={false} savedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is saving", () => {
    render(<SaveStatus saving queued={false} savedAt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving.");
  });

  it("says a write is waiting for a connection", () => {
    render(<SaveStatus saving={false} queued savedAt="2026-09-17T16:12:00Z" />);
    expect(screen.getByRole("status")).toHaveTextContent(/waiting to send/i);
  });

  it("prefers saving over waiting", () => {
    render(<SaveStatus saving queued savedAt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving.");
  });

  it("says when the server last saved it", () => {
    render(<SaveStatus saving={false} queued={false} savedAt="2026-09-17T16:12:00Z" />);
    // The local time, whatever zone the test runs in, so this asserts the
    // shape rather than a zone the CI box happens to be in.
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved \d{1,2}:\d{2}/);
  });

  it("says nothing about a time it cannot read", () => {
    render(<SaveStatus saving={false} queued={false} savedAt="not a date" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // waitingText is optional so the six cases above, none of which pass it,
  // stay exactly as they were. This is the one case that does pass it, and
  // it exists for Teddy's form: his screen already spoke to a 7-year-old
  // in his own words, and this default line is written for his dad.
  it("says the waiting line a form passes in, not its own default", () => {
    render(
      <SaveStatus
        saving={false}
        queued
        savedAt={null}
        waitingText="This is saved on your device and will send once you're back online."
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/saved on your device/i);
  });
});
