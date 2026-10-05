/**
 * ReadTierHome — the home a read-tier member lands on.
 *
 * Their read is theirs permanently: no lock, no countdown, no expiry on it.
 * The only primary action on the whole screen is the seat button in block 4.
 */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ButtonPrimary, ButtonGhost } from "@/components/systemb/Button";
import { MONO } from "./homeAtoms";
import { memberText } from "@/lib/memberText";
import { useReportSnapshot } from "@/hooks/useReportSnapshot";
import { exportReportPdf } from "@/lib/exportReportPdf";
import BrandPaperDocument from "@/components/report/BrandPaperDocument";
import RevealCard, { shareRevealCard, type RevealData } from "@/components/onboarding/RevealCard";
import { toRevealData } from "@/lib/marketRead";
import { brandPaperHasContent, attachCapabilityNamesAr, type CapabilityNameRow } from "@/lib/buildBrandPaper";
import { arabicDate } from "@/components/report/paperText";
import {
  SEAT_ROWS,
  SEAT_PATH,
} from "@/lib/seatCopy";

interface Props {
  onSwitchTab?: (tab: string) => void;
}

const CARD: React.CSSProperties = {
  background: "var(--surface-card, #FFFFFF)",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  padding: "20px 20px",
  marginBottom: 14,
};

const NIGHT: React.CSSProperties = {
  background: "var(--v23-night)",
  border: "1px solid var(--v23-night-line)",
  borderRadius: 16,
  padding: "22px 20px",
  marginBottom: 14,
  color: "var(--text-inverse)",
};

// Arabic: Cairo, open line-height, no tracking.
const AR: React.CSSProperties = { fontFamily: "var(--font-arabic)", lineHeight: 1.7, letterSpacing: 0, textTransform: "none", fontStyle: "normal" };

function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

