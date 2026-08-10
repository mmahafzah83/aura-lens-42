/**
 * THE COLLECTION — the fourteen-screen first run.
 *
 * Surface law, absolute:
 *   NIGHT (#0F1519)  = Aura is working, the member does nothing. AuraFace lives here.
 *   WHITE / CREAM    = the member's turn. ProgressBeads live here.
 *
 * Content comes from two live tables — capability_dimensions and
 * onboarding_questions — resolved exact (band, sector) first, then
 * (band, sector IS NULL). If both come back empty the member sees a friendly
 * retry, never a blank screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveLinkedInAddress, canonicalHandle } from "@/lib/linkedinAddress";
import usePageMeta from "@/hooks/usePageMeta";
import { useCountUp } from "@/hooks/useCountUp";
import { SECTORS } from "@/constants/sectors";
import { initThemeFromStorage } from "@/lib/applyTheme";
import { track } from "@/lib/track";
import { generateMarketRead, loadMarketRead, saveAnswers, toRevealData } from "@/lib/marketRead";
import AuraFace from "@/components/onboarding/AuraFace";
import ShelfBadge, { type ShelfBadgeTone } from "@/components/onboarding/ShelfBadge";
import ClaimCard from "@/components/onboarding/ClaimCard";
import ProgressBeads from "@/components/onboarding/ProgressBeads";
import RevealCard, { type RevealData, shareRevealCard, suggestedCaption } from "@/components/onboarding/RevealCard";
import StatusRow from "@/components/onboarding/StatusRow";
import Confetti from "@/components/onboarding/Confetti";
import { OB, SPRING, EASE, RADIUS, reducedMotion } from "@/components/onboarding/tokens";

/* ──────────────────────────────── tokens & copy ─────────────────────────── */

type Band = "work" | "table" | "room";

const BAND_LABEL: Record<Band, string> = {
  work: "Manager & lead",
  table: "Director & partner",
  room: "C-suite & board",
};

const BAND_TO_LEVEL: Record<Band, string> = {
  work: "Manager",
  table: "Director",
  room: "C-Suite",
};

const SHELF: { key: string; label: string; tone: ShelfBadgeTone }[] = [
  { key: "profile", label: "Your profile", tone: "blue" },
  { key: "claims", label: "First claims", tone: "cyan" },
  { key: "strengths", label: "Strengths", tone: "deep" },
  { key: "subjects", label: "Your subjects", tone: "amber" },
];

const MANUAL_SCREEN = 15;

const PAGE_CSS = `
.obc{font-family:${OB.ui};-webkit-font-smoothing:antialiased;color:${OB.ink};}
.obc *,.obc *::before,.obc *::after{box-sizing:border-box;}
.obc :focus-visible{outline:2px solid ${OB.blue};outline-offset:3px;border-radius:8px;}
@keyframes obc-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.obc-in{animation:obc-in 450ms ${SPRING} both;}
.obc-line{opacity:0;animation:obc-in 450ms ${SPRING} both;}
@media (prefers-reduced-motion:reduce){
  .obc-in,.obc-line{animation:none !important;opacity:1 !important;transform:none !important;}
}
`;

const btnPrimary: React.CSSProperties = {
  inlineSize: "100%", minBlockSize: 52, borderRadius: RADIUS.pill, border: "none",
  background: OB.blue, color: "#FFFFFF", fontSize: 15.5, fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
  transition: `transform 220ms ${EASE}, opacity 220ms ${EASE}`, fontFamily: "inherit",
};

const btnGhostLight: React.CSSProperties = {
  inlineSize: "100%", minBlockSize: 46, borderRadius: RADIUS.pill,
  background: "transparent", color: OB.muted, border: `1px solid ${OB.line}`,
  fontSize: 14.5, fontWeight: 500, cursor: "pointer", marginBlockStart: 10, fontFamily: "inherit",
};

const btnGhostNight: React.CSSProperties = {
  ...btnGhostLight, color: OB.mutedNight, border: `1px solid ${OB.lineNight}`,
};

const fieldStyle: React.CSSProperties = {
  inlineSize: "100%", background: OB.canvas, border: `1px solid ${OB.line}`,
  color: OB.ink, fontSize: 15.5, fontFamily: "inherit", padding: "14px 16px",
  borderRadius: 12, outline: "none",
};

const h1Light: React.CSSProperties = {
  margin: 0, fontSize: "clamp(26px,7.2vw,34px)", fontWeight: 800,
  letterSpacing: "-0.03em", lineHeight: 1.1, color: OB.ink,
};

const h1Night: React.CSSProperties = { ...h1Light, color: "#FFFFFF" };

const bodyLight: React.CSSProperties = {
  margin: "12px 0 0", fontSize: 15, lineHeight: 1.65, color: OB.muted,
};

const bodyNight: React.CSSProperties = { ...bodyLight, color: OB.mutedNight };

const footnote: React.CSSProperties = {
  margin: "14px 0 0", fontSize: 12, lineHeight: 1.55, color: OB.muted, textAlign: "center",
};

/* ──────────────────────────────── helpers ───────────────────────────────── */

interface Dimension {
  name: string; why_line: string | null; anchor_low: string | null; anchor_high: string | null;
}
interface JourneyQuestion {
  prompt: string; helper: string | null; kind: string;
  options: { label: string; value: string }[] | null;
}
interface Claim { title: string; content?: string | null; confidence?: number | null }

const normaliseLinkedIn = (input: string): string | null => {
  const handle = canonicalHandle(input);
  return handle ? `https://www.linkedin.com/in/${handle}` : null;
};

const wordsIn = (rows: { post_text?: string | null }[]): number =>
  rows.reduce((n, r) => n + String(r.post_text || "").trim().split(/\s+/).filter(Boolean).length, 0);

/* ──────────────────────────────── shells ────────────────────────────────── */

const NightShell = ({ children, face, footer }: { children: React.ReactNode; face?: boolean; footer?: React.ReactNode }) => (
  <div className="obc" style={{
    minBlockSize: "100dvh", background: OB.night, display: "flex", alignItems: "center",
    justifyContent: "center", padding: "28px 20px",
  }}>
    <div className="obc-in" style={{ inlineSize: "100%", maxInlineSize: 420 }}>
      {face ? <div style={{ marginBlockEnd: 26 }}><AuraFace /></div> : null}
      {children}
      {footer}
    </div>
  </div>
);

const PaperShell = ({
  children, bead, cream = false, footer,
}: { children: React.ReactNode; bead: number; cream?: boolean; footer?: React.ReactNode }) => (
  <div className="obc" style={{
    minBlockSize: "100dvh", background: cream ? OB.cream : OB.canvas,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px",
  }}>
    <div style={{ inlineSize: "100%", maxInlineSize: 460 }}>
      <div style={{ display: "flex", justifyContent: "center", marginBlockEnd: 18 }}>
        <ProgressBeads active={bead} />
      </div>
      <div className="obc-in" style={{
        background: OB.white, borderRadius: RADIUS.hero, border: `1px solid ${OB.line}`,
        padding: "clamp(22px,6vw,32px)", boxShadow: "0 30px 70px -50px rgba(15,21,25,.4)",
      }}>
        {children}
      </div>
      {footer}
    </div>
  </div>
);

