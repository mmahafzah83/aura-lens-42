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
            padding: "48px 32px",
            textAlign: "center",
            background: "var(--paper)",
            borderRadius: "12px",
            border: "1px solid var(--vellum)",
            margin: "24px",
          }}
        >
          <h3
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 26,
              fontWeight: 500,
              color: "var(--ink)",
              marginBottom: "10px",
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h3>
          <p style={{ color: "var(--ink-4)", fontSize: "14px", marginBottom: "24px", lineHeight: 1.6 }}>
            Your data is safe. Try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "var(--brand)",
              color: "var(--paper)",
              border: "none",
              borderRadius: "8px",
              padding: "12px 28px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Refresh →
          </button>
          <div style={{ marginTop: 18 }}>
            <a
              href="mailto:support@aura-intel.org?subject=Aura%20issue%20report"
              style={{
                fontSize: 12,
                color: "var(--ink-5)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Report this issue
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
