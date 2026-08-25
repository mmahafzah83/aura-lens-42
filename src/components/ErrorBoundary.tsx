import React from "react";
import AuraLogo from "@/components/brand/AuraLogo";
import { reportClientError } from "@/lib/clientErrorLog";
import { reportIssue } from "@/lib/reportIssue";

interface State {
  hasError: boolean;
  message: string;
  componentStack: string;
  sending: boolean;
  sentId: string | null;
  sendFailed: boolean;
  copied: boolean;
}

const EMPTY: State = {
  hasError: false,
  message: "",
  componentStack: "",
  sending: false,
  sentId: null,
  sendFailed: false,
  copied: false,
};

class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = EMPTY;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error?.message ?? "render error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({
      message: error?.message ?? "render error",
      componentStack: info?.componentStack ?? "",
    });
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

  route = () => (typeof location !== "undefined" ? location.pathname : "unknown");

  sendReport = async () => {
    if (this.state.sending) return;
    this.setState({ sending: true, sendFailed: false });
    const res = await reportIssue({
      kind: "crash",
      message: this.state.message || "render error",
      route: this.route(),
      componentStack: this.state.componentStack,
    });
    if (res.ok) this.setState({ sending: false, sentId: res.id ?? "", sendFailed: false });
    else this.setState({ sending: false, sendFailed: true });
  };

  copyDetails = async () => {
    const text = `Aura issue\nRoute: ${this.route()}\nError: ${this.state.message}\n${this.state.componentStack}`;
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

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
        {this.state.sentId !== null ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>
            Reported. Thank you — we can see this one now.
            {this.state.sentId ? <> Reference <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>{this.state.sentId}</span>.</> : null}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <button
              onClick={this.sendReport}
              disabled={this.state.sending}
              style={{
                background: "transparent",
                color: "var(--ink-3)",
                border: "1px solid var(--brand-line, #E2E7EE)",
                borderRadius: 8,
                minHeight: 44,
                padding: "10px 18px",
                cursor: this.state.sending ? "default" : "pointer",
                fontSize: 13,
              }}
            >
              {this.state.sending ? "Sending…" : "Report this issue"}
            </button>
            {this.state.sendFailed ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>Couldn't send that report.</p>
                <button
                  onClick={this.copyDetails}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--brand-line, #E2E7EE)",
                    borderRadius: 8,
                    minHeight: 44,
                    padding: "10px 18px",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--ink-3)",
                  }}
                >
                  {this.state.copied ? "Details copied" : "Copy details"}
                </button>
                <a
                  href="mailto:support@aura-intel.org?subject=Aura%20issue%20report"
                  style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Email it to support instead
                </a>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