const ReadTierHome: React.FC<Props> = ({ onSwitchTab }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [firstName, setFirstName] = useState<string>("");
  const [readAt, setReadAt] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [capNames, setCapNames] = useState<CapabilityNameRow[] | null>(null);
  const isAr = i18n.language === "ar";
  const ar = (st: React.CSSProperties): React.CSSProperties => (isAr ? { ...st, ...AR } : st);

  // Same Arabic capability names the report viewer attaches, so both PDFs match.
  useEffect(() => {
    let off = false;
    (supabase.from("capability_dimensions" as any) as any).select("name, name_ar")
      .then(({ data }: any) => { if (!off) setCapNames(data || null); });
    return () => { off = true; };
  }, []);

  const { report, version, snapshotAt } = useReportSnapshot();
  const pdfMount = useRef<HTMLDivElement | null>(null);
  const shareMount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("first_name, brand_assessment_results, brand_assessment_completed_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!alive || !data) return;
      setFirstName(((data as any).first_name || "").trim());
      const r = (data as any).brand_assessment_results;
      setResults(r && typeof r === "object" && Object.keys(r).length ? r : null);
      setReadAt((data as any).brand_assessment_completed_at || null);
    })();
    return () => { alive = false; };
  }, []);

  const resolvedDate = readAt || snapshotAt || null;
  const dateLine = (() => {
    if (!resolvedDate) return null;
    const d = new Date(resolvedDate);
    if (isNaN(d.getTime())) return null;
    if (isAr) return arabicDate(resolvedDate).replace(/ \d{4}$/, "");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  })();

  const archetype = String(results?.primary_archetype || "").replace(/[*_`#]/g, "").trim();
  const revealData: RevealData | null = results ? toRevealData(results, { figures: [], lang: i18n.language === "ar" ? "ar" : "en" }) : null;

  const goIdentity = () => onSwitchTab?.("identity");

  const handlePdf = async () => {
    if (!report || !pdfMount.current) {
      toast.error(t("readHome.toastNotReady"));
      return;
    }
    setExporting(true);
    try {
      const person = (firstName || "Member").replace(/[^A-Za-z0-9]+/g, "-");
      const date = (snapshotAt ? new Date(snapshotAt) : new Date()).toISOString().slice(0, 10);
      await exportReportPdf(pdfMount.current, `KnownBy-Report-${person}-v${version ?? 1}-${date}.pdf`);
    } catch {
      toast.error(t("readHome.toastPdf"));
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    if (!shareMount.current || !revealData) return;
    setSharing(true);
    try {
      await shareRevealCard(shareMount.current, { caption: undefined });
    } catch {
      toast.error(t("readHome.toastCard"));
    } finally {
      setSharing(false);
    }
  };

  const canPdf = brandPaperHasContent((report as any)?.brand_paper ?? null);
  const notReady = !!readAt && !results && !canPdf;

  return (
    <div className="animate-tab-spring aura-page" style={{ maxWidth: 720 }}>
      {/* ── BLOCK 1 — the greeting ── */}
      <section data-surface="dark" style={NIGHT}>
        <h1 style={{
          margin: 0, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 26,
          letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--text-inverse)",
          ...(isAr ? { ...AR, lineHeight: 1.4 } : {}),
        }}>
          {firstName
            ? t(`home.masthead.${greetingKey(new Date().getHours())}Name`, { name: firstName })
            : t(`home.masthead.${greetingKey(new Date().getHours())}`)}
        </h1>
        {dateLine && (
          <p style={ar({ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--v23-on-night, rgba(255,255,255,.72))" })}>
            {t("readHome.readFrom", { date: dateLine })}
          </p>
        )}
      </section>

      {/* ── BLOCK 2 — their artifact ── */}
      <section style={CARD}>
        <h2 style={{
          margin: 0, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 19,
          color: "var(--text-primary)", lineHeight: 1.25, ...memberText(archetype).style,
        }} dir="auto">
          {archetype || t("readHome.yourRead")}
        </h2>
        <p style={ar({ margin: "6px 0 14px", fontSize: 13, color: "var(--text-secondary)" })}>{t("readHome.permanent")}</p>
        {notReady ? (
          <p style={ar({ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" })}>
            {t("readHome.notReady")}
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {notReady ? (
            <ButtonGhost onClick={() => navigate("/onboarding")}>{t("readHome.runAgain")}</ButtonGhost>
          ) : (
            <ButtonGhost onClick={goIdentity}>{t("readHome.open")}</ButtonGhost>
          )}
          {canPdf && (
            <ButtonGhost onClick={handlePdf} disabled={exporting}>
              {exporting ? t("readHome.building") : t("readHome.pdf")}
            </ButtonGhost>
          )}
          {revealData && (
            <ButtonGhost onClick={handleShare} disabled={sharing}>
              {sharing ? t("readHome.preparing") : t("readHome.share")}
            </ButtonGhost>
          )}
        </div>
      </section>

      {/* ── BLOCK 3 — one thing to do ── */}
      <section style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--act)", display: "inline-block" }} />
          <h2 style={ar({ margin: 0, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" })}>
            {t("readHome.cantSee")}
          </h2>
        </div>
        <p style={ar({ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" })}>
          {t("readHome.cantSeeBody")} you're good at has no evidence behind it yet. Members turn those from grey to proven by capturing as they work.
        </p>
        <ButtonGhost onClick={goIdentity}>{t("readHome.seeMap")}</ButtonGhost>
      </section>

      {/* ── BLOCK 4 — what a seat opens ── */}
      <section data-surface="dark" style={NIGHT}>
        <h2 style={{
          margin: 0, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 18,
          color: "var(--text-inverse)",
        }}>
          {t("seat.heading")}
        </h2>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-inverse)" }}>
          {t("seat.oneJob")}
        </p>
        <div style={{ display: "grid", gap: 6, margin: "14px 0 16px" }}>
          {SEAT_ROWS.map((_r, i) => t(`seat.how.${i + 1}`)).map((row) => (
            <p key={row} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--v23-on-night, rgba(255,255,255,.78))" }}>
              {row}
            </p>
          ))}
        </div>
        <div style={{ ...MONO, fontSize: 24, color: "var(--text-inverse)" }}>{t("seat.price")}</div>
        <p style={{ margin: "6px 0 16px", fontSize: 12.5, lineHeight: 1.55, color: "var(--v23-on-night, rgba(255,255,255,.72))" }}>
          {t("seat.priceSub")}
        </p>
        <ButtonPrimary onClick={() => navigate(SEAT_PATH)}>{t("auth.request.reserve")}</ButtonPrimary>
      </section>

      {/* offscreen mounts — the same documents the identity surfaces export */}
      {canPdf && (
        <div ref={pdfMount} aria-hidden style={{ position: "absolute", left: -9999, top: 0, width: 794, pointerEvents: "none" }}>
          <BrandPaperDocument paper={{ ...(report as any).brand_paper, capabilities: attachCapabilityNamesAr((report as any).brand_paper.capabilities || [], capNames) }} showClosing={false} />
        </div>
      )}
      {revealData && (
        <div aria-hidden style={{ position: "absolute", left: -9999, top: 0, pointerEvents: "none" }}>
          <RevealCard ref={shareMount} data={revealData} forExport />
        </div>
      )}
    </div>
  );
};

export default ReadTierHome;
