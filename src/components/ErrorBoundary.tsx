import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Aura error boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            background: "var(--surface-ink-raised)",
            borderRadius: "12px",
            border: "1px solid var(--ink-3)",
            margin: "24px",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>⚠️</div>
          <h3 style={{ color: "var(--ink-7)", marginBottom: "8px" }}>
            Something went wrong
          </h3>
          <p style={{ color: "var(--ink-5)", fontSize: "14px", marginBottom: "24px" }}>
            This section failed to load. Your data is safe.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: "var(--brand)",
              color: "#000",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
