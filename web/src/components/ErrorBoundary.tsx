import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// A blank screen after a screen throws is indistinguishable from the app
// being down. Jeff's next thought would be that his son's year of data is
// gone, not that a component crashed. So this catches the throw and gives
// him one thing to do about it, instead of nothing at all.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("A screen crashed:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <p>Something went wrong. Try reloading the page.</p>
          <button type="button" onClick={this.handleReload}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
