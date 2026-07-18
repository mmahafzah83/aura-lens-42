import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Send } from "lucide-react";

type Alert = {
  id: string; severity: string; source: string;
  subject: string | null; what: string | null; impact: string | null; action: string | null;
  occurrences: number | null; created_at: string;
};
const OX = "#6E2A26", AMBER = "#9A7218", TEAL = "#1F8F7B";

export default function TodaysStatus() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [handled, setHandled] = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ops_alerts")
      .select("id, severity, source, subject, what, impact, action, occurrences, created_at")
      .eq("status", "open").order("created_at", { ascending: false });
    setAlerts((data || []) as Alert[]);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("ops_alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved").gte("created_at", since);
    setHandled(count || 0);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const needsYou = alerts.filter((a) => a.severity === "critical");
  const keepEye = alerts.filter((a) => a.severity === "high");

  const resolve = async (a: Alert) => {
    setResolving(a.id);
    const { error } = await supabase.from("ops_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", a.id);
    setResolving(null);
    if (error) { toast.error("Couldn't resolve — " + error.message); return; }
    setAlerts((prev) => prev.filter((x) => x.id !== a.id));
    toast.success("Marked resolved");
  };

  const sendToFix = async (a: Alert) => {
    const ticket = `Aura problem ticket
Source: ${a.source}
Level: ${a.severity}
What: ${a.what || a.subject || ""}
Impact: ${a.impact || "—"}
Suggested action: ${a.action || "—"}
Seen: ${a.occurrences || 1}x · first ${new Date(a.created_at).toLocaleString()}`;
    try { await navigator.clipboard.writeText(ticket); toast.success("Ticket copied — paste it to your technical partner"); }
    catch { toast.error("Couldn't copy — select the text manually"); }
  };

  const band = () => {
    if (needsYou.length) return { bg: "#F1E1DD", fg: OX, dot: "🔴", text: `${needsYou.length === 1 ? "1 thing needs you" : needsYou.length + " things need you"}${keepEye.length ? ` · ${keepEye.length} to keep an eye on` : ""}` };
    if (keepEye.length) return { bg: "#F5EBD3", fg: AMBER, dot: "🟡", text: `${keepEye.length === 1 ? "1 thing" : keepEye.length + " things"} to keep an eye on` };
    return { bg: "#E6F1ED", fg: TEAL, dot: "🟢", text: `All clear — nothing needs you${handled ? `. ${handled} handled automatically today.` : "."}` };
  };

  const card = (a: Alert, accent: string, label: string) => (
    <div key={a.id} style={{ border: "1px solid var(--hair)", borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "14px 16px", backgroundColor: "var(--ob-raised)", marginTop: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: accent, marginBottom: 6, fontWeight: 600 }}>
        {label}{a.occurrences && a.occurrences > 1 ? ` · seen ${a.occurrences}x` : ""}
      </div>
      <div style={{ fontSize: 15, color: "var(--glass)", fontWeight: 500, marginBottom: 6 }}>{a.what || a.subject || "Issue"}</div>
      {a.impact && <div style={{ fontSize: 13, color: "var(--glass-2)", marginBottom: 4 }}>This affects: {a.impact}</div>}
      {a.action && <div style={{ fontSize: 13, color: "var(--glass)", marginBottom: 10 }}>👉 {a.action}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button size="sm" variant="outline" onClick={() => resolve(a)} disabled={resolving === a.id}>
          {resolving === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span style={{ marginLeft: 6 }}>Resolve</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => sendToFix(a)}>
          <Send className="w-3.5 h-3.5" />
          <span style={{ marginLeft: 6 }}>Send to fix</span>
        </Button>
      </div>
    </div>
  );

  const b = band();
  return (
    <section style={{ backgroundColor: "var(--ob-panel)", border: "1px solid var(--hair)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass)" }}>Today's Status</h2>
        <button onClick={load} style={{ background: "none", border: "none", color: "var(--glass-2)", fontSize: 12, cursor: "pointer" }}>refresh</button>
      </div>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--glass-2)", fontSize: 13 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Checking…
        </div>
      ) : (
        <>
          <div style={{ backgroundColor: b.bg, color: b.fg, padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
            {b.dot} {b.text}
          </div>
          {needsYou.map((a) => card(a, OX, "Needs you"))}
          {keepEye.map((a) => card(a, AMBER, "Keep an eye"))}
        </>
      )}
    </section>
  );
}