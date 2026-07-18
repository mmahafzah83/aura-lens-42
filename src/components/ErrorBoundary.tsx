import React from "react";
import AuraLogo from "@/components/brand/AuraLogo";
import { reportClientError } from "@/lib/clientErrorLog";

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Aura error boundary caught:", error, info);
    try {
      void reportClientError(error?.message ?? "render error", "high", {
        componentStack: info?.componentStack,
        route: typeof location !== "undefined" ? location.pathname : "unknown",
      });
    } catch {
      // logging must never re-throw
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "48px 24px",
          background: "var(--paper)",
          color: "var(--ink)",
          textAlign: "center",
        }}
      >
        <AuraLogo size={44} />
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
          }}
        >
          Something went wrong.
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 420,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink-3)",
          }}
        >
          Your data is safe. The page hit an unexpected error — reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 4,
            background: "var(--action)",
            color: "var(--paper)",
            border: "none",
            borderRadius: 8,
            padding: "10px 22px",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Reload
        </button>
        <a
          href="mailto:support@aura-intel.org?subject=Aura%20issue%20report"
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "var(--ink-3)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Report this issue
        </a>
      </div>
    );
  }
}

export default ErrorBoundary;
