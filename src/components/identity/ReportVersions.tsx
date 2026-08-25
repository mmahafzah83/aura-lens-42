// Version history + "what changed" for the Strategic Identity Report.
// Reads report_snapshots directly. Selecting an older version is READ ONLY —
// nothing in this file writes to report_snapshots.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import ReportViewerSection from "@/components/identity/ReportViewerSection";
import { diffReports, type ReportDiffRow } from "@/lib/reportDiff";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const INK = "#0F1519";
const MUTED = "#5B6673";
const ACTION = "#0670C4";
const BORDER = "#E2E7EE";
const CARD = "#FFFFFF";
const AMBER = "#E0A82E";
const UP = "#12805C";
const DOWN = "#C0392B";

const WRAP: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const CARD_BOX: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 20,
  padding: 16,
};
const PILL_ROW: React.CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 4,
  WebkitOverflowScrolling: "touch",
};
const PILL_BASE: React.CSSProperties = {
  flex: "0 0 auto",
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 999,
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const PRIMARY_BTN: React.CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 8,
  border: `1px solid ${ACTION}`,
  background: ACTION,
  color: "#FFFFFF",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};
const NOTE_LINE: React.CSSProperties = { fontSize: 13, color: MUTED, lineHeight: 1.5 };
const ERROR_LINE: React.CSSProperties = { fontSize: 12.5, color: DOWN, marginTop: 6 };
const DIFF_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  padding: "7px 0",
  borderBottom: `1px solid ${BORDER}`,
};
const AMBER_STRIP: React.CSSProperties = {
  borderLeft: `3px solid ${AMBER}`,
  paddingLeft: 12,
};

interface SnapshotRow {
  id: string;
  version: number;
  created_at: string;
  is_current: boolean;
  created_by: string | null;
  data: any;
}

interface Props {
  firstName?: string | null;
  lastName?: string | null;
  onCompleteAssessment: () => void;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function ReportVersions({ firstName, lastName, onCompleteAssessment }: Props) {
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** Older versions stay folded until asked for. */
  const [showOlder, setShowOlder] = useState(false);


  const load = useCallback(async (selectCurrent: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setLoaded(true); return; }
    const { data, error: err } = await (supabase.from("report_snapshots" as any) as any)
      .select("id, version, created_at, is_current, created_by, data")
      .eq("user_id", uid)
      .order("version", { ascending: false });
    if (err) { setLoaded(true); return; }
    const list = (data || []) as SnapshotRow[];
    setRows(list);
    setSelectedId((prev) => {
      if (selectCurrent || !prev) return list.find((r) => r.is_current)?.id ?? list[0]?.id ?? null;
      return list.some((r) => r.id === prev) ? prev : list.find((r) => r.is_current)?.id ?? null;
    });
    setLoaded(true);
  }, []);

  useEffect(() => { void load(true); }, [load]);

  const current = rows.find((r) => r.is_current) ?? rows[0] ?? null;
  const selected = rows.find((r) => r.id === selectedId) ?? current;
  const viewingOld = !!selected && !!current && selected.id !== current.id;

  const selectedIndex = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
  const previous = selectedIndex >= 0 ? rows[selectedIndex + 1] : undefined;
  let diff: ReportDiffRow[] = [];
  if (selected && previous && !viewingOld) diff = diffReports(selected.data, previous.data);

  const handleNewVersion = async () => {
    setBuilding(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("capture-report-snapshot", {
        body: { created_by: "user" },
      });
      if (err) throw new Error((err as any)?.message || "We couldn't build your report.");
      if ((data as any)?.error) throw new Error(String((data as any).error));
      await load(true);
    } catch (e: any) {
      setError(typeof e?.message === "string" && e.message ? e.message : "We couldn't build your report.");
    } finally {
      setBuilding(false);
    }
  };

  const onlyOne = rows.length === 1;

  return (
    <div style={WRAP}>
      {/* WHAT CHANGED — only when there is a real previous version to compare against */}
      {loaded && rows.length >= 2 && !viewingOld ? (
        diff.length > 0 ? (
          <div style={CARD_BOX}>
            <SectionHeader label="WHAT CHANGED" />
            <div>
              {diff.map((d) => (
                <div key={d.path} style={DIFF_ROW}>
                  <span style={{ fontSize: 13, color: INK }}>{d.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: INK }}>
                    {d.from}{" "}
                    <span style={{ color: d.direction === "up" ? UP : d.direction === "down" ? DOWN : MUTED }}>→</span>{" "}
                    {d.to}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={NOTE_LINE}>Nothing measurable changed since your last report.</p>
        )
      ) : null}

      {/* Pills + primary action */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loaded && rows.length > 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Only the current version is on show; the rest are one row away. */}
            <button
              type="button"
              onClick={() => setShowOlder((v) => !v)}
              aria-expanded={showOlder}
              aria-controls="report-earlier-versions"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                minHeight: 44, width: "100%", padding: "0 2px", background: "none",
                border: 0, cursor: "pointer", textAlign: "start", fontSize: 13, color: MUTED,
              }}
            >
              <span style={{ fontFamily: MONO }}>
                {rows.length - 1} earlier {rows.length - 1 === 1 ? "version" : "versions"}
              </span>
              <span aria-hidden style={{ transform: showOlder ? "rotate(180deg)" : "none" }}>▾</span>
            </button>
            <div id="report-earlier-versions" hidden={!showOlder}>
              {showOlder ? (
                <div style={PILL_ROW}>
                  {rows.map((r) => {
                    const active = r.id === selected?.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        aria-pressed={active}
                        style={{
                          ...PILL_BASE,
                          background: active ? ACTION : CARD,
                          color: active ? "#FFFFFF" : MUTED,
                          border: active ? `1px solid ${ACTION}` : `1px solid ${BORDER}`,
                        }}
                      >
                        <span style={{ fontFamily: MONO }}>v{r.version}</span>
                        <span style={{ fontFamily: MONO }}>{fmtDate(r.created_at)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}


        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button type="button" style={{ ...PRIMARY_BTN, opacity: building ? 0.6 : 1 }} disabled={building} onClick={handleNewVersion}>
            {building ? "Building your report…" : "Make a new version"}
          </button>
          {loaded && onlyOne ? (
            <span style={NOTE_LINE}>This is your first report. Make a new one whenever something has changed.</span>
          ) : null}
        </div>
        {error ? <div style={ERROR_LINE}>{error}</div> : null}
      </div>

      {/* Viewer — older selection is read-only and clearly marked */}
      <div style={viewingOld ? AMBER_STRIP : undefined}>
        {viewingOld && selected && current ? (
          <p style={{ ...NOTE_LINE, marginBottom: 8 }}>
            You're looking at version <span style={{ fontFamily: MONO }}>{selected.version}</span>, from{" "}
            <span style={{ fontFamily: MONO }}>{fmtDate(selected.created_at)}</span>. Your current report is{" "}
            <span style={{ fontFamily: MONO }}>v{current.version}</span>.{" "}
            <button
              type="button"
              onClick={() => setSelectedId(current.id)}
              style={{ background: "none", border: 0, padding: 0, color: ACTION, fontSize: 13, cursor: "pointer" }}
            >
              Back to current
            </button>
          </p>
        ) : null}
        <ReportViewerSection
          firstName={firstName}
          lastName={lastName}
          onCompleteAssessment={onCompleteAssessment}
          overrideReport={selected?.data ?? null}
          overrideVersion={selected?.version ?? null}
          overrideSnapshotAt={selected?.created_at ?? null}
        />
      </div>
    </div>
  );
}
