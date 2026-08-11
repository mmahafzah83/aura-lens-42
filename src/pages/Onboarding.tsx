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
import { loadOwnSentence, type OwnSentence } from "@/lib/ownSentence";
import MethodNote from "@/components/onboarding/MethodNote";
import WaitProof from "@/components/onboarding/WaitProof";
import WorkProgress from "@/components/onboarding/WorkProgress";
import ReadCorrection from "@/components/onboarding/ReadCorrection";
import { loadProfileFacts, type ProfileFacts } from "@/lib/profileFacts";
import { loadPostProof, type PostProof } from "@/lib/postProof";
import { useSeniorityTitles, BAND_LABEL as TITLE_BAND_LABEL, type Band as TitleBand } from "@/lib/seniorityTitles";
import { OB, SPRING, EASE, RADIUS, reducedMotion } from "@/components/onboarding/tokens";
import { OBButton, Actions, BUTTON_CSS } from "@/components/onboarding/buttons";
import { smartPlaceholders } from "@/lib/smartPlaceholders";
import JourneyHeader from "@/components/onboarding/JourneyHeader";
import { num, cleanHeadline, memberText } from "@/lib/memberText";

/* ──────────────────────────────── tokens & copy ─────────────────────────── */

type Band = "work" | "table" | "room";

const BAND_LABEL: Record<Band, string> = {
  work: "Manager & lead",
  table: "Director & partner",
  room: "C-suite & board",
};

/** Only a last-resort label when the member never picked a title. */
const BAND_TO_LEVEL: Record<Band, string> = {
  work: "Manager",
  table: "Director",
  room: "C-Suite",
};

const SHELF: { key: string; label: string; tone: ShelfBadgeTone }[] = [
  { key: "profile", label: "Your profile", tone: "blue" },
  { key: "claims", label: "First subjects", tone: "cyan" },
  { key: "strengths", label: "Strengths", tone: "deep" },
  { key: "subjects", label: "Your subjects", tone: "amber" },
];

const SHELF_ICON = ["profile", "saved", "strengths", "subjects"] as const;
const SHELF_HINT = [
  "Unlocks when Aura has read your profile",
  "Unlocks when you save your first thing to read",
  "Unlocks when you've moved the sliders",
  "Unlocks when your read is written",
];

const MANUAL_SCREEN = 15;
/** Shown wherever a post or word count would otherwise read zero. */
const EMPTY_POSTS_LINE = "Nothing public yet — that's the point. Aura will build from what you save.";
/** The same truth, in the first person, because the dark screens are Aura speaking. */
const EMPTY_POSTS_LINE_NIGHT = "Nothing public yet — that's the point. I'll build from what you save.";
/** A short dark panel that sits between screen 8 and the sliders. */
const TRUST_SLIDERS_SCREEN = 8.5;

const PAGE_CSS = `
.obc{font-family:${OB.ui};-webkit-font-smoothing:antialiased;color:${OB.ink};
  --ob-max:420px;--ob-pad:clamp(22px,6vw,30px);--ob-h1:clamp(25px,7vw,30px);--ob-h2:clamp(21px,5.6vw,26px);
  --ob-body:15px;--ob-small:12.5px;--ob-mono:9.5px;--ob-btn:15px;--ob-anchor:11.5px;--ob-lh:1.65;--ob-face:96px;}
@media (min-width:768px){.obc{--ob-max:560px;}}
@media (min-width:1280px){.obc{
  --ob-max:680px;--ob-pad:44px;--ob-h1:34px;--ob-h2:30px;--ob-body:17px;--ob-small:14px;
  --ob-mono:11px;--ob-btn:16.5px;--ob-anchor:13.5px;--ob-lh:1.7;--ob-face:120px;}}
.obc *,.obc *::before,.obc *::after{box-sizing:border-box;}
.obc :focus-visible{outline:2px solid ${OB.blue};outline-offset:3px;border-radius:8px;}
@keyframes obc-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.obc-in{animation:obc-in 450ms ${SPRING} both;}
.obc-line{opacity:0;animation:obc-in 450ms ${SPRING} both;}
/* The slider measures a position, not an achievement — so the track never fills. */
.ob-slider{inline-size:100%;-webkit-appearance:none;appearance:none;background:transparent;}
.ob-slider::-webkit-slider-runnable-track{block-size:4px;border-radius:999px;background:${OB.line};}
.ob-slider::-moz-range-track{block-size:4px;border-radius:999px;background:${OB.line};}
.ob-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;inline-size:24px;block-size:24px;
  border-radius:999px;background:${OB.blue};border:2px solid #FFFFFF;box-shadow:0 2px 8px rgba(6,112,196,.35);margin-block-start:-10px;cursor:grab;}
.ob-slider::-moz-range-thumb{inline-size:24px;block-size:24px;border-radius:999px;background:${OB.blue};
  border:2px solid #FFFFFF;cursor:grab;}
/* Focus is a soft outer ring — never a second selection state. */
.ob-opt:focus-visible{outline:none;box-shadow:0 0 0 3px ${OB.blueTint};}
@media (prefers-reduced-motion:reduce){
  .obc-in,.obc-line{animation:none !important;opacity:1 !important;transform:none !important;}
}
${BUTTON_CSS}
`;

const fieldStyle: React.CSSProperties = {
  inlineSize: "100%", background: OB.canvas, border: `1px solid ${OB.line}`,
  color: OB.ink, fontSize: 15.5, fontFamily: "inherit", padding: "14px 16px",
  borderRadius: 12, outline: "none",
};

const h1Light: React.CSSProperties = {
  margin: 0, fontSize: "var(--ob-h1)", fontWeight: 800,
  letterSpacing: "-0.03em", lineHeight: 1.1, color: OB.ink,
};

const h1Night: React.CSSProperties = { ...h1Light, color: "#FFFFFF" };

const bodyLight: React.CSSProperties = {
  margin: "12px 0 0", fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", color: OB.muted,
};

const bodyNight: React.CSSProperties = { ...bodyLight, color: OB.mutedNight };

const footnote: React.CSSProperties = {
  margin: "14px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.muted, textAlign: "center",
};

/* ──────────────────────────────── helpers ───────────────────────────────── */

interface Dimension {
  name: string; why_line: string | null;
  anchor_low: string | null; anchor_mid: string | null; anchor_high: string | null;
}
interface JourneyQuestion {
  prompt: string; helper: string | null; kind: string; max_choices: number | null;
  options: { label: string; value: string }[] | null;
  why_asked: string | null; allow_none: boolean | null; randomise: boolean | null;
}

