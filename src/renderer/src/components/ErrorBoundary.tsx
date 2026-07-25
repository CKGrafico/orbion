import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: "red", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          <h2 style={{ color: "red" }}>Renderer crashed</h2>
          <p>{this.state.error?.message}</p>
          <details>
            <summary>Stack trace</summary>
            {this.state.error?.stack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