/* ──────────────────────────────── page ──────────────────────────────────── */

const Onboarding = () => {
  usePageMeta({
    title: "Aura — Start your shelf",
    description: "Five short steps. Aura learns your sector, your level and the way you already write.",
    path: "/onboarding",
  });
  const navigate = useNavigate();
  useEffect(() => { initThemeFromStorage(); }, []);

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [needsIdentityConfirm, setNeedsIdentityConfirm] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdShow, setPwdShow] = useState(false);
  const [settingPwd, setSettingPwd] = useState(false);

  const [screen, setScreen] = useState(0);

  /* member facts */
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firm, setFirm] = useState("");
  const [sector, setSector] = useState("");
  const [band, setBand] = useState<Band | null>(null);

  /* screen 1–3 */
  const [liInput, setLiInput] = useState("");
  const [liBusy, setLiBusy] = useState(false);
  const [liError, setLiError] = useState("");
  const [liProfile, setLiProfile] = useState<any>(null);
  const [postsRead, setPostsRead] = useState<number | null>(null);
  const [ownWords, setOwnWords] = useState<number | null>(null);
  const [readDone, setReadDone] = useState(false);
  const [sectorKnown, setSectorKnown] = useState(false);
  const [bandPicker, setBandPicker] = useState(false);

  /* screen 5–7 */
  const [linkInput, setLinkInput] = useState("");
  const [suggested, setSuggested] = useState<{ url: string; title: string; summary?: string; source?: string } | null>(null);
  const [suggestDead, setSuggestDead] = useState(false);
  const [readStep, setReadStep] = useState(0);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsSlow, setClaimsSlow] = useState(false);

  /* screen 9 */
  const [dims, setDims] = useState<Dimension[] | null>(null);
  const [dimIdx, setDimIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [contentError, setContentError] = useState(false);

  /* screen 11 */
  const [questions, setQuestions] = useState<JourneyQuestion[] | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textAnswer, setTextAnswer] = useState("");

  /* screen 13 */
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [revealPending, setRevealPending] = useState(false);
  const [revealSlow, setRevealSlow] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  /* loop safety valve — kept from the previous journey */
  const [visits, setVisits] = useState(0);
  useEffect(() => {
    try {
      const k = "aura_onboarding_visits";
      const n = Number(sessionStorage.getItem(k) || "0") + 1;
      sessionStorage.setItem(k, String(n));
      setVisits(n);
    } catch { /* ignore */ }
  }, []);

  /* ── progress: a closed tab loses nothing ── */
  const persistScreen = useCallback(async (next: number) => {
    if (!userId) return;
    try { localStorage.setItem(`aura_ob_screen_${userId}`, String(next)); } catch { /* ignore */ }
    try {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("identity_intelligence").eq("user_id", userId).maybeSingle();
      const ii = ((data as any)?.identity_intelligence as Record<string, any>) || {};
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({
          identity_intelligence: { ...ii, journey_screen: next },
          onboarding_step: Math.min(3, Math.max(0, Math.floor(next / 4))),
        })
        .eq("user_id", userId);
    } catch (e) { console.warn("[journey] progress save failed", e); }
  }, [userId]);

  const go = useCallback((next: number) => {
    setScreen(next);
    void track("onboarding_step", { step: `screen_${next}`, step_index: next });
    void persistScreen(next);
    try { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); } catch { /* ignore */ }
  }, [persistScreen]);

  /* ── boot ── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth", { replace: true }); return; }
      const uid = session.user.id;
      setUserId(uid);
      setUserEmail(session.user.email ?? null);

      const passwordSet = Boolean((session.user.user_metadata as any)?.password_set);
      let confirmed = false;
      try { confirmed = sessionStorage.getItem(`aura_identity_confirmed_${uid}`) === "true"; } catch { /* ignore */ }
      if (!passwordSet && !confirmed) setNeedsIdentityConfirm(true);
      else if (!passwordSet) setNeedsPassword(true);

      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("first_name, last_name, firm, sector_focus, seniority_band, onboarding_step, skill_ratings, identity_intelligence")
        .eq("user_id", uid)
        .maybeSingle();
      const p: any = profile || {};

      if (Number(p.onboarding_step ?? 0) >= 4) {
        navigate("/home", { replace: true });
        return;
      }
      if (p.first_name) setFirstName(p.first_name);
      if (p.last_name) setLastName(p.last_name);
      if (p.firm) setFirm(p.firm);
      if (p.sector_focus) { setSector(p.sector_focus); setSectorKnown(true); }
      if (p.seniority_band) setBand(p.seniority_band as Band);
      if (p.skill_ratings && typeof p.skill_ratings === "object") setScores(p.skill_ratings as Record<string, number>);

      let resume = Number((p.identity_intelligence as any)?.journey_screen ?? 0);
      try {
        const local = Number(localStorage.getItem(`aura_ob_screen_${uid}`) ?? "0");
        if (local > resume) resume = local;
      } catch { /* ignore */ }
      if (resume > 0 && resume < 13) setScreen(resume);

      setChecking(false);
    })();
  }, [navigate]);

  /* ── screen 1: read the profile ── */
  const readProfile = async () => {
    setLiError("");
    setReadDone(false);
    setPostsRead(null);
    setOwnWords(null);
    const profile_url = normaliseLinkedIn(liInput);
    if (!profile_url) {
      setLiError("Aura couldn't open that page. Check it matches what you see in your browser on your own profile.");
      return;
    }
    setLiBusy(true);
    go(2);
    try {
      if (userId) { try { await saveLinkedInAddress(userId, profile_url); } catch { /* saved again later */ } }
      const { data, error } = await supabase.functions.invoke("linkedin-fetch-profile", { body: { profile_url } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      const prof: any = (data as any)?.profile ?? data;
      setLiProfile(prof);

      const readSector = String(prof?.sector || prof?.industry || "").trim();
      if (!sector && readSector) { setSector(readSector); setSectorKnown(true); }

      if (userId) {
        try {
          await supabase.from("linkedin_connections").update({ source_status: "verified_by_read" }).eq("user_id", userId);
        } catch { /* never block */ }
      }

      const full = String(prof?.full_name || "").trim();
      if (full && !firstName.trim()) {
        const parts = full.split(/\s+/);
        setFirstName(parts[0] || "");
        if (parts.length > 1) setLastName(parts.slice(1).join(" "));
      }

      /* the level comes from the headline, and it is written down as detected */
      const headline = String(prof?.headline || "");
      if (headline) {
        try {
          const { data: detected } = await (supabase.rpc as any)("detect_seniority_band", { headline });
          const b = (detected as string | null) as Band | null;
          if (b && userId) {
            setBand(b);
            await (supabase.from("diagnostic_profiles" as any) as any)
              .update({ seniority_band: b, band_source: "detected" })
              .eq("user_id", userId);
          }
        } catch { /* the member confirms it on the next screen anyway */ }
      }

      const { data: postData } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url, max_posts: 50 },
      });
      const kept = typeof (postData as any)?.kept_own_text === "number" ? (postData as any).kept_own_text : 0;
      setPostsRead(kept);
      if (userId) {
        const { data: rows } = await supabase
          .from("linkedin_posts").select("post_text").eq("user_id", userId).limit(200);
        setOwnWords(wordsIn((rows as any[]) || []));
      } else {
        setOwnWords(0);
      }
      setReadDone(true);
    } catch (e: any) {
      const msg = typeof e?.message === "string" && e.message ? e.message.split("\n")[0] : "";
      setLiError(msg && msg.length < 120
        ? "Aura couldn't open that page. Check it matches what you see in your browser on your own profile."
        : "Aura couldn't open that page. Check it matches what you see in your browser on your own profile.");
      go(1);
    } finally {
      setLiBusy(false);
    }
  };

  /* ── screen 2: every line resolves on its own and shows itself finishing ── */
  const upPosts = useCountUp(screen === 2 && postsRead ? postsRead : 0, { duration: 900 });
  const upWords = useCountUp(screen === 2 && ownWords ? ownWords : 0, { duration: 1100 });

  /* ── the suggested read: asked for on screen 4 so it has a head start ── */
  const suggestRan = useRef(false);
  useEffect(() => {
    if (screen < 4 || suggestRan.current) return;
    suggestRan.current = true;
    let settled = false;
    // A promise left hanging on screen is worse than no promise at all.
    const giveUp = window.setTimeout(() => { if (!settled) { settled = true; setSuggestDead(true); } }, 15000);
    supabase.functions.invoke("onboarding-find-article", {
      body: {
        sector_focus: sector || null,
        core_practice: String(liProfile?.headline || "").trim() || null,
        headline: String(liProfile?.headline || "").trim() || null,
        firm,
        level: band ? BAND_TO_LEVEL[band] : "",
      },
    }).then(({ data }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(giveUp);
      if ((data as any)?.found && (data as any)?.article) setSuggested((data as any).article);
      else setSuggestDead(true);
    }).catch(() => {
      if (settled) return;
      settled = true;
      window.clearTimeout(giveUp);
      setSuggestDead(true);
    });
  }, [screen, sector, firm, band, liProfile]);

  /* ── screen 5/6: send the link, then watch for what came out of it ── */
  const sendLink = async (url: string, meta?: { title?: string; summary?: string }) => {
    const v = url.trim();
    if (!v) return;
    const startIso = new Date(Date.now() - 10000).toISOString();
    setReadStep(0);
    go(6);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 25000);
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: "link", content: v, source_url: v,
              metadata: { title: meta?.title, summary: meta?.summary, source: "onboarding_collection" },
            }),
            signal: ctrl.signal,
          });
        } finally { window.clearTimeout(to); }
      }
    } catch { /* a slow read never blocks the journey */ }
    setReadStep(1);
    void watchForClaims(startIso);
  };

  const watchForClaims = async (startIso: string) => {
    if (!userId) return;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      try {
        const { data: reg } = await (supabase.from("source_registry" as any) as any)
          .select("id").eq("user_id", userId).gte("created_at", startIso)
          .order("created_at", { ascending: false }).limit(1);
        const rid = reg?.[0]?.id;
        if (rid) {
          const { data: frags } = await (supabase.from("evidence_fragments" as any) as any)
            .select("title, content, confidence")
            .eq("source_registry_id", rid)
            .order("confidence", { ascending: false })
            .limit(3);
          if (frags && frags.length > 0) {
            setClaims(frags as Claim[]);
            setReadStep(2);
            window.setTimeout(() => { setReadStep(3); go(7); }, 600);
            return;
          }
        }
      } catch { /* keep watching */ }
      await new Promise((r) => window.setTimeout(r, 1800));
    }
    setClaimsSlow(true);
  };

  /* ── content resolution: exact, then the sector-free set, then a retry ── */
  const loadDimensions = useCallback(async () => {
    if (!band) return;
    setContentError(false);
    try {
      const base = () => (supabase.from("capability_dimensions" as any) as any)
        .select("name, why_line, anchor_low, anchor_high")
        .eq("band", band).eq("active", true).order("position");
      let rows: any[] = [];
      if (sector) {
        const { data } = await base().eq("sector", sector);
        rows = data || [];
      }
      if (rows.length === 0) {
        const { data } = await base().is("sector", null);
        rows = data || [];
      }
      if (rows.length === 0) { setContentError(true); return; }
      setDims(rows.slice(0, 8) as Dimension[]);
    } catch { setContentError(true); }
  }, [band, sector]);

  const loadQuestions = useCallback(async () => {
    if (!band) return;
    setContentError(false);
    try {
      const base = () => (supabase.from("onboarding_questions" as any) as any)
        .select("prompt, helper, kind, options")
        .eq("band", band).eq("active", true).order("position");
      let rows: any[] = [];
      if (sector) {
        const { data } = await base().eq("sector", sector);
        rows = data || [];
      }
      if (rows.length === 0) {
        const { data } = await base().is("sector", null);
        rows = data || [];
      }
      if (rows.length === 0) { setContentError(true); return; }
      setQuestions(rows.slice(0, 6) as JourneyQuestion[]);
    } catch { setContentError(true); }
  }, [band, sector]);

  useEffect(() => { if (screen === 8 || screen === 9) void loadDimensions(); }, [screen, loadDimensions]);
  useEffect(() => { if (screen === 10 || screen === 11) void loadQuestions(); }, [screen, loadQuestions]);

  /* ── autosave after every slider ── */
  const saveScores = useCallback(async (next: Record<string, number>) => {
    if (!userId) return;
    try {
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({
          skill_ratings: next, audit_results: next,
          audit_completed_at: new Date().toISOString(), audit_method: "self_read",
        })
        .eq("user_id", userId);
    } catch (e) { console.warn("[journey] slider save failed", e); }
  }, [userId]);

  const setScore = (name: string, value: number) => {
    setScores((prev) => {
      const next = { ...prev, [name]: value };
      void saveScores(next);
      return next;
    });
  };

  /* ── the six questions, then the read ── */
  const finishQuestions = async (finalAnswers: Record<string, string>) => {
    setRevealPending(true);
    go(12);
    if (!userId) return;
    await saveAnswers(userId, finalAnswers);
    const results = await generateMarketRead(userId, finalAnswers, sector || null, band);
    const figures = [
      { value: String(postsRead || claims.length), label: postsRead ? "posts read" : "claims kept" },
      { value: String(Object.keys(scores).length), label: "strengths on record" },
    ];
    setReveal(toRevealData(results, { figures, excludeSoft: (dims || []).map((d) => d.name) }));
    setRevealPending(false);
  };

  /* if they come back later, show whatever read is already on file */
  useEffect(() => {
    if (screen !== 12 || !revealPending) { return; }
    // Never trap the member on the last screen.
    const t = window.setTimeout(() => setRevealSlow(true), 20000);
    return () => window.clearTimeout(t);
  }, [screen, revealPending]);

  useEffect(() => {
    if (screen !== 13 || reveal || !userId) return;
    loadMarketRead(userId).then((r) => {
      const d = toRevealData(r, {
        figures: [
          { value: String(postsRead || claims.length), label: postsRead ? "posts read" : "claims kept" },
          { value: String(Object.keys(scores).length), label: "strengths on record" },
        ],
        excludeSoft: (dims || []).map((x) => x.name),
      });
      if (d) setReveal(d);
    });
  }, [screen, reveal, userId, postsRead, claims.length, scores, dims]);

  /* ── finishing ── */
  const finish = async () => {
    if (userId) {
      try {
        await (supabase.from("diagnostic_profiles" as any) as any).upsert({
          user_id: userId,
          first_name: firstName.trim() || "Member",
          last_name: lastName.trim() || null,
          firm: firm.trim() || null,
          sector_focus: sector || null,
          level: band ? BAND_TO_LEVEL[band] : null,
          onboarding_completed: true,
          onboarding_step: 4,
          completed: true,
        }, { onConflict: "user_id" });
      } catch (e) { console.warn("[journey] finish save failed", e); }
      try { localStorage.removeItem(`aura_ob_screen_${userId}`); } catch { /* ignore */ }
    }
    try { localStorage.setItem("aura_onboarding_complete", "true"); } catch { /* ignore */ }
    try { sessionStorage.removeItem("aura_onboarding_visits"); } catch { /* ignore */ }
    supabase.functions.invoke("compute-imprint", { body: {} }).catch(() => {});
    navigate("/home", { replace: true });
  };

  const connectLinkedIn = async () => {
    setConnecting(true);
    setConnectNote("");
    try {
      // LinkedIn only accepts the live origin as a redirect target.
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "get-auth-url", origin: "https://www.aura-intel.org" },
      });
      if (error) throw error;
      const url = (data as any)?.url || (data as any)?.authUrl;
      if (url) { window.location.href = url; return; }
      throw new Error("no url");
    } catch {
      setConnectNote("LinkedIn connection only works on aura-intel.org — you can do this from Settings after you're in.");
      setConnecting(false);
    }
  };

  /* ── escape hatch, unchanged in spirit ── */
  const escape = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase.from("diagnostic_profiles" as any) as any).upsert({
          user_id: user.id,
          first_name: (user.user_metadata as any)?.first_name || user.email?.split("@")[0] || "Member",
          onboarding_completed: true, onboarding_step: 4, completed: true,
        }, { onConflict: "user_id" });
      }
      sessionStorage.removeItem("aura_onboarding_visits");
    } catch { /* ignore */ }
    navigate("/home", { replace: true });
  };

  const escapeFooter = visits >= 3 ? (
    <div style={{ textAlign: "center", marginBlockStart: 16 }}>
      <button type="button" onClick={escape} style={{
        background: "none", border: "none", color: OB.muted, fontSize: 12,
        cursor: "pointer", textDecoration: "underline", fontFamily: "inherit",
      }}>Skip this and take me in →</button>
    </div>
  ) : null;

  const bandLabel = band ? BAND_LABEL[band] : null;
  const shelfUnlocked = useMemo(() => ({
    profile: screen > 3,
    claims: screen > 7,
    strengths: screen > 9 || (dims ? Object.keys(scores).length >= dims.length : false),
    subjects: screen >= 12,
  }), [screen, dims, scores]);

  /* ───────────────────────── password & identity ───────────────────────── */

  const confirmIdentityYes = () => {
    try { if (userId) sessionStorage.setItem(`aura_identity_confirmed_${userId}`, "true"); } catch { /* ignore */ }
    setNeedsIdentityConfirm(false);
    setNeedsPassword(true);
  };

  const confirmIdentityNo = async () => {
    setSigningOut(true);
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    navigate("/auth", { replace: true });
  };

  const handleSetPassword = async () => {
    if (!pwd || pwd.length < 8) { toast.error("Use at least 8 characters"); return; }
    if (pwd !== pwdConfirm) { toast.error("Those two don't match"); return; }
    setSettingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) { toast.error(error.message || "Couldn't set that password"); setSettingPwd(false); return; }
      const { data: { user: verified } } = await supabase.auth.getUser();
      if (!verified) { toast.error("Please try that once more."); setSettingPwd(false); return; }
      await supabase.auth.updateUser({ data: { password_set: true } }).catch(() => {});
      supabase.functions.invoke("send-account-notification", {
        body: { type: "password_set", email: verified.email, first_name: null },
      }).catch(() => {});
      setNeedsPassword(false);
      setPwd(""); setPwdConfirm("");
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong. Try that once more.");
    } finally {
      setSettingPwd(false);
    }
  };

  if (checking) {
    return (
      <div className="obc" style={{ minBlockSize: "100dvh", background: OB.night, display: "grid", placeItems: "center" }}>
        <style>{PAGE_CSS}</style>
        <Loader2 size={20} className="animate-spin" style={{ color: OB.blue }} />
      </div>
    );
  }

  if (needsIdentityConfirm) {
    return (
      <>
        <style>{PAGE_CSS}</style>
        <PaperShell bead={0} cream footer={escapeFooter}>
          <h1 style={h1Light}>Is this you?</h1>
          <p style={{ ...bodyLight, fontFamily: OB.mono, fontSize: 14, color: OB.ink, wordBreak: "break-all" }}>
            {userEmail || "—"}
          </p>
          <p style={bodyLight}>Your invitation went to that address. Confirm it before anything is saved to your name.</p>
          <button type="button" onClick={confirmIdentityYes} style={{ ...btnPrimary, marginBlockStart: 22 }}>
            Yes, that's me <ArrowRight size={16} />
          </button>
          <button type="button" onClick={confirmIdentityNo} disabled={signingOut} style={btnGhostLight}>
            {signingOut ? "Signing out…" : "No, this isn't mine"}
          </button>
        </PaperShell>
      </>
    );
  }

  if (needsPassword) {
    const checks = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pwd),
      match: pwd.length > 0 && pwdConfirm.length > 0 && pwd === pwdConfirm,
    };
    const allValid = Object.values(checks).every(Boolean);
    const list: { key: keyof typeof checks; label: string }[] = [
      { key: "length", label: "At least 8 characters" },
      { key: "uppercase", label: "One capital letter" },
      { key: "lowercase", label: "One small letter" },
      { key: "number", label: "One number" },
      { key: "special", label: "One symbol" },
      { key: "match", label: "Both match" },
    ];
    const pwdField: React.CSSProperties = { ...fieldStyle, paddingInlineEnd: 44 };
    return (
      <>
        <style>{PAGE_CSS}</style>
        <PaperShell bead={0} cream footer={escapeFooter}>
          <h1 style={h1Light}>Set your password.</h1>
          <p style={bodyLight}>One password, then the shelf.</p>
          <div style={{ position: "relative", marginBlockStart: 18 }}>
            <input type={pwdShow ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)}
              placeholder="Create a password" style={pwdField} autoComplete="new-password" />
            <button type="button" onClick={() => setPwdShow((s) => !s)}
              aria-label={pwdShow ? "Hide password" : "Show password"}
              style={{
                position: "absolute", insetInlineEnd: 10, insetBlockStart: "50%", transform: "translateY(-50%)",
                background: "transparent", border: 0, cursor: "pointer", color: OB.muted, padding: 4,
              }}>{pwdShow ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <input type={pwdShow ? "text" : "password"} value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)}
            placeholder="Type it again" style={{ ...fieldStyle, marginBlockStart: 10 }} autoComplete="new-password"
            onKeyDown={(e) => { if (e.key === "Enter" && allValid) void handleSetPassword(); }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "14px 0 18px" }}>
            {list.map(({ key, label }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                {checks[key]
                  ? <Check size={14} style={{ color: "#12805C" }} />
                  : <span style={{ inlineSize: 14, blockSize: 14, borderRadius: 999, border: `1.5px solid ${OB.line}` }} />}
                <span style={{ color: checks[key] ? OB.ink : OB.muted }}>{label}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleSetPassword} disabled={!allValid || settingPwd}
            style={{ ...btnPrimary, opacity: !allValid || settingPwd ? 0.5 : 1 }}>
            {settingPwd ? <Loader2 size={16} className="animate-spin" /> : null} Set it and start
          </button>
        </PaperShell>
      </>
    );
  }

  /* ─────────────────────────── the fourteen screens ─────────────────────── */

  const retryPanel = (retry: () => void) => (
    <>
      <h1 style={h1Night}>Give that one more go.</h1>
      <p style={bodyNight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
      <button type="button" onClick={retry} style={{ ...btnPrimary, marginBlockStart: 22 }}>Try again</button>
    </>
  );

  let content: React.ReactNode = null;

  /* 0 — CREAM */
  if (screen === 0) {
    content = (
      <PaperShell bead={0} cream footer={escapeFooter}>
        <h1 style={h1Light}>Let's fill this up.</h1>
        <p style={bodyLight}>
          Five short steps, and each one gives you something. In five minutes this shelf is yours — and Aura knows
          how to write the way you already think.
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "26px 0 6px" }}>
          {SHELF.map((s) => <ShelfBadge key={s.key} label={s.label} tone={s.tone} />)}
        </div>
        <button type="button" onClick={() => go(1)} style={{ ...btnPrimary, marginBlockStart: 22 }}>Start</button>
        <p style={footnote}>Nothing gets posted. Ever, unless you press it.</p>
      </PaperShell>
    );
  }

  /* 1 — WHITE, the address */
  if (screen === 1) {
    content = (
      <PaperShell bead={0} footer={escapeFooter}>
        <h1 style={h1Light}>What's your LinkedIn?</h1>
        <p style={bodyLight}>
          Aura reads what's already public — your profile and your recent posts. That's how it learns your sector,
          your level, and the way you already write.
        </p>
        <input
          value={liInput}
          onChange={(e) => { setLiInput(e.target.value); setLiError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && liInput.trim()) void readProfile(); }}
          placeholder="linkedin.com/in/yourname"
          inputMode="url"
          style={{ ...fieldStyle, marginBlockStart: 20 }}
        />
        {liError ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.err }}>{liError}</p>
        ) : null}
        <button type="button" onClick={readProfile} disabled={liBusy || !liInput.trim()}
          style={{ ...btnPrimary, marginBlockStart: 16, opacity: liBusy || !liInput.trim() ? 0.5 : 1 }}>
          {liBusy ? <Loader2 size={16} className="animate-spin" /> : null} Read my profile
        </button>
        <button type="button" onClick={() => go(MANUAL_SCREEN)} style={btnGhostLight}>
          I'd rather type it in myself
        </button>
        <p style={footnote}>Aura only reads. It never posts.</p>
      </PaperShell>
    );
  }

  /* 2 — NIGHT, reading you */
  if (screen === 2) {
    // A row never shows a zero and never shows a non-answer: it either
    // resolves to something real or it is dropped once the read is done.
    const mono = (v: React.ReactNode) => <span style={{ fontFamily: OB.mono, fontWeight: 600 }}>{v}</span>;
    const rows: { key: string; label: string; line: React.ReactNode; done: boolean; drop: boolean }[] = [
      { key: "p", label: "Posts", line: <>{mono(upPosts)} posts read</>, done: !!postsRead, drop: readDone && !postsRead },
      { key: "w", label: "Your own writing", line: <>{mono(upWords)} words of your own writing</>, done: !!ownWords, drop: readDone && !ownWords },
      { key: "s", label: "Sector", line: <>Sector · {mono(sector)}</>, done: !!sector, drop: readDone && !sector },
      { key: "b", label: "Level", line: <>Level · {mono(bandLabel)}</>, done: !!bandLabel, drop: readDone && !bandLabel },
    ].filter((r) => !r.drop);
    const allLanded = readDone && rows.every((r) => r.done);
    content = (
      <NightShell face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Reading you.</h1>
        <div style={{ marginBlockStart: 26, display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <StatusRow key={r.key} label={r.label} done={r.done}>{r.line}</StatusRow>
          ))}
        </div>
        <button type="button" onClick={() => go(3)} disabled={!allLanded}
          style={{ ...btnPrimary, marginBlockStart: 24, opacity: allLanded ? 1 : 0.5 }}>
          {allLanded ? null : <Loader2 size={16} className="animate-spin" />}
          {allLanded ? "See what I found" : "Reading…"}
        </button>
      </NightShell>
    );
  }

  /* 3 — WHITE, what Aura can see */
  if (screen === 3) {
    const figures = [
      { v: postsRead ?? 0, l: "posts read" },
      { v: liProfile?.followers ?? 0, l: "following you" },
      { v: liProfile?.skills_count ?? 0, l: "skills on record" },
    ];
    // The read succeeded, so the firm, sector and level all come from it.
    // There is no separate page after this one.
    const nextFromHere = () => go(4);
    content = (
      <PaperShell bead={1} footer={escapeFooter}>
        <h1 style={h1Light}>This is what Aura can see.</h1>
        <div style={{ display: "flex", gap: 13, alignItems: "center", marginBlockStart: 20 }}>
          {liProfile?.photo_url ? (
            <img src={liProfile.photo_url} alt={`${liProfile?.full_name || "Your"} LinkedIn photo`} loading="lazy"
              style={{ inlineSize: 56, blockSize: 56, borderRadius: "50%", objectFit: "cover", border: `1px solid ${OB.line}` }} />
          ) : null}
          <div style={{ minInlineSize: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{liProfile?.full_name || `${firstName} ${lastName}`.trim() || "You"}</p>
            {liProfile?.headline ? (
              <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.5, color: OB.muted }}>{liProfile.headline}</p>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginBlockStart: 20 }}>
          {figures.map((f) => (
            <div key={f.l}>
              <div style={{ fontFamily: OB.mono, fontSize: 22, fontWeight: 600, color: OB.ink }}>{f.v}</div>
              <div style={{ fontSize: 11.5, color: OB.muted, marginBlockStart: 4 }}>{f.l}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginBlockStart: 20, padding: "13px 15px", borderRadius: RADIUS.card,
          background: OB.canvas, border: `1px solid ${OB.line}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 14 }}>Level · <strong>{bandLabel || "not set"}</strong></span>
            <button type="button" onClick={() => setBandPicker((v) => !v)} style={{
              border: `1px solid ${OB.blue}`, background: OB.white, color: OB.blue,
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              padding: "8px 16px", borderRadius: 999, flexShrink: 0,
            }}>{bandPicker ? "Close" : "Change"}</button>
          </div>
          {bandPicker && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBlockStart: 12 }}>
              {(Object.keys(BAND_LABEL) as Band[]).map((b) => (
                <button key={b} type="button" onClick={async () => {
                  setBand(b); setBandPicker(false); setDims(null);
                  if (userId) {
                    await (supabase.from("diagnostic_profiles" as any) as any)
                      .update({ seniority_band: b, band_source: "corrected" }).eq("user_id", userId);
                  }
                }} style={{
                  textAlign: "start", padding: "11px 13px", borderRadius: 12, cursor: "pointer",
                  border: `1px solid ${band === b ? OB.blue : OB.line}`,
                  background: band === b ? OB.blueTint : OB.white, fontSize: 14, fontFamily: "inherit", color: OB.ink,
                }}>{BAND_LABEL[b]}</button>
              ))}
            </div>
          )}
          {!sector && (
            <div style={{ marginBlockStart: 12 }}>
              <label htmlFor="ob-sector" style={{ fontSize: 12.5, color: OB.muted }}>Aura couldn't tell your sector — pick it once.</label>
              <select id="ob-sector" value={sector} onChange={async (e) => {
                const v = e.target.value;
                setSector(v);
                setSectorKnown(!!v);
                if (userId && v) {
                  await (supabase.from("diagnostic_profiles" as any) as any)
                    .update({ sector_focus: v }).eq("user_id", userId);
                }
              }} style={{ ...fieldStyle, marginBlockStart: 8 }}>
                <option value="">Your sector</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "24px 0 4px" }}>
          {SHELF.map((s, i) => (
            <ShelfBadge key={s.key} label={s.label} tone={s.tone}
              unlocked={i === 0}
              figure={i === 0 ? (postsRead || "✓") : undefined} />
          ))}
        </div>

        <button type="button" onClick={nextFromHere} style={{ ...btnPrimary, marginBlockStart: 18 }}>That's me</button>
      </PaperShell>
    );
  }

  /* 15 — WHITE, only when the read failed or was skipped */
  if (screen === MANUAL_SCREEN) {
    const ready = !!firstName.trim() && !!firm.trim() && !!sector && !!band;
    content = (
      <PaperShell bead={1} footer={escapeFooter}>
        <h1 style={h1Light}>Aura couldn't read it — tell it the basics.</h1>
        <p style={bodyLight}>Four things, and Aura works from these until you point it at your profile.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBlockStart: 20 }}>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={fieldStyle} />
          <input value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Where you work" style={fieldStyle} />
          <select value={sector} onChange={(e) => setSector(e.target.value)} style={fieldStyle}>
            <option value="">Your sector</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(Object.keys(BAND_LABEL) as Band[]).map((b) => (
            <button key={b} type="button" onClick={() => setBand(b)} style={{
              textAlign: "start", padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${band === b ? OB.blue : OB.line}`,
              background: band === b ? OB.blueTint : OB.white, fontSize: 14, fontFamily: "inherit", color: OB.ink,
            }}>{BAND_LABEL[b]}</button>
          ))}
        </div>
        <button type="button" disabled={!ready} onClick={async () => {
          if (userId) {
            await (supabase.from("diagnostic_profiles" as any) as any).upsert({
              user_id: userId, first_name: firstName.trim(), last_name: lastName.trim() || null,
              firm: firm.trim(), sector_focus: sector, level: band ? BAND_TO_LEVEL[band] : null,
              seniority_band: band, band_source: "corrected",
            }, { onConflict: "user_id" });
          }
          go(4);
        }} style={{ ...btnPrimary, marginBlockStart: 20, opacity: ready ? 1 : 0.5 }}>
          Save and carry on
        </button>
      </PaperShell>
    );
  }

  /* 4 — NIGHT */
  if (screen === 4) {
    content = (
      <NightShell face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>I know who you are. Now I need what you notice.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Your profile says what you've done. It doesn't say what you think. One link is enough to start.
        </p>
        <button type="button" onClick={() => go(5)} style={{ ...btnPrimary, marginBlockStart: 26 }}>Okay</button>
      </NightShell>
    );
  }

  /* 5 — WHITE, the first link */
  if (screen === 5) {
    content = (
      <PaperShell bead={2} footer={escapeFooter}>
        <h1 style={h1Light}>Something you read this week.</h1>
        <p style={bodyLight}>
          An article, a report, a post you disagreed with. Aura reads it and shows you what it found.
        </p>
        <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && linkInput.trim()) void sendLink(linkInput); }}
          placeholder="Paste a link" inputMode="url" style={{ ...fieldStyle, marginBlockStart: 20 }} />
        <button type="button" disabled={!linkInput.trim()} onClick={() => sendLink(linkInput)}
          style={{ ...btnPrimary, marginBlockStart: 14, opacity: linkInput.trim() ? 1 : 0.5 }}>Add it</button>

        {suggested || !suggestDead ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 16px" }}>
            <span style={{ blockSize: 1, background: OB.line, flex: 1 }} />
            <span style={{ fontSize: 11.5, color: OB.muted }}>Nothing to hand?</span>
            <span style={{ blockSize: 1, background: OB.line, flex: 1 }} />
          </div>
        ) : null}

        {suggested ? (
          <div style={{ border: `1px solid ${OB.line}`, borderRadius: RADIUS.card, padding: 15, background: OB.canvas }}>
            <p style={{ margin: 0, fontSize: 11.5, color: OB.muted }}>
              Aura found this while it was reading your profile. From your sector.
            </p>
            <p style={{ margin: "9px 0 0", fontSize: 14.5, fontWeight: 700, lineHeight: 1.4 }}>{suggested.title}</p>
            {suggested.summary ? (
              <p style={{
                margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted,
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>{suggested.summary}</p>
            ) : null}
            <button type="button" onClick={() => sendLink(suggested.url, { title: suggested.title, summary: suggested.summary })}
              style={btnGhostLight}>Use this one</button>
          </div>
        ) : !suggestDead ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: OB.muted }}>
            <Loader2 size={14} className="animate-spin" /> Looking for one from your sector…
          </div>
        ) : null}
      </PaperShell>
    );
  }

  /* 6 — NIGHT, reading it */
  if (screen === 6) {
    const steps = [
      { key: "a", label: "Article fetched", done: readStep >= 1 },
      { key: "b", label: "Claims pulled", done: readStep >= 2 || claims.length > 0 },
      { key: "c", label: "Matched to your sector", done: readStep >= 3 },
    ];
    content = (
      <NightShell face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Reading it.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>Pulling out the bits worth keeping…</p>
        <div style={{ marginBlockStart: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s) => (
            <StatusRow key={s.key} label={s.label} done={s.done}>{s.label}</StatusRow>
          ))}
        </div>
        {claimsSlow && (
          <>
            <p style={{ ...bodyNight, textAlign: "center" }}>Still reading — it'll be waiting on your Home.</p>
            <button type="button" onClick={() => go(8)} style={{ ...btnPrimary, marginBlockStart: 20 }}>Keep going</button>
          </>
        )}
      </NightShell>
    );
  }

  /* 7 — NIGHT, three claims */
  if (screen === 7) {
    content = (
      <NightShell footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Three claims, and they're yours.</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBlockStart: 24 }}>
          {claims.slice(0, 3).map((c, i) => (
            <ClaimCard key={`${c.title}-${i}`} index={i} title={c.title} content={c.content} />
          ))}
        </div>
        <p style={{ ...bodyNight, textAlign: "center", marginBlockStart: 22 }}>
          Aura will watch what moves these while you sleep.
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "22px 0 4px" }}>
          {SHELF.map((s, i) => (
            <ShelfBadge key={s.key} label={s.label} tone={s.tone} onNight
              unlocked={i <= 1}
              figure={i === 0 ? (postsRead || "✓") : i === 1 ? claims.length : undefined} />
          ))}
        </div>
        <button type="button" onClick={() => go(8)} style={{ ...btnPrimary, marginBlockStart: 18 }}>Nice — keep going</button>
      </NightShell>
    );
  }

  /* 8 — NIGHT, before the sliders */
  if (screen === 8) {
    const pickedLine = bandLabel && sector ? `Eight sliders. Under a minute. Picked for ${bandLabel} · ${sector}.` : null;
    content = (
      <NightShell face footer={escapeFooter}>
        {contentError ? retryPanel(() => void loadDimensions()) : (
          <>
            <h1 style={{ ...h1Night, textAlign: "center" }}>I've read you. Now I want your own read.</h1>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              This isn't a test and there's no score to beat. Aura compares what you say about yourself against what
              your posts actually show — and where those two disagree is the interesting part.
            </p>
            {pickedLine ? <p style={{ ...bodyNight, textAlign: "center" }}>{pickedLine}</p> : null}
            <button type="button" onClick={() => { setDimIdx(0); go(9); }} disabled={!dims}
              style={{ ...btnPrimary, marginBlockStart: 24, opacity: dims ? 1 : 0.5 }}>
              {dims ? "Okay" : <Loader2 size={16} className="animate-spin" />}
            </button>
          </>
        )}
      </NightShell>
    );
  }

  /* 9 — WHITE ×8, the sliders */
  if (screen === 9) {
    if (contentError || !dims) {
      content = (
        <PaperShell bead={3} footer={escapeFooter}>
          <h1 style={h1Light}>Give that one more go.</h1>
          <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
          <button type="button" onClick={() => void loadDimensions()} style={{ ...btnPrimary, marginBlockStart: 20 }}>Try again</button>
        </PaperShell>
      );
    } else {
      const d = dims[Math.min(dimIdx, dims.length - 1)];
      const value = scores[d.name] ?? 50;
      const last = dimIdx >= dims.length - 1;
      content = (
        <PaperShell bead={3} footer={escapeFooter}>
          <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            {dimIdx + 1} / {dims.length}
          </p>
          <h1 style={{ ...h1Light, marginBlockStart: 10, fontSize: "clamp(22px,6vw,28px)" }}>{d.name}</h1>
          {d.why_line ? <p style={bodyLight}>{d.why_line}</p> : null}
          <input
            type="range" min={0} max={100} step={1} value={value}
            aria-label={d.name}
            onChange={(e) => setScore(d.name, Number(e.target.value))}
            style={{ inlineSize: "100%", marginBlockStart: 26, accentColor: OB.blue }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBlockStart: 10 }}>
            <span style={{ fontSize: 11.5, color: OB.muted, maxInlineSize: "46%" }}>{d.anchor_low}</span>
            <span style={{ fontSize: 11.5, color: OB.muted, maxInlineSize: "46%", textAlign: "end" }}>{d.anchor_high}</span>
          </div>
          <button type="button" onClick={() => {
            if (!scores[d.name]) setScore(d.name, value);
            if (last) go(10); else setDimIdx((i) => i + 1);
          }} style={{ ...btnPrimary, marginBlockStart: 26 }}>
            {last ? "Done — that's all eight" : "Next"}
          </button>
          {last && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBlockStart: 22 }}>
              {SHELF.map((s, i) => (
                <ShelfBadge key={s.key} label={s.label} tone={s.tone}
                  unlocked={i <= 2}
                  figure={i === 0 ? (postsRead || "✓") : i === 1 ? claims.length : i === 2 ? dims.length : undefined} />
              ))}
            </div>
          )}
        </PaperShell>
      );
    }
  }

  /* 10 — NIGHT, before the six */
  if (screen === 10) {
    content = (
      <NightShell face footer={escapeFooter}>
        {contentError ? retryPanel(() => void loadQuestions()) : (
          <>
            <h1 style={{ ...h1Night, textAlign: "center" }}>This next bit is the part nobody else does.</h1>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              Aura won't write a word until it has this. A few questions about how you actually work — read together
              with the posts it just read, the claims you kept, and the sliders you moved.
            </p>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              What comes out isn't a personality type. It's the subjects you genuinely own, the space nobody near you
              has claimed, and where the ground is still soft.
            </p>
            <p style={{ ...bodyNight, textAlign: "center" }}>Six questions. Ninety seconds.</p>
            <button type="button" onClick={() => { setQIdx(0); go(11); }} disabled={!questions}
              style={{ ...btnPrimary, marginBlockStart: 24, opacity: questions ? 1 : 0.5 }}>
              {questions ? "Let's do it" : <Loader2 size={16} className="animate-spin" />}
            </button>
          </>
        )}
      </NightShell>
    );
  }

  /* 11 — WHITE ×6 */
  if (screen === 11) {
    if (contentError || !questions) {
      content = (
        <PaperShell bead={4} footer={escapeFooter}>
          <h1 style={h1Light}>Give that one more go.</h1>
          <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
          <button type="button" onClick={() => void loadQuestions()} style={{ ...btnPrimary, marginBlockStart: 20 }}>Try again</button>
        </PaperShell>
      );
    } else {
      const q = questions[Math.min(qIdx, questions.length - 1)];
      const last = qIdx >= questions.length - 1;
      const advance = (value: string) => {
        const next = { ...answers, [`Q${qIdx + 1} ${q.prompt}`]: value };
        setAnswers(next);
        setTextAnswer("");
        if (userId) void saveAnswers(userId, next);
        if (last) void finishQuestions(next); else setQIdx((i) => i + 1);
      };
      content = (
        <PaperShell bead={4} footer={escapeFooter}>
          <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            Question {qIdx + 1} of {questions.length}
          </p>
          <h1 style={{ ...h1Light, marginBlockStart: 10, fontSize: "clamp(21px,5.6vw,27px)" }}>{q.prompt}</h1>
          {q.helper ? <p style={bodyLight}>{q.helper}</p> : null}

          {q.kind === "choice" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 20 }}>
              {(q.options || []).map((o) => (
                <button key={o.value} type="button" onClick={() => advance(o.label)} style={{
                  textAlign: "start", padding: "14px 15px", borderRadius: 14, cursor: "pointer",
                  border: `1px solid ${OB.line}`, background: OB.white, fontSize: 14.5,
                  lineHeight: 1.45, fontFamily: "inherit", color: OB.ink,
                  transition: `border-color 220ms ${EASE}, background 220ms ${EASE}`,
                }}>{o.label}</button>
              ))}
            </div>
          ) : (
            <>
              <input value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && textAnswer.trim()) advance(textAnswer.trim()); }}
                placeholder="One line, your words" style={{ ...fieldStyle, marginBlockStart: 20 }} />
              <button type="button" disabled={!textAnswer.trim()} onClick={() => advance(textAnswer.trim())}
                style={{ ...btnPrimary, marginBlockStart: 16, opacity: textAnswer.trim() ? 1 : 0.5 }}>Next</button>
            </>
          )}
        </PaperShell>
      );
    }
  }

  /* 12 — NIGHT, the one confetti in the whole journey */
  if (screen === 12) {
    content = (
      <NightShell footer={escapeFooter}>
        <Confetti />
        <h1 style={{ ...h1Night, textAlign: "center" }}>You've got a shelf.</h1>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "26px 0 6px" }}>
          {SHELF.map((s, i) => (
            <ShelfBadge key={s.key} label={s.label} tone={s.tone} onNight unlocked
              figure={
                i === 0 ? (postsRead || "✓")
                  : i === 1 ? claims.length
                    : i === 2 ? Object.keys(scores).length
                      : (reveal?.subjects.length ?? 3)
              } />
          ))}
        </div>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Tonight Aura reads for your three subjects. Tomorrow morning there's something waiting — and every capture
          adds to the shelf.
        </p>
        <button type="button" onClick={() => go(13)} disabled={revealPending && !revealSlow}
          style={{ ...btnPrimary, marginBlockStart: 24, opacity: revealPending && !revealSlow ? 0.6 : 1 }}>
          {revealPending && !revealSlow ? <Loader2 size={16} className="animate-spin" /> : null}
          {!revealPending ? "See how people see me" : revealSlow ? "See what I have so far" : "Writing your read…"}
        </button>
      </NightShell>
    );
  }

  /* 13 — FULL-BLEED BLUE */
  if (screen === 13) {
    const shareFooter = { posts: postsRead ?? 0, saved: claims.length };
    const caption = suggestedCaption(postsRead ?? 0);
    content = (
      <div className="obc" style={{
        minBlockSize: "100dvh",
        background: `linear-gradient(170deg, ${OB.blue}, ${OB.blueLight} 55%, ${OB.cyan})`,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px",
      }}>
        <div className="obc-in" style={{ inlineSize: "100%", maxInlineSize: 460 }}>
          {reveal ? <RevealCard data={reveal} /> : (
            <div style={{ textAlign: "center", color: "#FFFFFF" }}>
              <p style={{ fontSize: 16, lineHeight: 1.6 }}>
                Aura is still writing your read. It'll be on your Home the moment it's done.
              </p>
            </div>
          )}
          {/* the same card, laid out for the exported image */}
          {reveal ? (
            <div style={{ position: "fixed", insetInlineStart: -10000, insetBlockStart: 0, pointerEvents: "none" }} aria-hidden>
              <RevealCard ref={shareRef} data={reveal} footer={shareFooter} forExport />
            </div>
          ) : null}
          <button type="button" disabled={!reveal || sharing} onClick={async () => {
            if (!shareRef.current) return;
            setSharing(true);
            try {
              const how = await shareRevealCard(shareRef.current, { caption });
              toast.success(how === "shared"
                ? "Sent to your share sheet."
                : "Image saved — the caption is on your clipboard, ready to paste.");
            } catch {
              toast.error("Couldn't build the image just now. Try once more.");
            } finally {
              setSharing(false);
            }
          }} style={{ ...btnPrimary, marginBlockStart: 20, background: OB.night, opacity: !reveal || sharing ? 0.6 : 1 }}>
            {sharing ? <Loader2 size={16} className="animate-spin" /> : null} Share this
          </button>
          <button type="button" onClick={() => go(14)} style={{
            ...btnGhostLight, color: "#FFFFFF", border: "1px solid rgba(255,255,255,.55)",
          }}>Take me in</button>
        </div>
      </div>
    );
  }

  /* 13b — NIGHT, and only after 13 */
  if (screen === 14) {
    content = (
      <NightShell face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>One last thing.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Connect LinkedIn and Aura can see what only you can see — how your posts actually performed. It learns
          which of your subjects your audience already rewards, and stops guessing.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 22 }}>
          {[
            ["Without it", "Aura writes from your captures"],
            ["With it", "Aura writes from what lands"],
          ].map(([k, v]) => (
            <div key={k} style={{
              background: OB.nightSoft, border: `1px solid ${OB.lineNight}`, borderRadius: RADIUS.card,
              padding: "12px 14px", fontSize: 13.5, color: "#FFFFFF",
            }}>
              <span style={{ color: OB.mutedNight }}>{k} · </span>{v}
            </div>
          ))}
        </div>
        <button type="button" onClick={connectLinkedIn} disabled={connecting} style={{ ...btnPrimary, marginBlockStart: 22 }}>
          {connecting ? <Loader2 size={16} className="animate-spin" /> : null} Connect LinkedIn
        </button>
        {connectNote ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.mutedNight }}>{connectNote}</p>
        ) : null}
        <button type="button" onClick={finish} style={btnGhostNight}>Not now</button>
        <p style={{ ...footnote, color: OB.mutedNight }}>Aura never posts. You press publish, every time.</p>
      </NightShell>
    );
  }

  return (
    <>
      <style>{PAGE_CSS}</style>
      {content}
    </>
  );
};

export default Onboarding;