/** A stable shuffle — the same question never reshuffles under the member. */
const shuffled = <T,>(list: T[], seed: number): T[] => {
  const out = [...list];
  let s = seed * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
interface Claim { title: string; content?: string | null; confidence?: number | null }

const normaliseLinkedIn = (input: string): string | null => {
  const handle = canonicalHandle(input);
  return handle ? `https://www.linkedin.com/in/${handle}` : null;
};

const wordsIn = (rows: { post_text?: string | null }[]): number =>
  rows.reduce((n, r) => n + String(r.post_text || "").trim().split(/\s+/).filter(Boolean).length, 0);

/* ──────────────────────────────── shells ────────────────────────────────── */

const NightShell = ({ children, face, footer, onExit }: { children: React.ReactNode; face?: boolean; footer?: React.ReactNode; onExit?: () => void }) => (
  <div className="obc" style={{
    minBlockSize: "100dvh", background: OB.night, display: "flex", alignItems: "center",
    justifyContent: "center", padding: "28px 20px",
  }}>
    <div className="obc-in" style={{ inlineSize: "100%", maxInlineSize: "var(--ob-max)" }}>
      {onExit ? <JourneyHeader onNight onExit={onExit} /> : null}
      {face ? <div style={{ marginBlockEnd: 26 }}><AuraFace size="var(--ob-face)" /></div> : null}
      {children}
      {footer}
    </div>
  </div>
);

const PaperShell = ({
  children, bead, cream = false, footer, onExit,
}: { children: React.ReactNode; bead: number; cream?: boolean; footer?: React.ReactNode; onExit?: () => void }) => (
  <div className="obc" style={{
    minBlockSize: "100dvh", background: cream ? OB.cream : OB.canvas,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px",
  }}>
    <div style={{ inlineSize: "100%", maxInlineSize: "var(--ob-max)" }}>
      {onExit ? <JourneyHeader onExit={onExit} /> : null}
      <div style={{ display: "flex", justifyContent: "center", marginBlockEnd: 18 }}>
        <ProgressBeads active={bead} />
      </div>
      <div className="obc-in" style={{
        background: OB.white, borderRadius: RADIUS.hero, border: `1px solid ${OB.line}`,
        padding: "var(--ob-pad)", boxShadow: "0 30px 70px -50px rgba(15,21,25,.4)",
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
    description: "About ten minutes. Aura learns your sector, your level and the way you already write.",
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
  const [levelTitle, setLevelTitle] = useState("");
  const { titles: seniorityTitles, failed: titlesFailed, reload: reloadTitles } = useSeniorityTitles();

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
  const [flatWarn, setFlatWarn] = useState(false);
  const [flatAck, setFlatAck] = useState(false);

  /* screen 11 */
  const [questions, setQuestions] = useState<JourneyQuestion[] | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textAnswer, setTextAnswer] = useState("");
  const [multiPicked, setMultiPicked] = useState<string[]>([]);
  const [proposals, setProposals] = useState<{ label: string; why: string }[] | null>(null);
  const [proposalsDead, setProposalsDead] = useState(false);

  /* the member's own figures — used to fill every wait */
  const [proof, setProof] = useState<PostProof | null>(null);
  /* one verbatim sentence of their own, shown back to them on the confirm screen */
  const [ownLine, setOwnLine] = useState<OwnSentence | null>(null);
  const [facts, setFacts] = useState<ProfileFacts | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);

  /* screen 13 */
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [revealPending, setRevealPending] = useState(false);
  const [revealSlow, setRevealSlow] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState("");
  const [connected, setConnected] = useState(false);
  /* placeholder rotation for open text answers */
  const [phIdx, setPhIdx] = useState(0);
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
        .select("first_name, last_name, firm, sector_focus, level, seniority_band, onboarding_step, skill_ratings, identity_intelligence")
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
      if (p.level) setLevelTitle(p.level);
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
        .select("name, why_line, anchor_low, anchor_mid, anchor_high")
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
      // However many the band has — never a constant.
      setDims(rows as Dimension[]);
    } catch { setContentError(true); }
  }, [band, sector]);

  const loadQuestions = useCallback(async () => {
    if (!band) return;
    setContentError(false);
    try {
      const base = () => (supabase.from("onboarding_questions" as any) as any)
        .select("prompt, helper, kind, options, max_choices, why_asked, allow_none, randomise")
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
      // However many the band has — never a constant.
      setQuestions(rows as JourneyQuestion[]);
    } catch { setContentError(true); }
  }, [band, sector]);

  useEffect(() => {
    if (screen === 8 || screen === TRUST_SLIDERS_SCREEN || screen === 9) void loadDimensions();
  }, [screen, loadDimensions]);
  useEffect(() => { if (screen === 10 || screen === 11) void loadQuestions(); }, [screen, loadQuestions]);

  /* the member's own figures, read once the posts are in */
  useEffect(() => {
    if (!userId || proof) return;
    if (screen < 2) return;
    loadPostProof(userId).then((p) => { if (p.posts > 0) setProof(p); }).catch(() => {});
  }, [userId, screen, proof]);

  /* one sentence of their own, quoted back on the confirm screen */
  useEffect(() => {
    if (!userId || ownLine) return;
    if (screen !== 2 && screen !== 3) return;
    loadOwnSentence(userId).then((s) => { if (s) setOwnLine(s); }).catch(() => {});
  }, [userId, screen, ownLine]);

  /* everything else Aura already read — the whole profile, not three numbers */
  useEffect(() => {
    if (!userId || facts) return;
    if (screen !== 2 && screen !== 3) return;
    loadProfileFacts(userId).then((f) => { if (f) setFacts(f); }).catch(() => {});
  }, [userId, screen, facts]);

  /* three spaces Aura proposes — fetched the moment a proposed question is in view */
  useEffect(() => {
    if (screen !== 11 || !questions) return;
    const q = questions[Math.min(qIdx, questions.length - 1)];
    if (q?.kind !== "proposed" || proposals !== null || proposalsDead) return;
    let alive = true;
    const timer = window.setTimeout(() => { if (alive) setProposalsDead(true); }, 15000);
    supabase.functions
      .invoke("onboarding-proposals", {
        body: { claims: claims.map((c) => c.title), sector: sector || null, level: levelTitle || null },
      })
      .then(({ data, error }) => {
        if (!alive) return;
        const list = (data as any)?.options;
        if (error || !Array.isArray(list) || list.length === 0) setProposalsDead(true);
        else setProposals(list.slice(0, 3));
      })
      .catch(() => { if (alive) setProposalsDead(true); })
      .finally(() => window.clearTimeout(timer));
    return () => { alive = false; window.clearTimeout(timer); };
  }, [screen, questions, qIdx, proposals, proposalsDead, claims, sector, levelTitle]);

  /* ── autosave after every slider ──
     Existing members keep whatever keys are already on file: new answers are
     MERGED in alongside them, never written over the top of the object. */
  const saveScores = useCallback(async (next: Record<string, number>) => {
    if (!userId) return;
    try {
      const { data: current } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("skill_ratings, audit_results").eq("user_id", userId).maybeSingle();
      const existingRatings = ((current as any)?.skill_ratings as Record<string, number>) || {};
      const existingAudit = ((current as any)?.audit_results as Record<string, number>) || {};
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({
          skill_ratings: { ...existingRatings, ...next },
          audit_results: { ...existingAudit, ...next },
          audit_completed_at: new Date().toISOString(), audit_method: "self_read",
          instrument_version: 2,
          ...(band ? { answered_band: band } : {}),
        })
        .eq("user_id", userId);
    } catch (e) { console.warn("[journey] slider save failed", e); }
  }, [userId, band]);

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
    try {
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ instrument_version: 2, ...(band ? { answered_band: band } : {}) })
        .eq("user_id", userId);
    } catch (e) { console.warn("[journey] stamp failed", e); }
    const results = await generateMarketRead(userId, finalAnswers, sector || null, band);
    const figures = [
      ...(postsRead ? [{ value: String(postsRead), label: "posts read" }] : []),
      ...(claims.length ? [{ value: String(claims.length), label: "claims kept" }] : []),
      ...(Object.keys(scores).length ? [{ value: String(Object.keys(scores).length), label: "strengths on record" }] : []),
    ];
    setReveal(toRevealData(results, {
      figures,
      excludeSoft: (dims || []).map((d) => d.name),
      sources: {
        posts: postsRead ?? 0,
        saved: claims.length,
        answers: Object.keys(finalAnswers).length,
        sliders: Object.keys(scores).length,
      },
    }));
    setRevealPending(false);
  };

  /* if they come back later, show whatever read is already on file */
  useEffect(() => {
    if (screen !== 12 || !revealPending) { return; }
    // Never trap the member on the last screen.
    const t = window.setTimeout(() => setRevealSlow(true), 20000);
    return () => window.clearTimeout(t);
  }, [screen, revealPending]);

  /* the report wait has four steps; the clock drives the first three */
  useEffect(() => {
    if (screen !== 12 || !revealPending) { setGenElapsed(0); return; }
    const started = Date.now();
    const i = window.setInterval(() => setGenElapsed(Date.now() - started), 500);
    return () => window.clearInterval(i);
  }, [screen, revealPending]);

  useEffect(() => {
    if (screen !== 13 || reveal || !userId) return;
    loadMarketRead(userId).then((r) => {
      const d = toRevealData(r, {
        figures: [
          ...(postsRead ? [{ value: String(postsRead), label: "posts read" }] : []),
          ...(claims.length ? [{ value: String(claims.length), label: "claims kept" }] : []),
          ...(Object.keys(scores).length ? [{ value: String(Object.keys(scores).length), label: "strengths on record" }] : []),
        ],
        excludeSoft: (dims || []).map((x) => x.name),
        sources: {
          posts: postsRead ?? 0,
          saved: claims.length,
          answers: Object.keys(answers).length,
          sliders: Object.keys(scores).length,
        },
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
          level: levelTitle.trim() || (band ? BAND_TO_LEVEL[band] : null),
          onboarding_completed: true,
          onboarding_step: 4,
          completed: true,
          instrument_version: 2,
          ...(band ? { answered_band: band } : {}),
        }, { onConflict: "user_id" });
      } catch (e) { console.warn("[journey] finish save failed", e); }
      try { localStorage.removeItem(`aura_ob_screen_${userId}`); } catch { /* ignore */ }
    }
    try { localStorage.setItem("aura_onboarding_complete", "true"); } catch { /* ignore */ }
    try { sessionStorage.removeItem("aura_onboarding_visits"); } catch { /* ignore */ }
    supabase.functions.invoke("compute-imprint", { body: {} }).catch(() => {});
    navigate("/home", { replace: true });
  };

  /**
   * Connect in a popup. A full-page redirect from inside the flow throws the
   * member out at its most fragile moment, so the redirect is only the
   * fallback — and it says so when it happens.
   */
  const connectLinkedIn = async (opts?: { allowRedirect?: boolean }) => {
    setConnecting(true);
    setConnectNote("");
    try {
      // LinkedIn only accepts the live origin as a redirect target.
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "get-auth-url", origin: "https://www.aura-intel.org" },
      });
      if (error) throw error;
      const url = (data as any)?.url || (data as any)?.authUrl;
      if (!url) throw new Error("no url");

      const win = window.open(url, "aura_li_oauth", "width=600,height=700,menubar=no,toolbar=no");
      if (!win) {
        if (opts?.allowRedirect) {
          setConnectNote("Your browser blocked the pop-up, so this opens in the same tab. You'll come straight back.");
          window.location.href = url;
          return;
        }
        setConnectNote("Your browser blocked the pop-up. You can connect from Settings the moment you're in — nothing here is lost.");
        setConnecting(false);
        return;
      }

      const onMessage = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return;
        const d: any = ev.data;
        if (!d || d.source !== "aura-linkedin-oauth") return;
        window.removeEventListener("message", onMessage);
        window.clearInterval(watch);
        setConnecting(false);
        if (d.ok) { setConnected(true); setConnectNote(""); }
        else setConnectNote(d.message || "LinkedIn didn't finish. You can do this from Settings later.");
      };
      window.addEventListener("message", onMessage);
      const watch = window.setInterval(() => {
        if (win.closed) {
          window.clearInterval(watch);
          window.removeEventListener("message", onMessage);
          setConnecting(false);
        }
      }, 700);
    } catch {
      setConnectNote("LinkedIn connection only works on aura-intel.org — you can do this from Settings after you're in.");
      setConnecting(false);
    }
  };

  /* ── escape hatch, unchanged in spirit ── */
  /** Save & exit — everything already answered stays, and Home is one tap away. */
  const saveAndExit = useCallback(() => {
    void persistScreen(screen);
    navigate("/home");
  }, [persistScreen, screen, navigate]);

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

  /** One writer for the level, wherever it is picked. */
  const chooseTitle = async (title: string, b: Band) => {
    setLevelTitle(title);
    setBand(b);
    setDims(null);
    setQuestions(null);
    if (userId) {
      try {
        await (supabase.from("diagnostic_profiles" as any) as any)
          .update({ level: title, seniority_band: b, band_source: "corrected" })
          .eq("user_id", userId);
      } catch (e) { console.warn("[journey] level save failed", e); }
    }
  };

  const titleList = (onPick: (t: string, b: Band) => void) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBlockStart: 12 }}>
      {titlesFailed ? (
        <>
          <p style={{ ...bodyLight, margin: 0 }}>Aura couldn't load the list of levels. Nothing is lost.</p>
          <OBButton variant="secondary" onClick={() => void reloadTitles()}>Try again</OBButton>
        </>
      ) : seniorityTitles.map((t) => (
        <button key={t.title} type="button" onClick={() => onPick(t.title, t.band as Band)} style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
          textAlign: "start", padding: "11px 13px", borderRadius: 12, cursor: "pointer",
          border: `1px solid ${levelTitle === t.title ? OB.blue : OB.line}`,
          background: levelTitle === t.title ? OB.blueTint : OB.white,
          fontSize: 14, fontFamily: "inherit", color: OB.ink,
        }}>
          <span>{t.title}</span>
          <span style={{ fontSize: 11.5, color: OB.muted }}>{TITLE_BAND_LABEL[t.band as TitleBand]}</span>
        </button>
      ))}
    </div>
  );

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
        <PaperShell onExit={saveAndExit} bead={0} cream footer={escapeFooter}>
          <h1 style={h1Light}>Is this you?</h1>
          <p style={{ ...bodyLight, fontFamily: OB.mono, fontSize: 14, color: OB.ink, wordBreak: "break-all" }}>
            {userEmail || "—"}
          </p>
          <p style={bodyLight}>Your invitation went to that address. Confirm it before anything is saved to your name.</p>
          <Actions style={{ marginBlockStart: 22 }}>
            <OBButton onClick={confirmIdentityYes}>Yes, that's me <ArrowRight size={16} /></OBButton>
            <OBButton variant="tertiary" onClick={() => void confirmIdentityNo()} loading={signingOut} loadingLabel="Signing out…">
              No, this isn't mine
            </OBButton>
          </Actions>
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
        <PaperShell onExit={saveAndExit} bead={0} cream footer={escapeFooter}>
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
          <Actions style={{ marginBlockStart: 0 }}>
            <OBButton onClick={() => void handleSetPassword()} disabled={!allValid} loading={settingPwd} loadingLabel="Saving…">
              Set it and start
            </OBButton>
          </Actions>
        </PaperShell>
      </>
    );
  }

  /* ─────────────────────────── the fourteen screens ─────────────────────── */

  const retryPanel = (retry: () => void) => (
    <>
      <h1 style={h1Night}>Give that one more go.</h1>
      <p style={bodyNight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
      <Actions style={{ marginBlockStart: 22 }}><OBButton onClick={retry}>Try again</OBButton></Actions>
    </>
  );

  let content: React.ReactNode = null;

  /* 0 — CREAM */
  if (screen === 0) {
    content = (
      <PaperShell onExit={saveAndExit} bead={0} cream footer={escapeFooter}>
        <h1 style={h1Light}>Let's fill this up.</h1>
        <p style={bodyLight}>
          Five short steps, and each one gives you something back as you go. It takes about ten minutes, and you can
          stop anywhere — everything is saved as you go. At the end this shelf is yours, and Aura knows how to write
          the way you already think.
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "26px 0 6px" }}>
          {SHELF.map((s) => <ShelfBadge key={s.key} label={s.label} tone={s.tone} />)}
        </div>
        <Actions style={{ marginBlockStart: 22 }}><OBButton onClick={() => go(1)}>Start</OBButton></Actions>
        <p style={footnote}>Nothing gets posted unless you press publish.</p>
      </PaperShell>
    );
  }

  /* 1 — WHITE, the address */
  if (screen === 1) {
    content = (
      <PaperShell onExit={saveAndExit} bead={0} footer={escapeFooter}>
        <h1 style={h1Light}>What's your LinkedIn?</h1>
        <p style={bodyLight}>
          So nothing Aura writes for you sounds generic. It reads what's already public — your profile and your
          recent posts — and picks up your sector, your level and the way you already write.
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
        <Actions style={{ marginBlockStart: 16 }}>
          <OBButton onClick={() => void readProfile()} disabled={!liInput.trim()} loading={liBusy} loadingLabel="Reading…">
            Read my profile
          </OBButton>
          <OBButton variant="tertiary" onClick={() => go(MANUAL_SCREEN)}>I'd rather type it in myself</OBButton>
        </Actions>
        <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.6, color: OB.muted }}>
          Aura stores what it reads so it can write as you. You can delete it any time in Settings.
        </p>

        {/* Optional accelerator. Quiet, secondary, never the way through. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 14px" }}>
          <span style={{ blockSize: 1, background: OB.line, flex: 1 }} />
          <span style={{ fontSize: 11.5, color: OB.muted }}>Optional — ten seconds more</span>
          <span style={{ blockSize: 1, background: OB.line, flex: 1 }} />
        </div>
        {connected ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: RADIUS.card,
            background: OB.blueTint, fontSize: 13.5, color: OB.ink,
          }}>
            <Check size={15} style={{ color: "#12805C" }} /> Connected · Aura can see how your posts performed
          </div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted }}>
              Connect LinkedIn too and Aura learns which of your subjects your audience already rewards, so it stops
              guessing.
            </p>
            <Actions style={{ marginBlockStart: 12 }}>
              <OBButton variant="secondary" onClick={() => void connectLinkedIn()} loading={connecting} loadingLabel="Connecting…">
                Connect LinkedIn
              </OBButton>
            </Actions>
            {connectNote ? (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted }}>{connectNote}</p>
            ) : null}
          </>
        )}
        <p style={footnote}>Aura never posts. You press publish, every time.</p>
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
    // Never print a zero for posts or words — the absence is the message.
    const nothingPublic = readDone && !postsRead && !ownWords;
    content = (
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Reading you.</h1>
        <div style={{ marginBlockStart: 26 }}>
          <WorkProgress onNight done={rows.filter((r) => r.done).length} total={rows.length || 1} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <StatusRow key={r.key} label={r.label} done={r.done}>{r.line}</StatusRow>
          ))}
        </div>
        {nothingPublic ? (
          <p style={{ ...bodyNight, marginBlockStart: 16 }}>{EMPTY_POSTS_LINE}</p>
        ) : null}
        <Actions style={{ marginBlockStart: 24 }}>
          <OBButton onClick={() => go(3)} loading={!allLanded} loadingLabel="Reading…">See what I found</OBButton>
        </Actions>
      </NightShell>
    );
  }

  /* 3 — WHITE, what Aura can see */
  if (screen === 3) {
    // A zero for posts is never printed — the empty-post line stands in for it.
    const figures = [
      ...(postsRead ? [{ v: postsRead, l: "posts read" }] : []),
      ...(liProfile?.followers ? [{ v: liProfile.followers, l: "following you" }] : []),
      ...(liProfile?.skills_count ? [{ v: liProfile.skills_count, l: "skills on record" }] : []),
    ];
    // The read succeeded, so the firm, sector and level all come from it.
    // There is no separate page after this one.
    const nextFromHere = () => go(4);
    content = (
      <PaperShell onExit={saveAndExit} bead={0} footer={escapeFooter}>
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
        {postsRead ? (
          <div style={{ display: "flex", gap: 20, marginBlockStart: 20 }}>
            {figures.map((f) => (
              <div key={f.l}>
                <div style={{ fontFamily: OB.mono, fontSize: 22, fontWeight: 600, color: OB.ink }}>{f.v}</div>
                <div style={{ fontSize: 11.5, color: OB.muted, marginBlockStart: 4 }}>{f.l}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ ...bodyLight, marginBlockStart: 18 }}>{EMPTY_POSTS_LINE}</p>
        )}

        {/* What Aura found in your record. Each part computed; anything missing is simply absent. */}
        {facts ? (() => {
          const where = [
            facts.role && facts.company ? `${facts.role} at ${facts.company}` : facts.role || facts.company,
            facts.location,
          ].filter(Boolean) as string[];
          const counts = [
            facts.roles ? `${facts.roles} ${facts.roles === 1 ? "role" : "roles"}` : "",
            facts.certifications ? `${facts.certifications} certifications` : "",
            facts.skills ? `${facts.skills} skills` : "",
            facts.projects ? `${facts.projects} projects` : "",
            facts.joinedYear ? `on LinkedIn since ${facts.joinedYear}` : "",
          ].filter(Boolean);
          if (!where.length && !counts.length && !facts.topSkills.length && !facts.aboutFirstLine) return null;
          return (
            <div style={{ marginBlockStart: 18 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 700, color: OB.ink }}>
                What Aura found in your record
              </p>
              {where.length ? (
                <p style={{ margin: 0, fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted }}>
                  {where.join(" · ")}
                </p>
              ) : null}
              {counts.length ? (
                <p style={{
                  margin: "8px 0 0", fontFamily: OB.mono, fontSize: "var(--ob-small)",
                  letterSpacing: "0.02em", color: OB.ink,
                }}>{counts.join(" · ")}</p>
              ) : null}
              {facts.topSkills.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBlockStart: 10 }}>
                  {facts.topSkills.map((s) => (
                    <span key={s} style={{
                      fontSize: 11.5, color: OB.ink, background: OB.canvas,
                      border: `1px solid ${OB.line}`, borderRadius: RADIUS.chip, padding: "4px 8px",
                    }}>{s}</span>
                  ))}
                </div>
              ) : null}
              {facts.aboutFirstLine ? (
                <p style={{
                  margin: "12px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.6,
                  color: OB.muted, fontStyle: "italic",
                }}>“{facts.aboutFirstLine}”</p>
              ) : null}
            </div>
          );
        })() : null}

        {/* What other people wrote about them, verbatim. Nothing here is generated. */}
        {facts?.recQuote && facts.recommendations ? (
          <figure style={{
            margin: "18px 0 0", padding: "15px 17px", borderRadius: RADIUS.card,
            background: OB.blueTint, borderInlineStart: `3px solid ${OB.blue}`,
          }}>
            <figcaption style={{ fontSize: 11.5, color: OB.muted, marginBlockEnd: 8 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: OB.ink, marginBlockEnd: 6 }}>
                What people who worked with you said
              </span>
              {facts.recommendations} {facts.recommendations === 1 ? "person has" : "people have"} written a
              recommendation for you
            </figcaption>
            <blockquote style={{ margin: 0, fontSize: "var(--ob-body)", lineHeight: 1.6, color: OB.ink }}>
              “{facts.recQuote.text}”
            </blockquote>
            <p style={{ margin: "9px 0 0", fontSize: 11.5, color: OB.muted }}>— {facts.recQuote.title}</p>
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: OB.muted }}>
              Aura read all {facts.recommendations}.
            </p>
          </figure>
        ) : null}

        {/* Their own words, verbatim. If nothing qualifies, nothing shows. */}
        {ownLine ? (
          <figure style={{
            margin: "20px 0 0", padding: "15px 17px", borderRadius: RADIUS.card,
            background: OB.canvas, borderInlineStart: `3px solid ${OB.blue}`,
          }}>
            <figcaption style={{ fontSize: 11.5, color: OB.muted, marginBlockEnd: 8 }}>You wrote this:</figcaption>
            <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: OB.ink }}>
              “{ownLine.text}”
            </blockquote>
            <p style={{ margin: "9px 0 0", fontSize: 11.5, color: OB.muted }}>
              — your post{ownLine.when ? `, ${ownLine.when}` : ""}
            </p>
          </figure>
        ) : null}

        <div style={{
          marginBlockStart: 20, padding: "13px 15px", borderRadius: RADIUS.card,
          background: OB.canvas, border: `1px solid ${OB.line}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 14 }}>Level · <strong>{levelTitle || bandLabel || "not set"}</strong></span>
            <OBButton variant="tertiary" onClick={() => setBandPicker((v) => !v)} style={{ flexShrink: 0 }}>
              {bandPicker ? "Close" : "Change"}
            </OBButton>
          </div>
          {bandPicker && titleList((t, b) => { void chooseTitle(t, b); setBandPicker(false); })}
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

        <Actions style={{ marginBlockStart: 18 }}>
          <OBButton onClick={nextFromHere}>That's me</OBButton>
        </Actions>
      </PaperShell>
    );
  }

  /* 15 — WHITE, only when the read failed or was skipped */
  if (screen === MANUAL_SCREEN) {
    const ready = !!firstName.trim() && !!firm.trim() && !!sector && !!band && !!levelTitle;
    content = (
      <PaperShell onExit={saveAndExit} bead={0} footer={escapeFooter}>
        <h1 style={h1Light}>Aura couldn't read it — tell it the basics.</h1>
        <p style={bodyLight}>Four things, and Aura works from these until you point it at your profile.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBlockStart: 20 }}>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={fieldStyle} />
          <input value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Where you work" style={fieldStyle} />
          <select value={sector} onChange={(e) => setSector(e.target.value)} style={fieldStyle}>
            <option value="">Your sector</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p style={{ ...bodyLight, marginBlockStart: 16, fontWeight: 600, color: OB.ink }}>Your level</p>
        {titleList((t, b) => { setLevelTitle(t); setBand(b); })}
        <Actions style={{ marginBlockStart: 20 }}>
        <OBButton disabled={!ready} onClick={async () => {
          if (userId) {
            await (supabase.from("diagnostic_profiles" as any) as any).upsert({
              user_id: userId, first_name: firstName.trim(), last_name: lastName.trim() || null,
              firm: firm.trim(), sector_focus: sector, level: levelTitle || (band ? BAND_TO_LEVEL[band] : null),
              seniority_band: band, band_source: "corrected",
            }, { onConflict: "user_id" });
          }
          go(4);
        }}>Save and carry on</OBButton>
        </Actions>
      </PaperShell>
    );
  }

  /* 4 — NIGHT */
  if (screen === 4) {
    content = (
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>I know who you are. Now I need what you notice.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Your profile says what you've done. It doesn't say what you think. One link is enough to start.
        </p>
        <Actions style={{ marginBlockStart: 26 }}><OBButton onClick={() => go(5)}>Okay</OBButton></Actions>
      </NightShell>
    );
  }

  /* 5 — WHITE, the first link */
  if (screen === 5) {
    content = (
      <PaperShell onExit={saveAndExit} bead={1} footer={escapeFooter}>
        <h1 style={h1Light}>Something you read this week.</h1>
        <p style={bodyLight}>
          An article, a report, a post you disagreed with. Aura reads it and shows you what it found.
        </p>
        <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && linkInput.trim()) void sendLink(linkInput); }}
          placeholder="Paste a link" inputMode="url" style={{ ...fieldStyle, marginBlockStart: 20 }} />
        <Actions style={{ marginBlockStart: 14 }}>
          <OBButton disabled={!linkInput.trim()} onClick={() => void sendLink(linkInput)}>Add it</OBButton>
        </Actions>

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
            <div style={{ marginBlockStart: 4 }}>
              <OBButton variant="tertiary"
                onClick={() => void sendLink(suggested.url, { title: suggested.title, summary: suggested.summary })}>
                Use this one
              </OBButton>
            </div>
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
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Reading it.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>Finding the parts you can use.</p>
        <div style={{ marginBlockStart: 22 }}>
          <WorkProgress onNight done={steps.filter((s) => s.done).length} total={steps.length} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s) => (
            <StatusRow key={s.key} label={s.label} done={s.done}>{s.label}</StatusRow>
          ))}
        </div>
        {proof && proof.lines.length > 0 ? (
          <WaitProof lines={proof.lines} howLong="While you wait — here's what Aura found in your own posts." />
        ) : null}
        {claimsSlow && (
          <>
            <p style={{ ...bodyNight, textAlign: "center" }}>Still reading — it'll be waiting on your Home.</p>
            <Actions style={{ marginBlockStart: 20 }}><OBButton onClick={() => go(8)}>Keep going</OBButton></Actions>
          </>
        )}
      </NightShell>
    );
  }

  /* 7 — NIGHT, three claims */
  if (screen === 7) {
    content = (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Three claims, and they're yours.</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBlockStart: 24 }}>
          {claims.slice(0, 3).map((c, i) => (
            <ClaimCard key={`${c.title}-${i}`} index={i} title={c.title} content={c.content} />
          ))}
        </div>
        <p style={{ ...bodyNight, textAlign: "center", marginBlockStart: 22 }}>
          You'll know when something moves these — without going looking.
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "22px 0 4px" }}>
          {SHELF.map((s, i) => (
            <ShelfBadge key={s.key} label={s.label} tone={s.tone} onNight
              unlocked={i <= 1}
              figure={i === 0 ? (postsRead || "✓") : i === 1 ? claims.length : undefined} />
          ))}
        </div>
        <Actions style={{ marginBlockStart: 18 }}><OBButton onClick={() => go(8)}>Keep going</OBButton></Actions>
      </NightShell>
    );
  }

  /* 8 — NIGHT, before the sliders */
  if (screen === 8) {
    const sliderCount = dims?.length ?? 0;
    // Sector rows do not exist yet — every member gets the band set, so the
    // copy may only promise the level.
    const pickedLine = bandLabel && sliderCount
      ? `${sliderCount} sliders. Under a minute. Picked for ${bandLabel}.`
      : null;
    content = (
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        {contentError ? retryPanel(() => void loadDimensions()) : (
          <>
            <h1 style={{ ...h1Night, textAlign: "center" }}>Now your own read.</h1>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              Where your own read and your posts disagree is where the useful part is.
            </p>
            {pickedLine ? <p style={{ ...bodyNight, textAlign: "center" }}>{pickedLine}</p> : null}
            <Actions style={{ marginBlockStart: 24 }}>
              <OBButton onClick={() => { setDimIdx(0); go(TRUST_SLIDERS_SCREEN); }} loading={!dims} loadingLabel="Loading…">
                Okay
              </OBButton>
            </Actions>
          </>
        )}
      </NightShell>
    );
  }

  /* 8.5 — NIGHT, why the sliders are built this way */
  if (screen === TRUST_SLIDERS_SCREEN) {
    const sliderCount = dims?.length ?? 0;
    content = (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>
        {contentError || !dims ? retryPanel(() => void loadDimensions()) : (
          <>
            <h1 style={{ ...h1Night, textAlign: "center" }}>Before you start</h1>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              No score. Each one asks what you have actually done, in plain sentences rather than numbers.
            </p>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              {sliderCount ? `${sliderCount} sliders, picked for your level. Under a minute.` : "Picked for your level. Under a minute."}
            </p>
            <Actions style={{ marginBlockStart: 24 }}>
              <OBButton onClick={() => { setDimIdx(0); go(9); }}>Okay</OBButton>
            </Actions>
          </>
        )}
      </NightShell>
    );
  }

  /* 9 — WHITE ×8, the sliders */
  if (screen === 9) {
    if (contentError || !dims) {
      content = (
        <PaperShell onExit={saveAndExit} bead={2} footer={escapeFooter}>
          <h1 style={h1Light}>Give that one more go.</h1>
          <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
          <Actions style={{ marginBlockStart: 20 }}><OBButton onClick={() => void loadDimensions()}>Try again</OBButton></Actions>
        </PaperShell>
      );
    } else {
      const d = dims[Math.min(dimIdx, dims.length - 1)];
      const value = scores[d.name] ?? 50;
      const last = dimIdx >= dims.length - 1;
      content = (
        <PaperShell onExit={saveAndExit} bead={2} footer={escapeFooter}>
          {flatWarn ? (
            <>
              <h1 style={{ ...h1Light, fontSize: "clamp(22px,6vw,28px)" }}>Can I check something?</h1>
              <p style={bodyLight}>
                You put all {dims.length} in more or less the same place. That happens when the sentences don't quite
                fit, or when it's easier to sit in the middle than to pick. Either is fine — but Aura reads a flat
                answer as "no strong pattern", and it will write more carefully because of it.
              </p>
              <Actions style={{ marginBlockStart: 20 }}>
                <OBButton onClick={() => { setFlatWarn(false); setDimIdx(0); }}>Let me have another look</OBButton>
                <OBButton variant="tertiary" onClick={() => { setFlatAck(true); setFlatWarn(false); go(10); }}>
                  No, that's right for me
                </OBButton>
              </Actions>
            </>
          ) : (
          <>
          <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            {dimIdx + 1} / {dims.length}
          </p>
          <h1 style={{ ...h1Light, marginBlockStart: 10, fontSize: "var(--ob-h2)" }}>{d.name}</h1>
          {d.why_line ? <p style={bodyLight}>{d.why_line}</p> : null}
          <input
            type="range" min={0} max={100} step={1} value={value}
            aria-label={d.name}
            aria-valuetext={value < 34 ? (d.anchor_low ?? "") : value < 67 ? (d.anchor_mid ?? "") : (d.anchor_high ?? "")}
            onChange={(e) => setScore(d.name, Number(e.target.value))}
            style={{ inlineSize: "100%", marginBlockStart: 26, accentColor: OB.blue }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBlockStart: 12 }}>
            {([
              ["Low", d.anchor_low, value < 34],
              ["Middle", d.anchor_mid, value >= 34 && value < 67],
              ["High", d.anchor_high, value >= 67],
            ] as [string, string | null, boolean][])
              .filter(([, text]) => !!text)
              .map(([tag, text, live]) => (
                <div key={tag} style={{
                  display: "flex", gap: 9, fontSize: "var(--ob-anchor)", lineHeight: 1.55,
                  color: live ? OB.ink : OB.muted,
                  background: live ? OB.blueTint : "transparent",
                  border: `1px solid ${live ? OB.blue : "transparent"}`,
                  borderRadius: RADIUS.card, padding: "8px 10px",
                  transition: `background 220ms ${EASE}, color 220ms ${EASE}`,
                }}>
                  <span style={{ fontFamily: OB.mono, fontSize: "var(--ob-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: OB.muted, flexShrink: 0, paddingBlockStart: 2 }}>{tag}</span>
                  <span>{text}</span>
                </div>
              ))}
          </div>
          <Actions style={{ marginBlockStart: 26 }}>
            <OBButton onClick={() => {
              if (!scores[d.name]) setScore(d.name, value);
              if (!last) { setDimIdx((i) => i + 1); return; }
              const finalValues = dims.map((x) => (x.name === d.name ? value : scores[x.name] ?? value));
              const flatNow = Math.max(...finalValues) - Math.min(...finalValues) <= 15;
              if (flatNow && !flatAck) setFlatWarn(true); else go(10);
            }}>{last ? `Done — that's all ${dims.length}` : "Next"}</OBButton>
            {dimIdx > 0 ? (
              <OBButton variant="tertiary" onClick={() => setDimIdx((i) => Math.max(0, i - 1))}>Back</OBButton>
            ) : null}
          </Actions>
          {last && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBlockStart: 22 }}>
              {SHELF.map((s, i) => (
                <ShelfBadge key={s.key} label={s.label} tone={s.tone}
                  unlocked={i <= 2}
                  figure={i === 0 ? (postsRead || "✓") : i === 1 ? claims.length : i === 2 ? dims.length : undefined} />
              ))}
            </div>
          )}
          </>
          )}
        </PaperShell>
      );
    }
  }

  /* 10 — NIGHT, before the six */
  if (screen === 10) {
    content = (
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        {contentError ? retryPanel(() => void loadQuestions()) : (
          <>
            <h1 style={{ ...h1Night, textAlign: "center" }}>This next bit is what makes it yours.</h1>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              Nine questions about how you actually work — read together with your posts, your claims and your
              sliders.
            </p>
            <p style={{ ...bodyNight, textAlign: "center" }}>
              What comes out is the subjects you own, the space nobody near you has claimed, and where the ground is
              still soft.
            </p>
            <p style={{ ...bodyNight, textAlign: "center" }}>Nine questions. Two minutes. Saved as you go.</p>
            <Actions style={{ marginBlockStart: 24 }}>
              <OBButton onClick={() => { setQIdx(0); go(11); }} loading={!questions} loadingLabel="Loading…">
                Let's do it
              </OBButton>
            </Actions>
          </>
        )}
      </NightShell>
    );
  }

  /* 11 — WHITE, the nine questions */
  if (screen === 11) {
    if (contentError || !questions) {
      content = (
        <PaperShell onExit={saveAndExit} bead={3} footer={escapeFooter}>
          <h1 style={h1Light}>Give that one more go.</h1>
          <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
          <Actions style={{ marginBlockStart: 20 }}><OBButton onClick={() => void loadQuestions()}>Try again</OBButton></Actions>
        </PaperShell>
      );
    } else {
      const q = questions[Math.min(qIdx, questions.length - 1)];
      const last = qIdx >= questions.length - 1;
      const advance = (value: string) => {
        const next = { ...answers, [`Q${qIdx + 1} ${q.prompt}`]: value };
        setAnswers(next);
        setTextAnswer("");
        setMultiPicked([]);
        if (userId) void saveAnswers(userId, next);
        if (last) void finishQuestions(next); else setQIdx((i) => i + 1);
      };
      const back = () => {
        setTextAnswer("");
        setMultiPicked([]);
        setQIdx((i) => Math.max(0, i - 1));
      };
      const cap = q.kind === "multi" ? (q.max_choices ?? (q.options?.length || 99)) : 1;
      const atCap = multiPicked.length >= cap;
      const opts = q.randomise ? shuffled(q.options || [], qIdx + 1) : (q.options || []);
      const proposedReady = q.kind === "proposed" && !!proposals && proposals.length > 0;
      const proposedFallback = q.kind === "proposed" && (proposalsDead || (proposals !== null && proposals.length === 0));
      /* "None of these fit" belongs to a list of options, never to an open box. */
      const showNone = !!q.allow_none && (q.kind === "choice" || q.kind === "multi");
      /* The cap is printed once, above the options — so a helper that repeats it is dropped. */
      const helperText = q.helper && !/pick up to/i.test(q.helper) ? q.helper : null;
      /* A suggestion built from what Aura already read. Never submitted. */
      const phList = smartPlaceholders(facts, sector || null, String(liProfile?.headline || "") || null);
      const placeholder = phList[phIdx % phList.length];
      const rotatePlaceholder = () => setPhIdx((i) => i + 1);

      const optionButton = (label: string, onClick: () => void, picked = false, blocked = false, why?: string) => (
        <button key={label} type="button" disabled={blocked} onClick={onClick} style={{
          textAlign: "start", padding: "14px 15px", borderRadius: 14,
          cursor: blocked ? "not-allowed" : "pointer",
          border: `1px solid ${picked ? OB.blue : OB.line}`,
          background: picked ? OB.blueTint : OB.white, fontSize: 14.5,
          lineHeight: 1.45, fontFamily: "inherit", color: OB.ink,
          opacity: blocked ? 0.45 : 1,
          transition: `border-color 220ms ${EASE}, background 220ms ${EASE}`,
        }}>
          {label}
          {why ? <span style={{ display: "block", marginBlockStart: 5, fontSize: 12.5, lineHeight: 1.5, color: OB.muted }}>{why}</span> : null}
        </button>
      );

      content = (
        <PaperShell onExit={saveAndExit} bead={3} footer={escapeFooter}>
          <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            Question {qIdx + 1} of {questions.length}
          </p>
          {qIdx === 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: OB.muted }}>Saved as you go — you can stop any time.</p>
          ) : null}
          <h1 style={{ ...h1Light, marginBlockStart: 10, fontSize: "clamp(21px,5.6vw,27px)" }}>{q.prompt}</h1>
          {helperText ? <p style={bodyLight}>{helperText}</p> : null}
          {q.why_asked ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.55, color: OB.muted }}>
              <span style={{ fontFamily: OB.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", marginInlineEnd: 7 }}>Why this</span>
              {q.why_asked}
            </p>
          ) : null}

          {q.kind === "choice" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 20 }}>
              {opts.map((o) => optionButton(o.label, () => advance(o.label)))}
            </div>
          ) : q.kind === "multi" ? (
            <>
              <p style={{ margin: "16px 0 0", fontSize: 12.5, color: OB.muted }}>Pick up to {cap}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 10 }}>
                {opts.map((o) => optionButton(
                  o.label,
                  () => setMultiPicked((prev) => prev.includes(o.label) ? prev.filter((x) => x !== o.label) : [...prev, o.label]),
                  multiPicked.includes(o.label),
                  !multiPicked.includes(o.label) && atCap,
                ))}
              </div>
              <Actions style={{ marginBlockStart: 16 }}>
                <OBButton disabled={multiPicked.length === 0} onClick={() => advance(multiPicked.join(" · "))}>Next</OBButton>
              </Actions>
            </>
          ) : q.kind === "proposed" ? (
            proposedReady ? (
              <>
                <p style={{ margin: "16px 0 0", fontSize: 12.5, color: OB.muted }}>
                  Keep the one that's actually you. The two you drop tell Aura just as much.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 10 }}>
                  {proposals!.map((pr) => optionButton(
                    pr.label,
                    () => {
                      const dropped = proposals!.filter((x) => x.label !== pr.label).map((x) => x.label);
                      advance(`${pr.label}${dropped.length ? ` (not: ${dropped.join(", ")})` : ""}`);
                    },
                    false, false, pr.why,
                  ))}
                </div>
              </>
            ) : proposedFallback ? (
              <>
                <p style={{ margin: "16px 0 0", fontSize: 12.5, color: OB.muted }}>
                  Aura hasn't got enough of your writing to propose three yet — say it in your own words instead.
                </p>
                <input value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                  aria-label={q.prompt}
                  onFocus={rotatePlaceholder}
                  onKeyDown={(e) => { if (e.key === "Enter" && textAnswer.trim()) advance(textAnswer.trim()); }}
                  placeholder={placeholder} style={{ ...fieldStyle, marginBlockStart: 12 }} />
                <Actions style={{ marginBlockStart: 16 }}>
                  <OBButton disabled={!textAnswer.trim()} onClick={() => advance(textAnswer.trim())}>Next</OBButton>
                </Actions>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: OB.muted, marginBlockStart: 20 }}>
                <Loader2 size={14} className="animate-spin" /> Reading your posts and your claims…
              </div>
            )
          ) : (
            <>
              <input value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                aria-label={q.prompt}
                onFocus={rotatePlaceholder}
                onKeyDown={(e) => { if (e.key === "Enter" && textAnswer.trim()) advance(textAnswer.trim()); }}
                placeholder={placeholder} style={{ ...fieldStyle, marginBlockStart: 20 }} />
              <Actions style={{ marginBlockStart: 16 }}>
                <OBButton disabled={!textAnswer.trim()} onClick={() => advance(textAnswer.trim())}>Next</OBButton>
              </Actions>
            </>
          )}

          {showNone || qIdx > 0 ? (
            <Actions style={{ marginBlockStart: 12 }}>
              {showNone ? (
                <OBButton variant="tertiary" onClick={() => advance("None of these fit")}>None of these fit</OBButton>
              ) : null}
              {qIdx > 0 ? <OBButton variant="tertiary" onClick={back}>Back</OBButton> : null}
            </Actions>
          ) : null}
        </PaperShell>
      );
    }
  }

  /* 12 — NIGHT, the shelf */
  if (screen === 12) {
    /* the four things the report is actually doing, in order */
    const genSteps = [
      { key: "posts", label: "Reading your posts", done: !revealPending || genElapsed > 2000 },
      { key: "saved", label: "Reading what you saved", done: !revealPending || genElapsed > 6000 },
      { key: "answers", label: "Weighing your answers", done: !revealPending || genElapsed > 11000 },
      { key: "write", label: "Writing your read", done: !revealPending },
    ];
    content = (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>
        {revealPending ? (
          <div style={{ marginBlockEnd: 4 }}>
            <WorkProgress onNight slowAfterMs={20000}
              done={genSteps.filter((s) => s.done).length} total={genSteps.length} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBlockEnd: 22 }}>
              {genSteps.map((s) => (
                <StatusRow key={s.key} label={s.label} done={s.done}>{s.label}</StatusRow>
              ))}
            </div>
          </div>
        ) : null}
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
          {proof && proof.posts > 0 ? (
            <>
              Aura has {proof.posts} of your posts and {proof.words.toLocaleString()} words in your own voice
              {proof.pctWithNumber !== null ? `, ${proof.pctWithNumber}% of them carrying a real number` : ""}
              {claims.length ? `, plus ${claims.length} claims you kept` : ""}. That is what it writes from — not a
              template.
            </>
          ) : (
            <>
              {EMPTY_POSTS_LINE}
              {claims.length ? ` Aura already has ${claims.length} ${claims.length === 1 ? "claim" : "claims"} and your own answers on file.` : " Aura already has your own answers on file."}
            </>
          )}
        </p>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Tonight it reads for your three subjects. Tomorrow morning there's something waiting.
        </p>
        {revealPending && proof && proof.lines.length > 0 ? (
          <WaitProof lines={proof.lines} howLong="Writing your read. About a minute." />
        ) : null}
        <Actions style={{ marginBlockStart: 24 }}>
          <OBButton onClick={() => go(13)} loading={revealPending && !revealSlow} loadingLabel="Writing your read…">
            {revealPending && revealSlow ? "See what I have so far" : "See how people see me"}
          </OBButton>
        </Actions>
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
        <div className="obc-in" style={{ inlineSize: "100%", maxInlineSize: "var(--ob-max)" }}>
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
          <Actions style={{ marginBlockStart: 20 }}>
          <OBButton disabled={!reveal} loading={sharing} loadingLabel="Building…" onClick={async () => {
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
          }} style={{ background: OB.night }}>Share this</OBButton>
          <OBButton variant="tertiary" onClick={() => (connected ? void finish() : go(14))}
            style={{ color: "#FFFFFF" }}>Take me in</OBButton>
          </Actions>
          <div style={{ color: "rgba(255,255,255,.82)" }}>
            <ReadCorrection userId={userId} onNight />
            <MethodNote onNight />
          </div>
        </div>
      </div>
    );
  }

  /* 13b — NIGHT, and only after 13 */
  if (screen === 14) {
    content = (
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>One last thing.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Connect LinkedIn and you find out which of your subjects your audience already rewards — so Aura stops
          guessing.
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
        <Actions style={{ marginBlockStart: 22 }}>
          <OBButton onClick={() => void connectLinkedIn({ allowRedirect: true })} loading={connecting} loadingLabel="Connecting…">
            Connect LinkedIn
          </OBButton>
          <OBButton variant="tertiary" onNight onClick={() => void finish()}>Not now</OBButton>
        </Actions>
        {connectNote ? (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.mutedNight }}>{connectNote}</p>
        ) : null}
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