import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

describe("the error boundary", () => {
  it("shows something a person can act on when a screen throws", () => {
    // React logs the caught error to the console on every render pass in
    // dev-like environments, and componentDidCatch here logs a second time
    // on purpose (see ErrorBoundary.tsx). Both are expected for this one
    // test; silencing them keeps the suite's output readable without
    // hiding a console.error anywhere else.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // A white page is indistinguishable from the app being down. This is the
    // difference between "try again" and Jeff assuming his son's year is gone.
    function Boom(): JSX.Element {
      throw new Error("boom");
    }
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);

    spy.mockRestore();
  });

  it("renders its children when nothing throws", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
});
