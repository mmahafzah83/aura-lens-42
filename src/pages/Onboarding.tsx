/**
 * THE COLLECTION — the fourteen-screen first run.
 *
 * Surface law, absolute:
 *   NIGHT (#0F1519)  = Aura is working, the member does nothing. AuraFace lives here.
 *   WHITE / CREAM    = the member's turn. Progress lives in the one journey shell.
 *
 * Content comes from two live tables — capability_dimensions and
 * onboarding_questions — resolved exact (band, sector) first, then
 * (band, sector IS NULL). If both come back empty the member sees a friendly
 * retry, never a blank screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveLinkedInAddress, canonicalHandle, loadLinkedInAddress } from "@/lib/linkedinAddress";
import usePageMeta from "@/hooks/usePageMeta";
import { useCountUp } from "@/hooks/useCountUp";
import { useCapturedClaims } from "@/hooks/useCapturedClaims";
import { SECTORS } from "@/constants/sectors";
import { initThemeFromStorage } from "@/lib/applyTheme";
import {
  readToken, loadSession, saveSession, clearToken, claimSession,
  type AssessmentState,
} from "@/lib/assessmentSession";
import { track } from "@/lib/track";
import { sweepIfServerReset } from "@/lib/resetSweep";
import { generateMarketRead, loadMarketRead, saveAnswers, toRevealData } from "@/lib/marketRead";
import AuraFace from "@/components/onboarding/AuraFace";
import ShelfBadge, { type ShelfBadgeTone } from "@/components/onboarding/ShelfBadge";
import ClaimCard from "@/components/onboarding/ClaimCard";
import NextStrip from "@/components/onboarding/NextStrip";
import RevealCard, { type RevealData, shareRevealCard, rasteriseRevealCard, suggestedCaption } from "@/components/onboarding/RevealCard";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import StatusRow from "@/components/onboarding/StatusRow";
import { loadOwnSentence, type OwnSentence } from "@/lib/ownSentence";
import MethodNote from "@/components/onboarding/MethodNote";
import Confetti from "@/components/onboarding/Confetti";
import WaitProof from "@/components/onboarding/WaitProof";
import { WorkingPanel, type WorkingStage } from "@/components/ui/WorkingPanel";
import { buildStages } from "@/lib/operationStages";
import { useRunStages, newRunId } from "@/lib/useRunStages";
import ReadCorrection from "@/components/onboarding/ReadCorrection";
import { loadProfileFacts, type ProfileFacts } from "@/lib/profileFacts";
import { loadPostProof, type PostProof } from "@/lib/postProof";
import { useSeniorityTitles, BAND_LABEL as TITLE_BAND_LABEL, type Band as TitleBand } from "@/lib/seniorityTitles";
import { OB, SPRING, EASE, RADIUS, reducedMotion } from "@/components/onboarding/tokens";
import { OBButton, Actions, BUTTON_CSS } from "@/components/onboarding/buttons";
import { smartPlaceholders } from "@/lib/smartPlaceholders";
import JourneyShell, { STAGE_NAMES, type Beat, type JourneySub } from "@/components/journey/JourneyShell";
import { CONSENT_VERSION } from "@/pages/Auth";
import CvUploadControl from "@/components/cv/CvUploadControl";
import CvCrosscheck from "@/components/report/CvCrosscheck";
import { num, cleanHeadline, memberText, trimToSentence } from "@/lib/memberText";
import { inferSector } from "@/lib/inferSector";
import BrandPaperDocument from "@/components/report/BrandPaperDocument";
import { buildBrandPaper, type BrandPaper } from "@/lib/buildBrandPaper";
import { exportReportPdf } from "@/lib/exportReportPdf";
import { useMayPromiseMorning } from "@/hooks/useMorningPromise";
import { writeProfile as upsertProfile } from "@/lib/profileWrite";
import { ensureTimezone, browserTimezone } from "@/lib/ensureTimezone";
import {
  ASSESSMENT_STEPS, ASSESSMENT_STEPS_WORD, FULL_PICTURE_LINE,
  ASSESSMENT_QUESTIONS, ASSESSMENT_QUESTIONS_WORD, REPORT_FREE_LINE, stageName,
} from "@/lib/brand";
import {
  SEAT_HEADING, SEAT_ROWS, SEAT_PRICE, SEAT_PRICE_SUBLINE, SEAT_CTA, SEAT_PATH,
  SEAT_ONE_JOB, SEAT_HOW_LABEL, SEAT_CONSTRAINT, SEAT_CTA_SECONDARY, SEAT_RESERVE_NOTE,
} from "@/lib/seatCopy";
import { BRAND, ONBOARDING_INTRO, ENDING, WALL, AFTER_KEEP } from "@/constants/language";


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
  { key: "kept", label: "Evidence captured", tone: "cyan" },
  { key: "strengths", label: "Strengths", tone: "deep" },
  { key: "read", label: "Signals found", tone: "amber" },
];

/** The quiet second line — shown only on the promise row and the payoff row. */
const SHELF_SUB = [
  "read from your LinkedIn",
  "what you captured from your reading",
  "rated in your own words",
  "the ground your read gives you",
];

const SHELF_ICON = ["profile", "saved", "strengths", "subjects"] as const;
const SHELF_HINT = [
  "Unlocks when Aura has read your profile",
  "Unlocks when you capture your first piece of evidence",
  "Unlocks when you've moved the sliders",
  "Unlocks when your read is written",
];

/** Domain and age of a suggested read — a senior reader wants to know where a link goes. */
const sourceLine = (a: { url: string; source?: string; published_at?: string | null }): string => {
  let domain = (a.source || "").trim();
  try { domain = new URL(a.url).hostname.replace(/^www\./, ""); } catch { /* keep whatever came back */ }
  const iso = a.published_at;
  if (!iso) return domain;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return domain;
  const days = Math.floor((Date.now() - t) / 86400000);
  const age = days <= 0 ? "today" : days === 1 ? "1 day ago" : days < 30 ? `${days} days ago`
    : days < 60 ? "1 month ago" : `${Math.floor(days / 30)} months ago`;
  return domain ? `${domain} · ${age}` : age;
};

const MANUAL_SCREEN = 15;
/** Shown wherever a post or word count would otherwise read zero. */
const EMPTY_POSTS_LINE = "Nothing public yet — that's the point. Aura will build from what you capture.";
/** The same truth, in the first person, because the dark screens are Aura speaking. */
const EMPTY_POSTS_LINE_NIGHT = "Nothing public yet — that's the point. I'll build from what you capture.";
/** What the free tier deliberately does not do — used on the final screen. */
const LOSS_LINES = [
  "The signals keep arriving in your field. Nothing reads them for you.",
  "What you capture stays a list. It never becomes evidence.",
  "This read is today's. Nothing keeps it current.",
] as const;

/**
 * LinkedIn's OAuth grant is stored against an account — there is nowhere to
 * safely keep an access token for a visitor who has none. So the button is not
 * offered before the account exists; this line is offered instead.
 */
const CONNECT_AFTER_ACCOUNT =
  "Available after you save your report — Aura reads your public posts either way.";
/** A short dark panel that sits between screen 8 and the sliders. */
const TRUST_SLIDERS_SCREEN = 8.5;
/** A white CV step between screen 3 and screen 4 — fractional so nothing renumbers. */
const CV_SCREEN = 3.5;
/** The after-keep share screen — offered only once the report is his. */
const SHARE_SCREEN = 13.5;

/** Plain text buttons inside the screen-13 "Save it" row. */
const quietLink: React.CSSProperties = {
  background: "none", border: "none", padding: "13px 12px", cursor: "pointer",
  fontFamily: OB.ui, fontSize: 13.5, color: "#FFFFFF", textDecoration: "underline",
  display: "inline-block", minBlockSize: 44,
};

/** A real, tappable share action on the blue reveal surface. */
const shareAction: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  minBlockSize: 44, padding: "12px 14px", borderRadius: 999,
  border: "1px solid rgba(255,255,255,.55)", background: "rgba(255,255,255,.12)",
  color: "#FFFFFF", fontFamily: OB.ui, fontSize: 13.5, fontWeight: 600,
  cursor: "pointer", textAlign: "center", textDecoration: "none",
};

/** The selectable row used by choice questions and the reveal feedback block. */
const optionButton = (
  key: string | number,
  label: string,
  onClick: () => void,
  picked = false,
  blocked = false,
  why?: string,
) => (
  <button key={key} type="button" disabled={blocked} onClick={onClick} className="ob-opt" style={{
    textAlign: "start", padding: "14px 15px", borderRadius: 14,
    cursor: blocked ? "not-allowed" : "pointer",
    border: `1px solid ${OB.line}`,
    borderInlineStart: picked ? `2px solid ${OB.blue}` : `1px solid ${OB.line}`,
    background: picked ? OB.blueTint : OB.white, fontSize: 14.5,
    fontWeight: picked ? 600 : 400,
    lineHeight: 1.45, fontFamily: "inherit", color: OB.ink,
    opacity: blocked ? 0.45 : 1,
    minBlockSize: 44,
    transition: `border-color 220ms ${EASE}, background 220ms ${EASE}`,
  }}>
    {label}
    {why ? <span style={{ display: "block", marginBlockStart: 5, fontSize: 12.5, lineHeight: 1.5, color: OB.muted }}>{why}</span> : null}
  </button>
);


const PAGE_CSS = `
.obc{font-family:${OB.ui};-webkit-font-smoothing:antialiased;color:${OB.ink};
  --ob-max:420px;--ob-pad:clamp(22px,6vw,30px);--ob-h1:clamp(25px,7vw,30px);--ob-h2:clamp(21px,5.6vw,26px);
  --ob-body:15px;--ob-small:12.5px;--ob-mono:9.5px;--ob-btn:15px;--ob-anchor:11.5px;--ob-lh:1.65;--ob-face:96px;
  /* Colour is a token here too, so the reveal surface is governed like the rest. */
  --ob-blue:${OB.blue};--ob-blue-light:${OB.blueLight};--ob-white:${OB.white};}
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
  margin: 0, fontSize: "var(--ob-h1)", fontWeight: 700,
  letterSpacing: "-0.02em", lineHeight: 1.15, color: OB.ink,
};

const h1Night: React.CSSProperties = { ...h1Light, color: "#FFFFFF" };

const bodyLight: React.CSSProperties = {
  margin: "12px 0 0", fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", color: OB.muted,
};

const bodyNight: React.CSSProperties = { ...bodyLight, color: OB.mutedNight };

const footnote: React.CSSProperties = {
  margin: "14px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.muted, textAlign: "center",
  /* No orphan: the last two words never break onto a line of their own. */
  textWrap: "balance",
};

/** Why a control is disabled, said next to it — never left to guesswork. */
const whyLine = (id: string, text: string, centred = false) => (
  <p id={id} style={{
    margin: "-2px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted,
    textAlign: centred ? "center" : "start",
  }}>{text}</p>
);

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

/**
 * ONE LOOK, END TO END.
 *
 * Every screen that asks the member anything renders in the light card shell.
 * The night surface is kept for the machine's own moments — reading, and the
 * reveal. `JourneyNav` carries the back control so no screen has to pass it.
 */
const JourneyNav = createContext<{
  onBack?: () => void; banner?: React.ReactNode; name?: string | null; screen?: number;
}>({});

/**
 * ONE PROGRESS SYSTEM, AND IT TELLS THE TRUTH.
 *
 * The read is beat 1 — it is the read, so it cannot be labelled evidence.
 * Evidence starts where evidence actually starts (the CV, the capture, the
 * strengths, the questions) and the position is the last four screens.
 */
const beatOf = (screen: number): Beat =>
  screen >= 12 ? 3 : screen <= 1 || screen === MANUAL_SCREEN ? 1 : 2;

/**
 * THE WORK EACH SCREEN REALLY CARRIES, in arbitrary units. Eight sliders and
 * nine questions are the bulk of the journey and therefore own the bulk of the
 * bar; the old arithmetic gave 85% of the work 7% of the fill.
 */
const SCREEN_WORK: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2],
  [CV_SCREEN, 2], [5, 3], [6, 1], [7, 2], [8, 1], [TRUST_SLIDERS_SCREEN, 1], [9, 16], [10, 1], [11, 18],
  [12, 2], [13, 2], [SHARE_SCREEN, 1], [14, 0.5],
] as const;
const WORK_TOTAL = SCREEN_WORK.reduce((a, [, w]) => a + w, 0);

/** Global 0–1 fill for a screen, plus however far through that screen we are. */
const journeyFraction = (screen: number, sub?: number): number => {
  const key = screen === MANUAL_SCREEN ? 1 : screen;
  let before = 0;
  let mine = 0;
  for (const [s, w] of SCREEN_WORK) {
    if (s < key) before += w;
    else if (s === key) mine = w;
  }
  const inner = typeof sub === "number" ? Math.max(0, Math.min(1, sub)) : 0;
  return Math.max(0, Math.min(1, (before + mine * inner) / WORK_TOTAL));
};

/** Which of the five named stages a screen belongs to. One definition, used
 *  by the resume banner and by Finish later. */
const stageOf = (s: number) => (s <= 3 ? 1 : s <= 7 ? 2 : s <= 9 ? 3 : s <= 11 ? 4 : 5);
const subOf = (screen: number): JourneySub => {
  const i = Math.max(0, Math.min(4, stageOf(screen) - 1));
  return { n: i + 1, total: 5, label: STAGE_NAMES[i] };
};


const NightShell = ({ children, face, footer, onExit, subProgress }: { children: React.ReactNode; face?: boolean; footer?: React.ReactNode; onExit?: () => void; subProgress?: number }) => {
  const { onBack, name, screen = 0 } = useContext(JourneyNav);
  return (
  <JourneyShell
    onBack={onBack}
    onExit={onExit ?? (() => {})}
    name={name}
    beat={beatOf(screen)}
    sub={subOf(screen)}
    fraction={journeyFraction(screen, subProgress)}
    background={OB.night}
    className="obc"
  >
    <div className="obc-in" style={{ inlineSize: "100%" }}>
      {face ? <div style={{ marginBlockEnd: 26 }}><AuraFace size="var(--ob-face)" /></div> : null}
      {children}
      {footer}
    </div>
  </JourneyShell>
  );
};

/**
 * `showProgress={false}` is for the two screens that are NOT the journey —
 * confirming who you are, and setting a password. They are the door, not a
 * third of the walk.
 */
const PaperShell = ({
  children, footer, onExit, face = false, subProgress, showProgress = true,
}: { children: React.ReactNode; footer?: React.ReactNode; onExit?: () => void; face?: boolean; subProgress?: number; showProgress?: boolean }) => {
  const { onBack, banner, name, screen = 0 } = useContext(JourneyNav);
  return (
  <JourneyShell
    onBack={onBack}
    onExit={onExit ?? (() => {})}
    name={name}
    beat={beatOf(screen)}
    sub={subOf(screen)}
    fraction={journeyFraction(screen, subProgress)}
    showProgress={showProgress}
    background={OB.canvas}
    className="obc"
  >

    <div style={{ inlineSize: "100%" }}>
      {banner}
      <div className="obc-in" style={{
        background: OB.white, borderRadius: RADIUS.hero, border: `1px solid ${OB.line}`,
        padding: "var(--ob-pad)", maxInlineSize: "var(--content-max, 640px)",
        marginInline: "auto", boxShadow: "0 30px 70px -50px rgba(15,21,25,.4)",
      }}>
        {face ? (
          <div style={{ display: "flex", justifyContent: "center", marginBlockEnd: 22 }}>
            <AuraFace size="var(--ob-face)" />
          </div>
        ) : null}
        {children}
      </div>
      {footer}
    </div>
  </JourneyShell>
  );
};

/* ──────────────────────────────── page ──────────────────────────────────── */

const Onboarding = () => {
  usePageMeta({
    title: "Aura — Start your shelf",
    description: `${FULL_PICTURE_LINE}. Aura learns your sector, your level and the way you already write.`,
    path: "/onboarding",
  });
  const navigate = useNavigate();
  useEffect(() => { initThemeFromStorage(); }, []);
  /* An anonymous run started at /assessment is attached to the account in the
     boot path below — as a full hand-off, not a bare claim, so nothing the
     visitor answered is left behind. */

  const [checking, setChecking] = useState(true);
  /**
   * The anonymous run. A visitor who came through the quick read carries a
   * browser-held session token instead of a user_id. Everything the journey
   * would write to `diagnostic_profiles` is kept in that session row until the
   * account is opened at the reveal, and then claimed onto the new user_id.
   */
  const [anonToken, setAnonToken] = useState<string | null>(null);
  const anonStateRef = useRef<AssessmentState & Record<string, any>>({ answers: {} });
  /* The genuine start of the anonymous run, when the session gave us one. */
  const sessionStartedAtRef = useRef<string | null>(null);
  /* THE ARRIVAL — read once, on mount. Stale or absent means the journey
     behaves exactly as it always has. */
  const [arrival, setArrival] = useState<
    null | { first_name?: string | null; answers?: number; sliders?: number; captures?: number }
  >(() => {
    try {
      const raw = localStorage.getItem("aura_just_joined");
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (!e || typeof e.at !== "number" || Date.now() - e.at > 10 * 60 * 1000) return null;
      return e;
    } catch { return null; }
  });
  const [wallEmail, setWallEmail] = useState("");
  const [wallPassword, setWallPassword] = useState("");
  const [wallConsent, setWallConsent] = useState(false);
  const [wallBusy, setWallBusy] = useState(false);
  const [wallError, setWallError] = useState<string | null>(null);
  const [wallEmailError, setWallEmailError] = useState<string | null>(null);
  const [wallPasswordError, setWallPasswordError] = useState<string | null>(null);
  const [wallDone, setWallDone] = useState<string | null>(null);
  // The morning promise is only made when the system has actually been
  // delivering. Reads public.morning_promise_state; fails to the honest line.
  const mayPromiseMorning = useMayPromiseMorning();
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
  const screenRef = useRef(0);
  /** Where Back goes. Screens are pushed as they are left, popped on return. */
  const backStack = useRef<number[]>([]);
  /**
   * THE SILENT RESUME. Landing on step three with no word for it reads as a
   * bug. When the journey opens past step one, say so once — and offer the
   * way out. Shown for the resume, not for every step change after it.
   */
  const [resumedAt, setResumedAt] = useState<{ stage: number; readDone: boolean } | null>(null);
  const [resumeAsking, setResumeAsking] = useState(false);
  /** The reveal-endgame feedback question: rating + optional message. */
  const [revealRating, setRevealRating] = useState<number | null>(null);
  const [revealMessage, setRevealMessage] = useState("");


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
  /** Provenance of a cached read, so the visitor can see its age and refresh it. */
  const [readCache, setReadCache] = useState<{ generated_at: string; notice: string | null } | null>(null);
  const [sectorKnown, setSectorKnown] = useState(false);
  const [bandPicker, setBandPicker] = useState(false);
  const [cvUploads, setCvUploads] = useState(0);
  const [cvCrosscheck, setCvCrosscheck] = useState<unknown>(null);

  /* screen 5–7 */
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  /* one send at a time — a double tap used to capture the same link twice */
  const [sendingLink, setSendingLink] = useState(false);
  const sendingLinkRef = useRef(false);
  /* the read never left the building — never make them watch for nothing */
  const [linkFailed, setLinkFailed] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [suggested, setSuggested] = useState<{ url: string; title: string; summary?: string; source?: string; published_at?: string | null } | null>(null);
  const [suggestDead, setSuggestDead] = useState(false);
  const [readStep, setReadStep] = useState(0);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [captureSince, setCaptureSince] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const { claims: liveClaims, slow: claimsSlow } = useCapturedClaims({ userId, sinceIso: captureSince, active: watching });

  /* screen 9 */
  const [dims, setDims] = useState<Dimension[] | null>(null);
  /** The profile the work in state was built from. A different subject makes
   *  every downstream answer someone else's. */
  const subjectRef = useRef<string | null>(null);
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
  /* One rule for every question: select, see it selected, then Next. */
  const [singlePicked, setSinglePicked] = useState<string | null>(null);
  /* the last question index actually committed — a held Enter used to skip one */
  const committedQRef = useRef<number>(-1);
  const [proposals, setProposals] = useState<{ label: string; why: string }[] | null>(null);
  const [proposalsDead, setProposalsDead] = useState(false);

  /* the member's own figures — used to fill every wait */
  const [proof, setProof] = useState<PostProof | null>(null);
  /* one verbatim sentence of their own, shown back to them on the confirm screen */
  const [ownLine, setOwnLine] = useState<OwnSentence | null>(null);
  const [facts, setFacts] = useState<ProfileFacts | null>(null);
  /* screen 13 */
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [revealPending, setRevealPending] = useState(false);
  const [revealSlow, setRevealSlow] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectedName, setConnectedName] = useState<string | null>(null);

  /* A connection made in a previous visit must still read as connected after a
     reload — the tick came only from the popup message before this. */
  useEffect(() => {
    if (!userId) { setConnected(false); setConnectedName(null); return; }
    let alive = true;
    void (async () => {
      const { data } = await (supabase.from("linkedin_connections_safe" as any) as any)
        .select("display_name, status")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (!alive || !data) return;
      setConnected(true);
      setConnectedName((data as any).display_name ?? null);
    })();
    return () => { alive = false; };
  }, [userId]);

  /* 13b — when their day starts, so the overnight read lands at the right hour */
  const [dailyTime, setDailyTime] = useState<"Morning" | "Midday" | "Evening" | null>(null);
  const timeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time"; }
    catch { return "your local time"; }
  }, []);
  /* placeholder rotation for open text answers */
  const [phIdx, setPhIdx] = useState(0);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const paperMountRef = useRef<HTMLDivElement | null>(null);
  const [readRaw, setReadRaw] = useState<Record<string, any> | null>(null);
  /* The read is on its way from the database. Until it answers, the reveal
     screen shows a wait — never a claim about where the read is. */
  const [revealLoading, setRevealLoading] = useState(false);
  const [buildingReport, setBuildingReport] = useState(false);
  /* posting to LinkedIn — offered only where it can actually work */
  const [canPostToLinkedIn, setCanPostToLinkedIn] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postedUrl, setPostedUrl] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  /** The "Save it" row on screen 13 — collapsed until asked for. */
  /* The growth loop is not a secondary action — the share row is open on arrival. */
  const [saveOpen, setSaveOpen] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  /* the two things screen 13 needs: may we post, and what would we say */
  useEffect(() => {
    if (screen !== 13 || !userId) return;
    let alive = true;
    void (async () => {
      // The browser has no grant on access_token / can_post — asking for them
      // fails the whole query. An active connection is the answer.
      const { data } = await (supabase.from("linkedin_connections_safe" as any) as any)
        .select("status")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (alive) setCanPostToLinkedIn(!!data);
    })();
    return () => { alive = false; };
  }, [screen, userId]);
  useEffect(() => {
    if (screen !== 13) return;
    setCaptionDraft((c) => c || suggestedCaption(postsRead ?? 0));
  }, [screen, postsRead]);

  /* 3.5 — the cross-check runs exactly once, and we keep what it says.
     It never blocks progression: the member walks on, and if it fails or
     times out they simply see nothing. */

  /**
   * "Keep this for me" — the only wired Aura action on the cross-check.
   *
   * Signed in: one `evidence_fragments` row, parented by a `source_registry`
   * row upserted on (user_id, source_type, source_id) — the same shape
   * extract-evidence writes. No new columns.
   * Anonymous: held on the session exactly like `pending_captures` and
   * replayed once the account exists.
   */
  const keepCvEvidence = useCallback(async (
    ctx: { finding?: any; recommendation?: any },
  ): Promise<boolean> => {
    const f = ctx.finding;
    const r = ctx.recommendation;
    const title = String(f?.what || r?.action || "").trim();
    const content = String(f?.rewrite || f?.why_it_matters || r?.why_now || f?.what_you_lose || title).trim();
    if (!title || !content) {
      toast.error("That didn't save. Nothing else is lost — try again.");
      return false;
    }
    try {
      if (userId) {
        const sourceId = `cv-crosscheck:${userId}`;
        const { data: reg, error: regErr } = await (supabase.from("source_registry") as any)
          .upsert(
            {
              user_id: userId,
              source_type: "cv_crosscheck",
              source_id: sourceId,
              title: "Your CV against your profile",
              processed: true,
            },
            { onConflict: "user_id,source_type,source_id" },
          )
          .select("id")
          .single();
        if (regErr || !reg?.id) throw regErr ?? new Error("no registry row");

        /* Idempotent: the same finding never lands twice. */
        const { data: existing } = await (supabase.from("evidence_fragments") as any)
          .select("id")
          .eq("user_id", userId)
          .eq("source_registry_id", reg.id)
          .eq("title", title)
          .maybeSingle();
        if (!existing) {
          const { error: insErr } = await (supabase.from("evidence_fragments") as any).insert({
            user_id: userId,
            source_registry_id: reg.id,
            fragment_type: "insight",
            title,
            content,
            metadata: { source: "cv_crosscheck", source_title: "Your CV against your profile" },
          });
          if (insErr) throw insErr;
        }
      } else if (anonToken) {
        const held = ((anonStateRef.current as any).pending_evidence ?? []) as any[];
        if (!held.some((e) => e?.title === title)) {
          anonStateRef.current = {
            ...anonStateRef.current,
            pending_evidence: [...held, { title, content, source: "cv_crosscheck", at: new Date().toISOString() }],
          } as any;
          const ok = await saveSession(anonToken, anonStateRef.current);
          if (!ok) throw new Error("session save failed");
        }
      } else {
        throw new Error("nowhere to keep this");
      }
      toast.success("Kept. Aura will use this when it writes for you.");
      return true;
    } catch (e) {
      console.error("[journey] keep cv evidence failed", e);
      toast.error("That didn't save. Nothing else is lost — try again.");
      return false;
    }
  }, [userId, anonToken]);

  /* loop safety valve — kept from the previous journey */
  const [visits, setVisits] = useState(0);
  /* step 1 never navigates: it reads in place, then becomes the result card */
  const [step1Phase, setStep1Phase] = useState<"ask" | "reading" | "result">("ask");
  /* A run boundary is an event, not something inferred from stage names. */
  /* One id per run, minted HERE so the tab can watch the run before the work
     starts. A new id is a new run: the panel's floor and counter reset with it. */
  const [readRunId, setReadRunId] = useState<string | null>(null);
  const [captureRunId, setCaptureRunId] = useState<string | null>(null);
  const [revealRunId, setRevealRunId] = useState<string | null>(null);

  /* THE TICK CHANNEL. What each panel draws is what the edge function has
     actually recorded — subscribed live, backfilled on open, never guessed
     from a local boolean. The signed-in LinkedIn read is two uninstrumented
     readers, so that surface renders ONE stage rather than a list that cannot
     tick (see screen 1). */
  const captureRun = useRunStages("capture_ingest", captureRunId, { active: capturePending, anonToken });
  const marketRun = useRunStages("market_read", revealRunId, { active: revealPending, anonToken });
  /* the inline confirmation shown for a moment when they choose Finish later */
  const [exitNote, setExitNote] = useState<string>("");
  useEffect(() => {
    try {
      const k = "aura_onboarding_visits";
      const n = Number(sessionStorage.getItem(k) || "0") + 1;
      sessionStorage.setItem(k, String(n));
      setVisits(n);
    } catch { /* ignore */ }
  }, []);

  /* ── progress: a closed tab loses nothing ── */
  /**
   * One writer for the member's profile row.
   *
   * PostgREST answers `.update().eq()` that matches zero rows with HTTP 204 and
   * no error, so an entire journey once wrote into a row that did not exist and
   * every try/catch passed. Every write here upserts on `user_id`, returns its
   * rows, drops nulls so it can never blank a column it does not name, and
   * logs loudly when it affects nothing.
   */
  const writeProfile = useCallback(async (
    patch: Record<string, any>,
    label: string,
    uid?: string | null,
    /**
     * THE ONLY WAY TO NULL A COLUMN. A null inside `patch` is dropped, so a
     * partial write can never blank a column it does not mean to. A column
     * named here is cleared deliberately — the subject-change reset is the one
     * caller that must actually empty the row.
     */
    clearKeys?: string[],
  ): Promise<boolean> => {
    const id = uid ?? userId;
    const clears = (clearKeys ?? []).filter(Boolean);
    if (!id) {
      // Anonymous run: the same facts are kept on the session row and written
      // to diagnostic_profiles once the account exists and claims the run.
      if (!anonToken) return false;
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== null) clean[k] = v;
      for (const k of clears) clean[k] = null;
      anonStateRef.current = {
        ...anonStateRef.current,
        /* Stamped with the address this run is about, so a later run against a
           different profile can never inherit this one's level or sector. */
        profile: {
          ...((anonStateRef.current as any).profile ?? {}),
          ...clean,
          profile_url: (anonStateRef.current as any).profile_url ?? null,
        },
      };
      return saveSession(anonToken, anonStateRef.current);
    }
    // The journey never clears a column it does not name, so nulls are dropped
    // before the shared writer sees them — except the ones named in clearKeys.
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== null) clean[k] = v;
    for (const k of clears) clean[k] = null;
    return upsertProfile(id, clean, `journey ${label}`);
  }, [userId, anonToken]);

  /**
   * The one reveal feedback question. Optional, never blocks the journey.
   * Anonymous runs keep it on the session row and replay it at hand-off.
   */
  const handleRevealFeedback = useCallback(async (rating: number, message: string) => {
    setRevealRating(rating);
    if (!userId) {
      anonStateRef.current.reveal_feedback = { rating, message };
      if (anonToken) await saveSession(anonToken, anonStateRef.current);
      return;
    }
    await supabase.from("beta_feedback").upsert({
      user_id: userId,
      feedback_type: "reveal",
      rating,
      message: message || null,
      page: "/onboarding",
    });
  }, [userId, anonToken]);

  /**
   * THE HAND-OFF — the anonymous run becomes the account's run.
   *
   * One sequence, called from two places: the account wall, and the boot path
   * when a signed-in member still carries an unclaimed token (a run orphaned
   * by the old verification loop). It persists first, so nothing can be lost
   * even if the read itself fails.
   */
  const handoffAnonRun = useCallback(async (opts: {
    token: string;
    uid: string;
    accessToken: string;
    state: AssessmentState & Record<string, any>;
    startedAt?: string | null;
  }): Promise<{ ok: boolean; code?: "claim" }> => {
    const { token, uid, accessToken } = opts;
    const claimed = await claimSession(token);
    if (!claimed.ok && claimed.code !== "NO_CLAIMABLE_SESSION") return { ok: false, code: "claim" };
    const st = (opts.state ?? {}) as AssessmentState & Record<string, any>;
    const pf = (st as any).profile ?? {};
    const patch: Record<string, any> = {};
    for (const k of ["first_name", "last_name", "firm", "sector_focus", "level", "seniority_band", "skill_ratings"]) {
      if (pf[k] !== undefined && pf[k] !== null) patch[k] = pf[k];
    }
    if (Object.keys(patch).length) await upsertProfile(uid, patch, "journey anon handoff");
    /* THE ADDRESS SURVIVES THE WALL. The address typed on screen 1 lived only
       on the anonymous session row; without this write the read has no handle
       to find the mirror read on, and the reveal comes back empty. One writer
       owns that table — the same helper the signed-in path uses — and it
       upserts, so a member who already has a row is unaffected. Awaited before
       the read, and never allowed to break the hand-off. */
    try {
      const addr = (st as any).profile_url ?? pf.profile_url ?? null;
      if (addr) await saveLinkedInAddress(uid, String(addr));
    } catch (e) { console.error("[journey] linkedin address handoff failed", e); }
    /* The transient CV comparison moves onto the profile. The CV itself was
       discarded when it was read, so only the result travels. */
    try {
      const cc = (st as any).cv_crosscheck;
      if (cc) {
        await upsertProfile(uid, { cv_crosscheck: cc, cv_crosscheck_at: new Date().toISOString() }, "journey anon cv crosscheck");
        try { localStorage.setItem("aura_cv_was_transient", "1"); } catch { /* private mode */ }
      }
    } catch (e) { console.error("[journey] cv crosscheck handoff failed", e); }
    await upsertProfile(
      uid,
      { onboarding_step: 3, identity_intelligence: { journey_screen: 12, read_done: true } },
      "journey anon handoff step",
    );
    try { localStorage.setItem(`aura_ob_screen_${uid}`, "12"); } catch { /* private mode */ }
    if (st.answers && Object.keys(st.answers).length) await saveAnswers(uid, st.answers);
    /* Replay any links captured while anonymous — never block the redirect. */
    try {
      const pending = ((st as any).pending_captures ?? []) as Array<{ url: string; title?: string | null; summary?: string | null }>;
      for (const c of pending) {
        if (!c?.url) continue;
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            type: "link", content: c.url, source_url: c.url,
            metadata: { title: c.title ?? undefined, summary: c.summary ?? undefined, source: "onboarding_collection" },
          }),
        });
      }
    } catch (e) {
      console.error("[journey] capture replay failed", e);
    }
    /* Replay anything they asked Aura to keep from the CV cross-check. */
    try {
      const keptItems = ((st as any).pending_evidence ?? []) as Array<{ title: string; content: string }>;
      if (keptItems.length) {
        const { data: reg } = await (supabase.from("source_registry") as any)
          .upsert(
            { user_id: uid, source_type: "cv_crosscheck", source_id: `cv-crosscheck:${uid}`, title: "Your CV against your profile", processed: true },
            { onConflict: "user_id,source_type,source_id" },
          )
          .select("id")
          .single();
        if (reg?.id) {
          await (supabase.from("evidence_fragments") as any).insert(
            keptItems.filter((k) => k?.title && k?.content).map((k) => ({
              user_id: uid,
              source_registry_id: reg.id,
              fragment_type: "insight",
              title: k.title,
              content: k.content,
              metadata: { source: "cv_crosscheck", source_title: "Your CV against your profile" },
            })),
          );
        }
      }
    } catch (e) {
      console.error("[journey] kept evidence replay failed", e);
    }
    /* Replay the optional reveal feedback collected while anonymous. */
    try {
      const fb = (st as any).reveal_feedback;
      if (fb?.rating != null) {
        await supabase.from("beta_feedback").upsert({
          user_id: uid,
          feedback_type: "reveal",
          rating: fb.rating,
          message: fb.message || null,
          page: "/onboarding",
        });
      }
    } catch (e) {
      console.error("[journey] reveal feedback handoff failed", e);
    }
    try {
      await generateMarketRead(uid, (st.answers ?? {}), (pf.sector_focus ?? null), (pf.seniority_band ?? null));
    } catch (e) {
      console.error("[journey] handoff read failed", e);
    }
    /* THE ARRIVAL — record only what they genuinely gave us. Written before
       the token goes, because the token is what proves the run. */
    try {
      const entry: Record<string, unknown> = {
        at: Date.now(),
        first_name: pf.first_name ?? null,
        answers: Object.keys(st.answers ?? {}).length,
        sliders: Object.keys((pf.skill_ratings ?? {}) as Record<string, unknown>).length,
        captures: Array.isArray((st as any).pending_captures) ? (st as any).pending_captures.length : 0,
      };
      /* NO DURATION. The only clock we hold is the session's created_at, which
         is wall-clock — it counts the hours the browser sat closed. A number
         nobody earned may not ship, and engaged time is not recorded anywhere,
         so the figure is deleted rather than approximated. */
      localStorage.setItem("aura_just_joined", JSON.stringify(entry));
    } catch { /* private mode — the arrival is a grace, not a gate */ }
    clearToken();
    return { ok: true };
  }, []);

  const persistScreen = useCallback(async (next: number) => {
    if (!userId && anonToken) {
      anonStateRef.current = { ...anonStateRef.current, journey_screen: next };
      try { localStorage.setItem("aura_ob_screen_anon", String(next)); } catch { /* ignore */ }
      await saveSession(anonToken, anonStateRef.current);
      return;
    }
    if (!userId) return;
    try { localStorage.setItem(`aura_ob_screen_${userId}`, String(next)); } catch { /* ignore */ }
    try {
      /* RACE: identity_intelligence is a whole-object write. A second tab or an
         Edge Function writing during onboarding can be clobbered. We cannot do a
         server-side jsonb merge from the client, so we read immediately before the
         write and merge ONLY the journey keys this function owns — never state
         captured earlier in the component. */
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("identity_intelligence").eq("user_id", userId).maybeSingle();
      const fresh = ((data as any)?.identity_intelligence as Record<string, any>) || {};
      await writeProfile({
        identity_intelligence: { ...fresh, journey_screen: next },
        onboarding_step: Math.min(3, Math.max(0, Math.floor(next / 4))),
      }, "progress save");
    } catch (e) { console.error("[journey] progress save threw", e); }
  }, [userId, anonToken, writeProfile]);

  /** How many history entries this journey has pushed. Never go below zero. */
  const pushed = useRef(0);
  /** The screen behind this one when the stack is empty, handed to `popstate`. */
  const pendingFallback = useRef<number | undefined>(undefined);

  const go = useCallback((next: number) => {
    if (next !== screenRef.current) backStack.current.push(screenRef.current);
    setScreen(next);
    screenRef.current = next;
    void track("onboarding_step", { step: `screen_${next}`, step_index: next });
    void persistScreen(next);
    /* The browser's own back button moves one STEP, never out of the flow. */
    try { window.history.pushState({ obScreen: next }, ""); pushed.current += 1; } catch { /* ignore */ }
    try { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); } catch { /* ignore */ }
  }, [persistScreen]);

  /* Back from the account step with a CV still to add: land on the CV screen. */
  const cvReturnRef = useRef(false);
  useEffect(() => {
    if (checking || !userId || cvReturnRef.current) return;
    let wanted = false;
    try { wanted = new URLSearchParams(window.location.search).get("cv") === "1"; } catch { /* ignore */ }
    if (!wanted) return;
    cvReturnRef.current = true;
    go(CV_SCREEN);
    try { window.history.replaceState({}, "", "/onboarding"); } catch { /* ignore */ }
  }, [checking, userId, go]);

  /**
   * THE ONE MOVER. Whoever asks to go back — the in-page control or the
   * browser — the position changes in exactly one place, `applyBack`, and the
   * history stack is consumed at the same time. In-page Back used to move the
   * screen WITHOUT consuming its history entry, so one browser Back afterwards
   * moved two screens and the N+1th ejected the member from the site.
   */
  const applyBack = useCallback((fallback?: number) => {
    /* An empty stack is a deep link or a resume — never a dead button. The
       caller names the screen that sits behind this one. */
    const popped = backStack.current.pop();
    const prev = popped ?? fallback;
    if (prev === undefined) return;
    setScreen(prev);
    screenRef.current = prev;
    void persistScreen(prev);
    try { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); } catch { /* ignore */ }
  }, [persistScreen]);

  /**
   * Back — one step, with everything the member typed still in state. Nothing
   * is re-fetched and nothing is cleared; only the screen number moves. When
   * this journey owns a history entry we hand the move to the browser and let
   * `popstate` do it, so the two can never disagree.
   */
  const goBack = useCallback((fallback?: number) => {
    if (pushed.current > 0) {
      pendingFallback.current = fallback;
      try { window.history.back(); return; } catch { /* fall through */ }
      pendingFallback.current = undefined;
    }
    applyBack(fallback);
  }, [applyBack]);
  const canBack = backStack.current.length > 0;


  /**
   * Screen 0 back — the member came here from their read on /assessment.
   * Assessment's boot effect bounces `step === "onboarding"` straight back
   * here, so the saved step is REWOUND to "read_open" first (STEP_TO_STAGE
   * maps "read_open" → the "read" stage, landing them straight on the read
   * card with no extra click) and only then do we navigate. Nothing else
   * on the session is touched, and a failed write means no navigation.
   */
  const backToRead = useCallback(async () => {
    if (!anonToken) return;
    const found = await loadSession(anonToken);
    const base = (found?.state ?? anonStateRef.current ?? {}) as AssessmentState & Record<string, any>;
    if (!base?.read) return;
    const next = { ...base, step: "read_open" };
    const ok = await saveSession(anonToken, next);
    if (!ok) return;                       // never send them somewhere that bounces
    anonStateRef.current = next as any;
    navigate("/assessment");
  }, [anonToken, navigate]);

  /* ── boot ── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        /* No account is not the same as no visitor. A valid anonymous session
           token walks the whole journey; only a missing or dead token sends
           anyone to the door. */
        const held = readToken();
        const found = held ? await loadSession(held) : null;
        if (!held || !found) { navigate("/auth?next=%2Fonboarding", { replace: true }); return; }
        setAnonToken(held);
        const st = (found.state ?? {}) as any;
        sessionStartedAtRef.current = found.created_at ?? null;
        anonStateRef.current = { answers: {}, ...st };
        const pf = (st.profile ?? {}) as any;
        /* P7 — a fresh visitor must never see a previous run's level or sector.
           Identity is hydrated only when it belongs to the address this session
           actually read. */
        const sameSubject = !pf.profile_url || !st.profile_url || pf.profile_url === st.profile_url;
        if (!sameSubject) {
          Object.assign(anonStateRef.current as any, { profile: { profile_url: st.profile_url } });
        }
        if (sameSubject) {
        if (pf.first_name) setFirstName(pf.first_name);
        if (pf.last_name) setLastName(pf.last_name);
        if (pf.firm) setFirm(pf.firm);
        if (pf.sector_focus) { setSector(pf.sector_focus); setSectorKnown(true); }
        if (pf.level) setLevelTitle(pf.level);
        if (pf.seniority_band) setBand(pf.seniority_band as Band);
        if (pf.skill_ratings && typeof pf.skill_ratings === "object") setScores(pf.skill_ratings);
        }
        if (st.answers && typeof st.answers === "object") setAnswers(st.answers);
        /* The capture payoff survives a reload: the fragments Aura pulled out
           of their link are held on the session, not only in memory. */
        if (Array.isArray(st.capture_fragments) && st.capture_fragments.length) {
          setClaims(st.capture_fragments as Claim[]);
        }
        if (st.profile_url) { setLiInput(st.profile_url); subjectRef.current = normaliseLinkedIn(st.profile_url); }
        /* The quick read already happened at /assessment — never ask twice. */
        if (st.read) {
          setStep1Phase("result");
          setReadDone(true);
          setPostsRead(Number(st.posts_read ?? 0));
        }
        if (st.name && !firstName) {
          const parts = String(st.name).split(/\s+/);
          setFirstName(parts[0] || "");
          if (parts.length > 1) setLastName(parts.slice(1).join(" "));
        }
        let back = Number(st.journey_screen ?? 0);
        try {
          const local = Number(localStorage.getItem("aura_ob_screen_anon") ?? "0");
          if (local > back) back = local;
        } catch { /* ignore */ }
        /* CV_SCREEN is its own resume target — a member who paused on the CV
           step must not be sent back to the address card they finished. */
        if (back === 2 || back === 3) back = 1;
        if (back === TRUST_SLIDERS_SCREEN) back = 8; /* retired gate */
        if (back === 4) back = 5; /* the interstitial is gone */
        /* A reload mid-read goes back to the link step — unless the payoff
           already exists, in which case they land on it. */
        if (back === 6 || back === 7) {
          back = (Array.isArray(st.capture_fragments) && st.capture_fragments.length) ? 7 : 5;
        }
        /* Back to the question they were on, not to question one. */
        {
          let qi = Number(st.q_idx ?? 0);
          let di = Number(st.dim_idx ?? 0);
          try {
            const lq = Number(localStorage.getItem("aura_ob_q_anon") ?? "0");
            if (lq > qi) qi = lq;
            const ld = Number(localStorage.getItem("aura_ob_dim_anon") ?? "0");
            if (ld > di) di = ld;
          } catch { /* ignore */ }
          if (Number.isFinite(qi) && qi > 0) setQIdx(qi);
          if (Number.isFinite(di) && di > 0) setDimIdx(di);
        }
        if (back > 0 && (back <= 14 || back === MANUAL_SCREEN)) {
          setScreen(back); screenRef.current = back;
          if (stageOf(back) > 1) setResumedAt({ stage: stageOf(back), readDone: Boolean(st.read) });
        }
        setChecking(false);
        return;
      }
      const uid = session.user.id;
      setUserId(uid);
      setUserEmail(session.user.email ?? null);
      void ensureTimezone(uid);

      /* RESCUE — a run that was walked anonymously and never attached. The
         token is still in the browser; the session row still has no owner. The
         same hand-off the wall runs is run here, then the journey reloads onto
         the reveal instead of starting again from nothing. */
      const orphan = readToken();
      if (orphan) {
        try {
          /* (a) Never hijack a healthy account. If this member has already
             moved past the journey, the token is a leftover — drop it. */
          const { data: guardRow } = await (supabase.from("diagnostic_profiles" as any) as any)
            .select("onboarding_step, onboarding_completed")
            .eq("user_id", uid)
            .maybeSingle();
          const progressed = Boolean((guardRow as any)?.onboarding_completed)
            || Number((guardRow as any)?.onboarding_step ?? 0) >= 3;
          if (progressed) { clearToken(); throw new Error("SKIP_RESCUE"); }
          /* (b) get_assessment_session only ever returns a row whose user_id
             is null, so a returned session is genuinely unowned. */
          const found = await loadSession(orphan);
          const st = (found?.state ?? {}) as AssessmentState & Record<string, any>;
          const hasWork = Boolean(st.read) || Object.keys(st.answers ?? {}).length > 0;
          if (found && hasWork) {
            const res = await handoffAnonRun({
              token: orphan,
              uid,
              accessToken: session.access_token,
              state: st,
              startedAt: found.created_at ?? null,
            });
            if (res.ok) { window.location.replace("/onboarding"); return; }
          } else if (found === null) {
            clearToken();
          }
        } catch (e) {
          if ((e as Error)?.message !== "SKIP_RESCUE") console.error("[journey] orphan rescue failed", e);
        }
      }

      const passwordSet = Boolean((session.user.user_metadata as any)?.password_set);
      let confirmed = false;
      try { confirmed = sessionStorage.getItem(`aura_identity_confirmed_${uid}`) === "true"; } catch { /* ignore */ }
      if (!passwordSet && !confirmed) setNeedsIdentityConfirm(true);
      else if (!passwordSet) setNeedsPassword(true);

      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("first_name, last_name, firm, sector_focus, level, seniority_band, answered_band, onboarding_step, skill_ratings, brand_assessment_answers, identity_intelligence, journey_reset_at")
        .eq("user_id", uid)
        .maybeSingle();
      const p: any = profile || {};

      /* A reset on the server must never leave a stale journey in the browser. */
      if (sweepIfServerReset(p.journey_reset_at)) {
        if (!passwordSet) setNeedsIdentityConfirm(true);
      }

      /* Belt and braces: a trigger creates this row on signup, but anyone who
         predates it would otherwise spend the whole journey writing into
         nothing. No row means make one, here, before anything else is saved. */
      if (!profile) {
        const { error: makeError } = await (supabase.from("diagnostic_profiles" as any) as any)
          .insert({ user_id: uid });
        if (makeError) console.error("[journey] could not create the profile row", makeError);
      }

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
      /* P1 — answers must be in hand before any resume into the instrument.
         Without this, `advance` rebuilds the set from {} and the save wipes
         everything answered before the reload. */
      let hydratedAnswers = (p.brand_assessment_answers && typeof p.brand_assessment_answers === "object")
        ? (p.brand_assessment_answers as Record<string, string>) : {};
      /* THE BAND GUARD. Answer keys carry the prompt, and the prompts differ by
         band. A member who changes band would otherwise accumulate two sets and
         feed the stale one to the read. The band that produced the answers is
         stamped beside them, so a change discards the whole set. */
      const answeredBand = (p as any).answered_band ?? null;
      if (answeredBand && p.seniority_band && answeredBand !== p.seniority_band
        && Object.keys(hydratedAnswers).length) {
        hydratedAnswers = {};
        void upsertProfile(uid, { brand_assessment_answers: null, answered_band: null }, "band change answer reset");
      }
      setAnswers(hydratedAnswers);
      const hasAnswers = Object.keys(hydratedAnswers).length > 0;
      const hasScores = Boolean(p.skill_ratings && typeof p.skill_ratings === "object"
        && Object.keys(p.skill_ratings as Record<string, number>).length > 0);

      let resume = Number((p.identity_intelligence as any)?.journey_screen ?? 0);
      try {
        const local = Number(localStorage.getItem(`aura_ob_screen_${uid}`) ?? "0");
        if (local > resume) resume = local;
      } catch { /* ignore */ }
      /* screens 2 and 3 folded into step 1 — a resume there lands on the address
         card with the address already filled, so nothing Aura read is lost. */
      /* CV_SCREEN keeps its own place: pausing on the CV step and coming back
         to the address card is a step the member already finished. */
      if (resume === 2 || resume === 3) resume = 1;
      if (resume === TRUST_SLIDERS_SCREEN) resume = 8; /* retired gate */
      if (resume === 4) resume = 5; /* the interstitial is gone */
      if (resume <= CV_SCREEN) {
        try {
          const addr = await loadLinkedInAddress(uid);
          if (addr.profileUrl) { setLiInput(addr.profileUrl); subjectRef.current = normaliseLinkedIn(addr.profileUrl); }
          /* NEVER ASK TWICE. read_done is the one readiness flag in the flow;
             a mirror_reads row for the same address proves the same thing when
             the flag predates it. Pre-filling the field was not enough — a
             member whose read exists was still shown "Read my profile". */
          if (addr.profileUrl) {
            let done = Boolean((p.identity_intelligence as any)?.read_done);
            let posts: number | null = null;
            if (addr.handle) {
              try {
                const { data: mr } = await (supabase.from("mirror_reads" as any) as any)
                  .select("posts_read").eq("handle", addr.handle.toLowerCase()).maybeSingle();
                if (mr) { done = true; posts = Number((mr as any).posts_read ?? 0); }
              } catch { /* the flag alone still answers */ }
            }
            if (done) {
              setStep1Phase("result");
              setReadDone(true);
              if (posts !== null) setPostsRead(posts);
            }
          }
        } catch { /* ignore */ }
      }
      /* A reload on the reading screens loses the in-memory claims watch, so the
         screen would sit there forever. Read what was actually kept instead. */
      if (resume === 6 || resume === 7) {
        /* A throw here used to skip setChecking(false) and leave the journey on
           a permanent spinner. Falling back to screen 5 loses nothing. */
        try {
          const { data } = await (supabase.from("evidence_fragments" as any) as any)
            .select("title, content, confidence").eq("user_id", uid)
            .order("confidence", { ascending: false }).limit(3);
          if (data?.length) { setClaims(data as any); resume = 7; } else { resume = 5; }
        } catch { resume = 5; }
      }
      try {
        /* The saved value is authoritative — a member who stepped back must not
           be thrown forward past the question they went back to. */
        const lq = Number(localStorage.getItem(`aura_ob_q_${uid}`) ?? "0");
        setQIdx(hasAnswers && Number.isFinite(lq) && lq > 0 ? lq : 0);
        const ld = Number(localStorage.getItem(`aura_ob_dim_${uid}`) ?? "0");
        setDimIdx(hasScores && Number.isFinite(ld) && ld > 0 ? ld : 0);
      } catch { /* ignore */ }
      if (resume > 0 && (resume <= 14 || resume === MANUAL_SCREEN)) {
        setScreen(resume); screenRef.current = resume;
        if (stageOf(resume) > 1) {
          setResumedAt({
            stage: stageOf(resume),
            readDone: Boolean((p.identity_intelligence as any)?.read_done ?? p.sector_focus),
          });
        }
      }

      setChecking(false);
    })();
  }, [navigate]);

  /* ── screen 1: read the profile — in place, never leaving the card ── */
  const readProfile = async (force = false) => {
    setLiError("");
    setReadDone(false);
    setReadCache(null);
    setPostsRead(null);
    setOwnWords(null);
    const profile_url = normaliseLinkedIn(liInput);
    if (!profile_url) {
      setLiError("Aura couldn't open that page. Check it matches what you see in your browser on your own profile.");
      return;
    }
    setLiBusy(true);
    const liRunId = newRunId();
    setReadRunId(liRunId);
    setStep1Phase("reading");
    try {
      /**
       * ONE READ, ONE PLACE. `/assessment` owns the public read — the address
       * card, the error copy, the retry. Onboarding screen 1 is a read-only
       * confirmation of what that read found, so a visitor without an account
       * is sent back to the surface that does the job.
       */
      if (!userId) {
        setLiBusy(false);
        setStep1Phase(((anonStateRef.current as any)?.read) ? "result" : "ask");
        await backToRead();
        return;
      }
      if (userId) { try { await saveLinkedInAddress(userId, profile_url); } catch { /* saved again later */ } }
      // Both reads start at the same moment. Running them one after the other
      // was most of the wait, and the posts read never needed the profile.
      const profilePromise = supabase.functions.invoke("linkedin-fetch-profile", { body: { profile_url } });
      const postsPromise = supabase.functions.invoke("linkedin-fetch-posts", { body: { profile_url, max_posts: 50 } })
        .catch(() => ({ data: null } as any));
      const { data, error } = await profilePromise;
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      const prof: any = (data as any)?.profile ?? data;
      setLiProfile(prof);

      /* A DIFFERENT SUBJECT MAKES THE OLD WORK SOMEONE ELSE'S. Reading a new
         profile mid-journey used to leave the previous person's strengths,
         answers and read sitting in state and on the row. */
      if (subjectRef.current && subjectRef.current !== profile_url) {
        const hadWork = Object.keys(scores).length > 0 || Object.keys(answers).length > 0 || !!reveal;
        setScores({}); setAnswers({}); setReveal(null); setDimIdx(0); setQIdx(0);
        setClaims([]);
        try { localStorage.removeItem(`aura_ob_dim_${userId}`); localStorage.removeItem(`aura_ob_q_${userId}`); } catch { /* ignore */ }
        /* These four columns must actually be emptied on the row, not merely in
           state — otherwise the next resume hydrates the last subject's work
           straight back in. `clearKeys` is the deliberate null. */
        await writeProfile({}, "subject change reset", undefined, [
          "brand_assessment_answers", "answered_band", "skill_ratings", "audit_results",
        ]);
        if (hadWork) toast("That's a different profile — Aura has cleared the strengths and answers from the last one.");
      }
      subjectRef.current = profile_url;

      const readSector = String(prof?.sector || prof?.industry || "").trim();
      // The read first; failing that, what the headline, skills and about say.
      const guessed = readSector || inferSector({
        headline: prof?.headline,
        topSkills: prof?.top_skills || prof?.raw?.topSkills || [],
        about: prof?.about || prof?.raw?.about,
      }) || "";
      if (!sector && guessed) {
        setSector(guessed);
        setSectorKnown(true);
        if (userId) {
          try {
            await writeProfile({ sector_focus: guessed }, "sector save");
          } catch { /* the member can change it on the next screen */ }
        }
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
            /* Never write over a level the member set or confirmed themselves. */
            const { data: cur } = await (supabase.from("diagnostic_profiles" as any) as any)
              .select("band_source").eq("user_id", userId).maybeSingle();
            const src = String((cur as any)?.band_source ?? "");
            if (src !== "corrected" && src !== "confirmed") {
              setBand(b);
              await writeProfile({ seniority_band: b, band_source: "detected" }, "level save");
            }
          }
        } catch { /* the member confirms it on the next screen anyway */ }
      }

      // The profile is back, so the card can become the result now — the posts
      // count fills in underneath when it lands. Nothing waits on it.
      setStep1Phase("result");
      setLiBusy(false);

      const [, postsSettled] = await Promise.allSettled([profilePromise, postsPromise]);
      const postData = postsSettled.status === "fulfilled" ? (postsSettled.value as any)?.data : null;
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
      /* the read failing never moves them: the field, the error and the manual path all stay here */
      returnToAddress(
        msg && msg.length < 120
          ? "Aura couldn't open that page. Check it matches what you see in your browser on your own profile."
          : "Aura couldn't open that page. Check it matches what you see in your browser on your own profile.",
      );
    } finally {
      setLiBusy(false);
    }
  };

  /** Return to the address card without losing anything already read. */
  const returnToAddress = useCallback((error?: string) => {
    setLiError(error ?? "");
    setStep1Phase("ask");
    if (error && screenRef.current !== 1) {
      toast.error(error, {
        action: { label: "Try again", onClick: () => go(1) },
        duration: 8000,
      });
    }
  }, []);

  /* ── the read resolves line by line, in place on the step-1 card ── */
  const reading = screen === 1 && step1Phase !== "ask";
  const upPosts = useCountUp(reading && postsRead ? postsRead : 0, { duration: 900 });
  const upWords = useCountUp(reading && ownWords ? ownWords : 0, { duration: 1100 });

  /* ── the suggested read: asked for on screen 4 so it has a head start ── */
  const suggestRan = useRef(false);
  useEffect(() => {
    if (screen < 4 || suggestRan.current) return;
    /* An anonymous visitor gets the same suggestion: the session token stands
       in for the account, exactly as onboarding-proposals already does. */
    if (!userId && !anonToken) return;
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
        ...(userId ? {} : { token: anonToken }),
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
  }, [screen, sector, firm, band, liProfile, userId, anonToken]);

  /* ── screen 5/6: send the link, then watch for what came out of it ── */
  const submitLink = () => {
    const v = linkInput.trim();
    if (!v) return;
    if (sendingLinkRef.current) return;
    if (!/^https?:\/\/\S+\.\S+/i.test(v)) {
      setLinkError("That needs to be a web link, starting with https://");
      return;
    }
    setLinkError(null);
    void sendLink(v);
  };

  const sendLink = async (url: string, meta?: { title?: string; summary?: string }) => {
    const v = url.trim();
    if (!v) return;
    if (sendingLinkRef.current) return;
    sendingLinkRef.current = true;
    setSendingLink(true);
    const startIso = new Date(Date.now() - 10000).toISOString();
    /* Minted before the work is asked for, so the tick channel is already open
       when the first stage mark lands. */
    const capRunId = newRunId();
    setCaptureRunId(capRunId);
    setReadStep(0);
    setLinkFailed(false);
    go(6);

    let sent = false;
    let anonRead = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 25000);
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              type: "link", content: v, source_url: v, run_id: capRunId,
              metadata: { title: meta?.title, summary: meta?.summary, source: "onboarding_collection" },
            }),
            signal: ctrl.signal,
          });
          sent = res.ok;
        } finally { window.clearTimeout(to); }
      } else if (anonToken) {
        /* No account is our gap, not their bad link — keep it and replay it at
           hand-off, which is what writes the durable evidence rows. */
        anonStateRef.current = {
          ...anonStateRef.current,
          pending_captures: [
            ...(((anonStateRef.current as any).pending_captures) ?? []),
            { url: v, title: meta?.title ?? null, summary: meta?.summary ?? null, at: new Date().toISOString() },
          ],
        };
        await saveSession(anonToken, anonStateRef.current);
        /* D-12: an anonymous member gets the same payoff as a signed-in one.
           The link is read here and now, and what came out of it is shown. */
        setReadStep(1);
        anonRead = true;
      }
    } catch { sent = false; /* aborted or offline — nothing was written */ }
    sendingLinkRef.current = false;
    setSendingLink(false);

    if (anonRead && anonToken) {
      let got: Claim[] = [];
      let src: { url: string; title: string | null } | null = null;
      try {
        /* verify_jwt = false removes JWT verification, not the gateway's
           apikey requirement. Without these two headers every anonymous
           read 401s and the member never sees a fragment. */
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 25000);
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-read-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
            body: JSON.stringify({ token: anonToken, url: v, title: meta?.title, summary: meta?.summary, run_id: capRunId }),
            signal: ctrl.signal,
          });
          const out = await res.json().catch(() => ({}));
          if (res.ok && out?.ok && Array.isArray(out.fragments)) {
            got = (out.fragments as Claim[]).filter((f) => f?.title);
            src = { url: v, title: (out.title as string) ?? meta?.title ?? null };
          }
        } finally { window.clearTimeout(to); }
      } catch { /* handled below — never a dead end */ }
      if (got.length) {
        /* The function writes both keys server-side; carry both here so the
           next client saveSession cannot drop capture_source. */
        anonStateRef.current = {
          ...anonStateRef.current,
          capture_fragments: got,
          ...(src ? { capture_source: src } : {}),
        } as any;
        await saveSession(anonToken, anonStateRef.current);
        setClaims(got);
        setReadStep(2);
        go(7);
      } else {
        /* Nothing could be pulled out here. Say so — never skip the beat. */
        setCapturePending(true);
      }
      return;
    }

    if (!sent) {
      /* nothing will ever land — don't make them watch a 120s ceiling for it */
      setLinkFailed(true);
      return;
    }
    setReadStep(1);
    setCaptureSince(startIso);
    setWatching(true);
  };

  /* the hook does the waiting — we only react when the claims land */
  useEffect(() => {
    if (liveClaims.length === 0) return;
    setClaims(liveClaims as Claim[]);
    setWatching(false);
    /* If they've already moved on, take the claims quietly — never yank them back. */
    if (screenRef.current === 6) {
      /* The claims landing IS the completion event. Nothing here is timed. */
      setReadStep(2);
      go(7);
    }
  }, [liveClaims]);

  /* ── content resolution: exact, then the sector-free set, then a retry ── */
  const loadDimensions = useCallback(async () => {
    if (!band) { setContentError(false); return; }
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
    if (!band) { setContentError(false); return; }
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
        body: {
          claims: claims.map((c) => c.title),
          sector: sector || null,
          level: levelTitle || null,
          /* anonymous run: the read already on file stands in for the posts */
          ...(userId ? {} : anonToken ? { token: anonToken } : {}),
        },
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
  }, [screen, questions, qIdx, proposals, proposalsDead, claims, sector, levelTitle, userId, anonToken]);

  /* ── autosave after every slider ──
     Existing members keep whatever keys are already on file: new answers are
     MERGED in alongside them, never written over the top of the object. */
  const saveScores = useCallback(async (next: Record<string, number>) => {
    if (!userId) {
      // Anonymous run — the sliders are kept on the session row.
      await writeProfile({ skill_ratings: next, audit_results: next, instrument_version: 2, ...(band ? { answered_band: band } : {}) }, "slider save");
      return;
    }
    try {
      const { data: current } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("skill_ratings, audit_results").eq("user_id", userId).maybeSingle();
      const existingRatings = ((current as any)?.skill_ratings as Record<string, number>) || {};
      const existingAudit = ((current as any)?.audit_results as Record<string, number>) || {};
      await writeProfile({
        skill_ratings: { ...existingRatings, ...next },
        audit_results: { ...existingAudit, ...next },
        audit_completed_at: new Date().toISOString(), audit_method: "self_read",
        instrument_version: 2,
        ...(band ? { answered_band: band } : {}),
      }, "slider save");
    } catch (e) { console.error("[journey] slider save threw", e); }
  }, [userId, band, writeProfile]);

  /* A drag fires onChange per pixel — saving there raced dozens of upserts
     against each other. State moves live; the save happens when the drag ends. */
  const setScore = (name: string, value: number) => {
    setScores((prev) => ({ ...prev, [name]: value }));
  };

  /* ── FIX 3 · a refresh must not cost the member their answers ──
     Answers used to be written once, at the very end. Anyone who reloaded
     mid-instrument started again from question one with nothing kept. Every
     commit is now persisted, along with the place in the queue. Fire and
     forget: the UI never waits on the write. */
  const persistQuestionProgress = useCallback((ans: Record<string, string>, idx: number) => {
    if (!userId && anonToken) {
      anonStateRef.current = { ...anonStateRef.current, answers: ans, q_idx: idx };
      void saveSession(anonToken, anonStateRef.current);
    }
    try {
      localStorage.setItem(userId ? `aura_ob_q_${userId}` : "aura_ob_q_anon", String(idx));
    } catch { /* private mode */ }
  }, [userId, anonToken]);

  const persistDimProgress = useCallback((idx: number) => {
    if (!userId && anonToken) {
      anonStateRef.current = { ...anonStateRef.current, dim_idx: idx };
      void saveSession(anonToken, anonStateRef.current);
    }
    try {
      localStorage.setItem(userId ? `aura_ob_dim_${userId}` : "aura_ob_dim_anon", String(idx));
    } catch { /* private mode */ }
  }, [userId, anonToken]);

  /* ── the six questions, then the read ── */
  const finishQuestions = async (finalAnswers: Record<string, string>) => {
    const readRun = newRunId();
    setRevealRunId(readRun);
    setRevealPending(true);
    go(12);
    if (!userId) {
      if (anonToken) {
        anonStateRef.current = { ...anonStateRef.current, answers: finalAnswers, journey_screen: 12 };
        await saveSession(anonToken, anonStateRef.current);
      }
      return;
    }
    await saveAnswers(userId, finalAnswers);
    try {
      await writeProfile({ instrument_version: 2, ...(band ? { answered_band: band } : {}) }, "instrument stamp");
    } catch (e) { console.error("[journey] stamp threw", e); }
    const results = await generateMarketRead(userId, finalAnswers, sector || null, band, readRun);
    /* the report needs the raw read, not just the card built from it */
    if (results) setReadRaw(results);
    const built = toRevealData(results, {
      figures: [],
      excludeSoft: (dims || []).map((d) => d.name),
      sources: {
        posts: postsRead ?? 0,
        saved: claims.length,
        answers: Object.keys(finalAnswers).length,
        sliders: Object.keys(scores).length,
      },
    });
    const figures = [
      ...(claims.length ? [{ value: num(claims.length), label: "evidence captured" }] : []),
      ...(Object.keys(scores).length
        ? [{ value: num(Object.keys(scores).length), label: "strengths, in your words" }] : []),
      ...(built?.subjects.length ? [{ value: num(built.subjects.length), label: "signals found" }] : []),
    ];
    setReveal(built ? { ...built, figures } : built);
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
    if (screen !== 13 || readRaw || !userId) return;
    setRevealLoading(true);
    loadMarketRead(userId).then((r) => {
      if (r) setReadRaw(r);
      const d = toRevealData(r, {
        figures: [],
        excludeSoft: (dims || []).map((x) => x.name),
        sources: {
          posts: postsRead ?? 0,
          saved: claims.length,
          answers: Object.keys(answers).length,
          sliders: Object.keys(scores).length,
        },
      });
      if (d) {
        const figures = [
          ...(claims.length ? [{ value: num(claims.length), label: "evidence captured" }] : []),
          ...(Object.keys(scores).length
            ? [{ value: num(Object.keys(scores).length), label: "strengths, in your words" }] : []),
          ...(d.subjects.length ? [{ value: num(d.subjects.length), label: "signals found" }] : []),
        ];
        setReveal({ ...d, figures });
      }
    }).finally(() => setRevealLoading(false));
  }, [screen, readRaw, userId, postsRead, claims.length, scores, dims]);

  /* ── finishing ── */
  /* `destination` lets the seat doors complete the journey before they leave:
     the member who reserves a seat is still a finished member. */
  const finish = async (opts?: { destination?: string }) => {
    // The read is emailed once, at the end, so it lives somewhere permanent.
    try {
      if (reveal) {
        const { data: mail, error: mailErr } = await supabase.functions.invoke("send-read-email", {
          body: {
            archetype: reveal.archetype,
            marketRead: reveal.marketRead,
            subjects: reveal.subjects,
            softGround: reveal.softGround,
          },
        });
        if (mailErr || (mail as any)?.error) {
          console.error("[reveal] send-read-email failed", mailErr || (mail as any));
          toast.error("We couldn't email your read just now — it's saved on your Home page.");
        } else {
          const to = (mail as any)?.to as string | undefined;
          toast.success(to ? `Your read is on its way to ${to}.` : "Your read is on its way to your inbox.");
        }
      }
    } catch (err) {
      console.error("[reveal] send-read-email threw", err);
      toast.error("We couldn't email your read just now — it's saved on your Home page.");
    }
    if (userId) {
      try {
        /* Merges — writeProfile drops every null, so finishing can never blank
           a column the journey filled in earlier. */
        await writeProfile({
          /* Never write a placeholder into a name column. `firstName` is
             already seeded from the LinkedIn read when the member gave none;
             if it is still empty, nothing is written and the display fallback
             does its job at render time. */
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          firm: firm.trim() || undefined,
          sector_focus: sector || undefined,
          level: levelTitle.trim() || (band ? BAND_TO_LEVEL[band] : undefined),
          onboarding_completed: true,
          /* The STEP, not the screen. The screen index lives in
             identity_intelligence.journey_screen — overloading this column made
             every `onboarding_step >= 4` gate pass for the wrong reason. */
          onboarding_step: 4,
          ...(browserTimezone() ? { timezone: browserTimezone() as string } : {}),
          completed: true,
          instrument_version: 2,
          ...(band ? { answered_band: band } : {}),
        }, "finish save");
        /* finished means no longer paused — Home must stop offering the resume card */
        try {
          const { data: cur } = await (supabase.from("diagnostic_profiles" as any) as any)
            .select("identity_intelligence").eq("user_id", userId).maybeSingle();
          const ii = ((cur as any)?.identity_intelligence as Record<string, any>) || {};
          if (ii.journey_paused) {
            await writeProfile({ identity_intelligence: { ...ii, journey_paused: false } }, "unpause save");
          }
        } catch { /* the completed flags already close the gate */ }
      } catch (e) { console.error("[journey] finish save threw", e); }
      try { localStorage.removeItem(`aura_ob_screen_${userId}`); } catch { /* ignore */ }
    }
    try { localStorage.setItem("aura_onboarding_complete", "true"); } catch { /* ignore */ }
    try { sessionStorage.removeItem("aura_onboarding_visits"); } catch { /* ignore */ }
    supabase.functions.invoke("compute-imprint", { body: {} }).catch(() => {});
    navigate(opts?.destination ?? "/home", { replace: true });
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
        if (d.ok) {
          setConnected(true);
          setConnectNote("");
          /* The OAuth callback now preserves source_status and re-confirms it
             from the snapshot, so nothing needs re-writing here. */
        }
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

  /* ── finish later: a saved place, a said-out-loud confirmation, and a way back ── */

  /** Finish later — the place is written down, and Home carries them back to it. */
  const saveAndExit = useCallback(() => {
    const stage = stageOf(screen);
    setExitNote(`Saved at "${stageName(stage)}". Pick it up any time.`);
    void (async () => {
      await persistScreen(screen);
      if (userId) {
        try {
          const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
            .select("identity_intelligence").eq("user_id", userId).maybeSingle();
          const ii = ((data as any)?.identity_intelligence as Record<string, any>) || {};
          const alreadyEmailed = Boolean(ii.resume_email_sent_at);
          await writeProfile({
            identity_intelligence: {
              ...ii,
              journey_screen: screen,
              journey_paused: true,
              journey_stage: stage,
              journey_paused_at: new Date().toISOString(),
              resume_email_sent_at: alreadyEmailed ? ii.resume_email_sent_at : new Date().toISOString(),
            },
          }, "finish later save");
          /* one email, the first time only — never a sequence */
          if (!alreadyEmailed) {
            supabase.functions.invoke("send-resume-email", { body: { stage } }).catch(() => {});
          }
        } catch (e) { console.error("[journey] finish later save threw", e); }
      }
      /* An anonymous run has no Home to go to — the token keeps their place. */
      window.setTimeout(() => navigate(userId ? "/home" : "/"), 900);
    })();
  }, [persistScreen, screen, navigate, userId, writeProfile]);

  /**
   * START OVER — the answers go, the session does not. The row keeps its token
   * and its `runs_started`, so starting over is never a way around the metering.
   */
  const startOver = useCallback(async () => {
    setResumeAsking(false);
    setResumedAt(null);
    if (anonToken) {
      /* Start over clears the answers, not the read. The read already exists
         server-side, and re-asking for an address we hold is a lie about it. */
      const keep = anonStateRef.current as any;
      /* Place in the instrument goes with the answers — otherwise a reload
         drops a restarted member back where the old run stopped. */
      const preserved: Record<string, any> = { answers: {}, q_idx: 0, dim_idx: 0 };
      for (const k of ["read", "posts_read", "profile_url", "name"]) {
        if (keep?.[k] !== undefined && keep?.[k] !== null) preserved[k] = keep[k];
      }
      anonStateRef.current = preserved as any;
      await saveSession(anonToken, preserved);
      try {
        localStorage.removeItem("aura_ob_screen_anon");
        localStorage.removeItem("aura_ob_q_anon");
        localStorage.removeItem("aura_ob_dim_anon");
      } catch { /* ignore */ }
    }
    if (userId) {
      try {
        const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
          .select("identity_intelligence").eq("user_id", userId).maybeSingle();
        const ii = ((data as any)?.identity_intelligence as Record<string, any>) || {};
        /* The answers must leave the row, not just memory. `saveAnswers` merges,
           so anything left here would be un-removable by the new run. The
           sliders go with them — the in-memory reset already clears both. */
        await writeProfile({
          identity_intelligence: { ...ii, journey_screen: 0, journey_paused: false },
          onboarding_step: 0,
          brand_assessment_answers: null,
          skill_ratings: null,
          audit_results: null,
          answered_band: null,
        }, "start over");
      } catch (e) { console.error("[journey] start over save threw", e); }
      try {
        localStorage.removeItem(`aura_ob_screen_${userId}`);
        localStorage.removeItem(`aura_ob_q_${userId}`);
        localStorage.removeItem(`aura_ob_dim_${userId}`);
      } catch { /* ignore */ }
    }
    setAnswers({});
    setScores({});
    setClaims([]);
    /* The resolved address and its read survive — only the journey restarts. */
    if (!readDone) {
      returnToAddress();
      setLiInput("");
      setLiProfile(null);
      setPostsRead(null);
    }
    setOwnWords(null);
    setSector(""); setSectorKnown(false);
    setBand(null); setLevelTitle("");
    setCvUploads(0);
    backStack.current = [];
    setScreen(0);
    screenRef.current = 0;
    try { window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); } catch { /* ignore */ }
  }, [anonToken, userId, writeProfile, readDone, returnToAddress]);

  /** The slim line above the card. One resume, one banner. */
  const resumeBanner = resumedAt ? (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
      background: OB.white, border: `1px solid ${OB.line}`, borderRadius: RADIUS.card,
      padding: "10px 14px", marginBlockEnd: 14,
      fontSize: 13, color: OB.ink,
    }}>
      <span style={{ flex: "1 1 220px", lineHeight: 1.45 }}>
        {resumeAsking
          ? "This clears your answers so far."
          : resumedAt.readDone
            ? `Welcome back — your read is done. You were on "${stageName(resumedAt.stage)}".`
            : `Welcome back — you were on "${stageName(resumedAt.stage)}".`}
      </span>
      {resumeAsking ? (
        <>
          <button type="button" onClick={() => { void startOver(); }}
            style={{ background: "none", border: "none", padding: "10px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: OB.ink, textDecoration: "underline" }}>
            Start fresh
          </button>
          <button type="button" onClick={() => setResumeAsking(false)}
            style={{ background: "none", border: "none", padding: "10px 12px", cursor: "pointer", fontSize: 13, color: OB.muted }}>
            Keep going
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setResumeAsking(true)}
            style={{ background: "none", border: "none", padding: "10px 12px", cursor: "pointer", fontSize: 13, color: OB.muted, textDecoration: "underline" }}>
            Start over
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setResumedAt(null)}
            style={{ background: "none", border: "none", padding: "10px 12px", cursor: "pointer", fontSize: 16, lineHeight: 1, color: OB.muted, minInlineSize: 44, minBlockSize: 44 }}>
            ×
          </button>
        </>
      )}
    </div>
  ) : null;

  /** Remembers when their day starts, alongside the time zone we detected. */
  const chooseDailyTime = useCallback(async (slot: "Morning" | "Midday" | "Evening") => {
    setDailyTime(slot);
    if (!userId) return;
    try {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("ui_dismissals").eq("user_id", userId).maybeSingle();
      const existing = (data?.ui_dismissals && typeof data.ui_dismissals === "object") ? data.ui_dismissals : {};
      await writeProfile({ ui_dismissals: { ...existing, daily_time: { slot, time_zone: timeZone, at: new Date().toISOString() } } }, "daily time save");
    } catch { /* they can change it in Settings */ }
  }, [userId, timeZone, writeProfile]);

  /* Both seat doors: finish first, then leave. A failed finish never traps
     the member — it is logged and the door still opens. */
  const leaveForSeat = async (intent: "reserve_69" | "keep_posted") => {
    const destination = `${SEAT_PATH}?intent=${intent}`;
    try {
      await finish({ destination });
    } catch (e) {
      console.error("[journey] finish before seat threw", e);
      navigate(destination);
    }
  };

  /* Pausing is not finishing. The old escape hatch flagged the member as fully
   * onboarded with an empty profile and locked them out of the journey for
   * good — it now saves the place and leaves, exactly like Finish later. */
  const escapeFooter = visits >= 3 ? (
    <div style={{ textAlign: "center", marginBlockStart: 16 }}>
      <button type="button" onClick={saveAndExit} style={{
        background: "none", border: "none", color: OB.muted, fontSize: 12,
        cursor: "pointer", textDecoration: "underline", fontFamily: "inherit",
      }}>Finish later →</button>
    </div>
  ) : null;

  const bandLabel = band ? BAND_LABEL[band] : null;

  /* The browser's back button walks the journey, and Escape is Finish later. */
  useEffect(() => {
    /* popstate is the SINGLE mover: the entry is already consumed by the
       browser, so we only apply the position change. */
    const onPop = () => {
      pushed.current = Math.max(0, pushed.current - 1);
      const fb = pendingFallback.current;
      pendingFallback.current = undefined;
      applyBack(fb);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (typing) return;
      e.preventDefault();
      saveAndExit();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [applyBack, saveAndExit]);

  /** One writer for the level, wherever it is picked. */
  const chooseTitle = async (title: string, b: Band) => {
    setLevelTitle(title);
    setBand(b);
    setDims(null);
    setQuestions(null);
    try {
      await writeProfile({ level: title, seniority_band: b, band_source: "corrected" }, "level save");
    } catch (e) { console.error("[journey] level save threw", e); }
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

  /** Continuing past the read is the member agreeing with the level Aura detected. */
  const confirmBandIfDetected = async () => {
    if (!userId || !band) return;
    try {
      const { data: cur } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("band_source").eq("user_id", userId).maybeSingle();
      if (String((cur as any)?.band_source ?? "") === "detected") {
        await writeProfile({ band_source: "confirmed" }, "level confirm");
      }
    } catch (e) { console.error("[journey] level confirm threw", e); }
  };

  /* Without a level there is no set of sliders or questions to load — so ask,
     rather than sitting on a loader or a retry that can never succeed. */
  /* Rendered inside the shell of whichever screen it interrupts — a white card
     in the middle of the dark run would break the surface law. */
  const bandPrompt = (night = false) => {
    const inner = (
      <>
        <h1 style={night ? h1Night : h1Light}>One thing first — which of these is closest to your title?</h1>
        {titleList((t, b) => { void chooseTitle(t, b); })}
      </>
    );
    return night ? (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>{inner}</NightShell>
    ) : (
      <PaperShell onExit={saveAndExit} footer={escapeFooter}>{inner}</PaperShell>
    );
  };

  /* Answering the band prompt clears dims/questions while they reload. That is
     a wait, not a failure — the failure panel belongs to contentError alone. */
  const quietLoadPanel = () => (
    <PaperShell onExit={saveAndExit} footer={escapeFooter}>
      <h1 style={h1Light}>One moment.</h1>
      <p style={bodyLight}>Aura is picking the right set for you.</p>
    </PaperShell>
  );

  /* The one truth about the shelf. Every badge, on every screen, reads from
     here — a badge is only lit by work the member actually did, and no figure
     is ever invented. */
  const shelfState = useMemo(() => {
    const ratings = Object.keys(scores).length;
    const subjects = reveal?.subjects?.length ?? 0;
    return [
      { unlocked: Boolean(postsRead) || readDone, figure: postsRead ? num(postsRead) : "✓" },
      { unlocked: claims.length > 0, figure: num(claims.length) },
      { unlocked: ratings > 0, figure: num(ratings) },
      { unlocked: subjects > 0, figure: subjects > 0 ? num(subjects) : undefined },
    ] as { unlocked: boolean; figure?: string | number }[];
  }, [postsRead, readDone, claims.length, scores, reveal]);

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
        <PaperShell onExit={saveAndExit} showProgress={false} footer={escapeFooter}>
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
        <PaperShell onExit={saveAndExit} showProgress={false} footer={escapeFooter}>
          <h1 style={h1Light}>Set your password.</h1>
          <p style={bodyLight}>One password, and your read is yours to keep.</p>
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
            <OBButton onClick={() => void handleSetPassword()} disabled={!allValid} loading={settingPwd} loadingLabel="Saving…"
              aria-describedby={!allValid ? "ob-pwd-why" : undefined}>
              Set it and start
            </OBButton>
            {!allValid ? whyLine("ob-pwd-why", "Meet every rule above to enable this.", true) : null}
          </Actions>
        </PaperShell>
      </>
    );
  }

  /* ─────────────────────────── the fourteen screens ─────────────────────── */

  const retryPanel = (retry: () => void) => (
    <>
      <h1 style={h1Light}>Give that one more go.</h1>
      <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
      <Actions style={{ marginBlockStart: 22 }}><OBButton onClick={retry}>Try again</OBButton></Actions>
    </>
  );

  let content: React.ReactNode = null;

  /* 0 — CREAM */
  if (screen === 0) {
    content = (
      <PaperShell onExit={saveAndExit} subProgress={readDone ? 0.5 : undefined} footer={escapeFooter}>
        <h1 style={h1Light}>{BRAND.headline}</h1>
        <p style={bodyLight}>{ONBOARDING_INTRO.lede}</p>
        <p style={bodyLight}>
          {ASSESSMENT_STEPS_WORD.charAt(0).toUpperCase() + ASSESSMENT_STEPS_WORD.slice(1)} short steps,{" "}
          {FULL_PICTURE_LINE.toLowerCase()}. You can stop anywhere — everything saves as you go. Free, and it stays free.
        </p>
        <p style={{
          margin: "26px 0 8px", fontFamily: OB.ui, fontSize: 11, letterSpacing: "0.12em",
          color: OB.muted, fontWeight: 600,
        }}>
          {ONBOARDING_INTRO.rowHead}
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.55, color: OB.muted }}>
          {ONBOARDING_INTRO.rowSub}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, margin: "0 0 6px" }}>
          {ONBOARDING_INTRO.outputs.map((o) => (
            <div key={o.label} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: OB.line, marginTop: 7 }} />
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: OB.ink }}>{o.label}</p>
                <p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.55, color: OB.muted }}>{o.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <Actions style={{ marginBlockStart: 22 }}><OBButton onClick={() => go(1)}>Start</OBButton></Actions>
        <p style={{ margin: "18px 0 0", fontSize: 14, lineHeight: 1.55, color: OB.ink }}>
          {ONBOARDING_INTRO.loss}
        </p>
        <p style={footnote}>{REPORT_FREE_LINE}</p>
      </PaperShell>
    );
  }

  /* 1 — WHITE, the address. The member advances from this card; the code never does. */
  if (screen === 1) {
    const mono = (v: React.ReactNode) => <span style={{ fontFamily: OB.mono, fontWeight: 600 }}>{v}</span>;
    const rows: { key: string; label: string; line: React.ReactNode; done: boolean; drop: boolean }[] = [
      { key: "p", label: "Posts", line: <>{mono(num(upPosts))} posts read</>, done: !!postsRead, drop: readDone && !postsRead },
      { key: "w", label: "Your own writing", line: <>{mono(num(upWords))} words of your own writing</>, done: !!ownWords, drop: readDone && !ownWords },
      { key: "s", label: "Sector", line: <>Sector · {mono(sector)}</>, done: !!sector, drop: readDone && !sector },
      { key: "b", label: "Level", line: <>Level · {mono(bandLabel)}</>, done: !!bandLabel, drop: readDone && !bandLabel },
    ].filter((r) => !r.drop);
    const nothingPublic = readDone && !postsRead && !ownWords;
    // A zero for posts is never printed — the empty-post line stands in for it.
    const figures = [
      ...(postsRead ? [{ v: postsRead, l: "posts read" }] : []),
      ...(liProfile?.followers ? [{ v: liProfile.followers, l: "following you" }] : []),
      ...(liProfile?.skills_count ? [{ v: liProfile.skills_count, l: "skills on record" }] : []),
    ];
    const readJustNow = [
      postsRead ? `${num(postsRead)} posts` : "",
      ownWords ? `${num(ownWords)} words` : "",
      "read just now",
    ].filter(Boolean).join(" · ");

    content = (
      <PaperShell onExit={saveAndExit} subProgress={step1Phase === "result" ? 0.6 : 0.25} footer={escapeFooter}>
        {step1Phase === "result" ? (
          <h1 style={h1Light}>This is what Aura can see.</h1>
        ) : (
          <>
            <h1 style={h1Light}>What's your LinkedIn?</h1>
            <p style={bodyLight}>
              So nothing Aura writes for you sounds generic. It reads what's already public — your profile and your
              recent posts — and picks up your sector, your level and the way you already write.
            </p>
          </>
        )}

        {step1Phase === "ask" && !userId ? (
          <>
            <p style={bodyLight}>
              Your read was done before you got here. Aura can't find it on this device — open it again and it
              comes straight back.
            </p>
            <Actions style={{ marginBlockStart: 16 }}>
              <OBButton onClick={() => { void backToRead(); }}>Open my read</OBButton>
              <OBButton variant="tertiary" onClick={() => go(MANUAL_SCREEN)}>I'd rather type it in myself</OBButton>
            </Actions>
          </>
        ) : null}

        {step1Phase === "ask" && userId ? (
          <>
            <input
              value={liInput}
              onChange={(e) => { setLiInput(e.target.value); setLiError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && liInput.trim()) void readProfile(); }}
              placeholder="linkedin.com/in/yourname"
              aria-label="Your LinkedIn address"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{ ...fieldStyle, marginBlockStart: 20 }}
            />
            {liError ? (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.err }}>{liError}</p>
            ) : null}
            <Actions style={{ marginBlockStart: 16 }}>
              <OBButton onClick={() => void readProfile()} disabled={!liInput.trim()} loading={liBusy} loadingLabel="Reading…"
                aria-describedby={!liInput.trim() ? "ob-li-why" : undefined}>
                Read my profile
              </OBButton>
              {!liInput.trim() ? (
                /* A disabled control always carries its reason, next to itself. */
                <p id="ob-li-why" style={{ margin: "-2px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted, textAlign: "center" }}>
                  Paste your LinkedIn address first.
                </p>
              ) : null}
              <OBButton variant="tertiary" onClick={() => go(MANUAL_SCREEN)}>I'd rather type it in myself</OBButton>
              <OBButton variant="tertiary" onClick={() => goBack(0)}>Back</OBButton>
            </Actions>
            <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.6, color: OB.muted }}>
              Aura reads your profile and your public posts. You get drafts in your own words instead of generic ones.
              {userId
                ? " You can delete what it stored, any time, in Settings."
                : " You can delete what Aura stored at any time — and if you don't finish, it is deleted automatically after seven days."}
            </p>
            <p style={{ margin: "8px 0 0", fontFamily: OB.mono, fontSize: 11.5, lineHeight: 1.55, color: OB.muted }}>
              Aura reads the public profile and recent posts at this address, and keeps the result for seven days so you can come back.
            </p>
          </>
        ) : null}

        {/* The read happens here, in place. Nothing moves while it lands. */}
        {step1Phase === "reading" ? (
          <div style={{ marginBlockStart: 22 }}>
            <WorkingPanel
              operation="linkedin_read"
              runId={readRunId}
              title="Reading what LinkedIn shows"
              stages={[{ key: "read", label: "Reading your profile and your posts", state: readDone ? "done" : "active" }]}
              onCarryOn={{ label: "Carry on — I'll pick this up later", action: () => go(5) }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBlockStart: 14 }}>
              {rows.map((r) => (
                <StatusRow key={r.key} label={r.label} done={r.done}>{r.line}</StatusRow>
              ))}
            </div>
            {nothingPublic ? (
              <p style={{ ...bodyLight, marginBlockStart: 16 }}>{EMPTY_POSTS_LINE}</p>
            ) : null}
            {/* Nothing after this depends on the read being back. */}
            <Actions style={{ marginBlockStart: 20 }}>
              <OBButton variant="tertiary" onClick={() => go(5)}>Carry on while it reads</OBButton>
            </Actions>
          </div>
        ) : null}

        {step1Phase === "result" ? (
          <>
        <div style={{ display: "flex", gap: 13, alignItems: "center", marginBlockStart: 20 }}>
          {liProfile?.photo_url ? (
            <img src={liProfile.photo_url} alt={`${liProfile?.full_name || "Your"} LinkedIn photo`} loading="lazy"
              style={{ inlineSize: 56, blockSize: 56, borderRadius: "50%", objectFit: "cover", border: `1px solid ${OB.line}` }} />
          ) : null}
          <div style={{ minInlineSize: 0 }}>
            {(() => {
              const name = liProfile?.full_name || `${firstName} ${lastName}`.trim() || "You";
              const head = cleanHeadline(liProfile?.headline);
              return (
                <>
                  <p {...memberText(name)} style={{ margin: 0, fontSize: 16, fontWeight: 700, ...(memberText(name).style || {}) }}>{name}</p>
                  {head ? (
                    <p {...memberText(head)} style={{
                      margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.5, color: OB.muted,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                      ...(memberText(head).style || {}),
                    }}>{head}</p>
                  ) : null}
                </>
              );
            })()}
          </div>
        </div>
        {postsRead ? (
          <div style={{ display: "flex", gap: 20, marginBlockStart: 20 }}>
            {figures.map((f) => (
              <div key={f.l}>
                <div style={{ fontFamily: OB.mono, fontSize: 22, fontWeight: 600, color: OB.ink }}>{num(f.v)}</div>
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
            facts.roles ? `${num(facts.roles)} ${facts.roles === 1 ? "role" : "roles"}` : "",
            facts.certifications ? `${num(facts.certifications)} certifications` : "",
            facts.skills ? `${num(facts.skills)} skills` : "",
            facts.projects ? `${num(facts.projects)} projects` : "",
            facts.joinedYear ? `on LinkedIn since ${facts.joinedYear}` : "",
          ].filter(Boolean);
          if (!where.length && !counts.length && !facts.topSkills.length && !facts.aboutFirstLine) return null;
          return (
            <div style={{ marginBlockStart: 18 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 700, color: OB.ink }}>
                What Aura found in your record
              </p>
              {where.length ? (
                <p {...memberText(where.join(" · "))} style={{ margin: 0, fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted }}>
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
                    <span key={s} {...memberText(s)} style={{
                      fontSize: 11.5, color: OB.ink, background: OB.canvas,
                      border: `1px solid ${OB.line}`, borderRadius: RADIUS.chip, padding: "4px 8px",
                    }}>{s}</span>
                  ))}
                </div>
              ) : null}
              {facts.aboutFirstLine ? (
                <p {...memberText(facts.aboutFirstLine)} style={{
                  margin: "12px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.6,
                  color: OB.muted, fontStyle: "italic", ...(memberText(facts.aboutFirstLine).style || {}),
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
              {num(facts.recommendations)} {facts.recommendations === 1 ? "person has" : "people have"} written a
              recommendation for you
            </figcaption>
            <blockquote {...memberText(facts.recQuote.text)} style={{
              margin: 0, fontSize: "var(--ob-body)", lineHeight: 1.6, color: OB.ink,
              ...(memberText(facts.recQuote.text).style || {}),
            }}>
              “{facts.recQuote.text}”
            </blockquote>
            <p {...memberText(facts.recQuote.title)} style={{ margin: "9px 0 0", fontSize: 11.5, color: OB.muted }}>— {facts.recQuote.title}</p>
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: OB.muted }}>
              Aura read all {num(facts.recommendations)}.
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
            <blockquote {...memberText(ownLine.text)} style={{
              margin: 0, fontSize: 15, lineHeight: 1.6, color: OB.ink, ...(memberText(ownLine.text).style || {}),
            }}>
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
            <span style={{ fontSize: 14 }}>
              Level ·{" "}
              {levelTitle || bandLabel
                ? <strong>{levelTitle || bandLabel}</strong>
                : <span style={{ color: OB.muted }}>tell Aura</span>}
            </span>
            <OBButton variant="tertiary" onClick={() => setBandPicker((v) => !v)} style={{ flexShrink: 0 }}>
              {bandPicker ? "Close" : "Change"}
            </OBButton>
          </div>
          {bandPicker && titleList((t, b) => { void chooseTitle(t, b); setBandPicker(false); })}
          {!sector && (
            <div style={{ marginBlockStart: 12 }}>
              <label htmlFor="ob-sector" style={{ fontSize: 12.5, color: OB.muted }}>Which sector should Aura use?</label>
              <select id="ob-sector" value={sector} onChange={async (e) => {
                const v = e.target.value;
                setSector(v);
                setSectorKnown(!!v);
                if (v) {
                  await writeProfile({ sector_focus: v }, "sector save");
                }
              }} style={{ ...fieldStyle, marginBlockStart: 8 }}>
                <option value="">Choose your sector</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <p style={{ fontSize: 12, color: OB.muted, marginBlockStart: 6 }}>
                Optional — it sharpens what Aura watches for you.
              </p>
            </div>
          )}
        </div>

            {/* Both asks, in one place: what Aura reads, what you get, and that you can undo it. */}
            <div style={{
              marginBlockStart: 22, padding: "15px 16px", borderRadius: RADIUS.card,
              background: OB.canvas, border: `1px solid ${OB.line}`,
            }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: OB.ink }}>
                Two things Aura can see — both are yours to decide.
              </p>

              <div style={{ display: "flex", gap: 9, marginBlockStart: 14 }}>
                <Check size={16} style={{ color: "#12805C", flexShrink: 0, marginBlockStart: 2 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: OB.ink }}>What's public · read</p>
                  <p style={{ margin: "4px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted }}>
                    Your profile and your posts. This is how Aura learns the way you write.
                  </p>
                  {readJustNow ? (
                    <p style={{ margin: "6px 0 0", fontFamily: OB.mono, fontSize: 11.5, color: OB.ink }}>{readJustNow}</p>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", gap: 9, marginBlockStart: 16 }}>
                {connected ? <Check size={16} style={{ color: "#12805C", flexShrink: 0, marginBlockStart: 2 }} /> : <span style={{ inlineSize: 16, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: OB.ink }}>
                    {connected
                      ? `Connected${connectedName ? ` · ${connectedName}` : ""} · Aura can read your posts and publish when you approve`
                      : "What's private · not connected"}
                  </p>
                  {connected ? null : (
                    <>
                      <p style={{ margin: "4px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted }}>
                        How those posts actually performed. This is how Aura learns which of the signals in your read
                        your audience already rewards — instead of guessing.
                      </p>
                      {userId ? (
                        <Actions style={{ marginBlockStart: 12 }}>
                          <OBButton variant="secondary" onClick={() => void connectLinkedIn()} loading={connecting} loadingLabel="Connecting…">
                            Connect LinkedIn
                          </OBButton>
                        </Actions>
                      ) : (
                        <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted }}>
                          {CONNECT_AFTER_ACCOUNT}
                        </p>
                      )}
                      {userId && connectNote ? (
                        <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted }}>{connectNote}</p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <p style={{ margin: "16px 0 0", fontSize: 12, lineHeight: 1.6, color: OB.muted }}>
                Aura reads your posts, and can publish for you — but only when you approve it. Nothing goes out in your name on its own. You can disconnect either one in Settings.
              </p>
            </div>

            <p style={{
              margin: "16px 0 0", fontFamily: OB.mono, fontSize: 11.5,
              lineHeight: 1.6, color: OB.muted,
            }}>
              {readCache ? (
                readCache.notice
                  ? readCache.notice
                  : `Read from your profile on ${new Date(readCache.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`
              ) : null}
              {readCache ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => { if (!userId) { void backToRead(); return; } void readProfile(true); }}
                    style={{
                      background: "none", border: 0, padding: "10px 6px", fontSize: 13,
                      color: OB.blue, cursor: "pointer", textDecoration: "underline",
                      display: "inline-block",
                    }}
                  >
                    Read again
                  </button>
                </>
              ) : null}
            </p>
            {/* Mono is for numbers. This is a control, so it is set as one. */}
            <button
              type="button"
              onClick={() => { if (!userId) { void backToRead(); return; } void returnToAddress(); }}
              style={{
                background: "none", border: 0, padding: "11px 0", marginBlockStart: 4,
                fontFamily: OB.ui, fontSize: 13.5, color: OB.muted, cursor: "pointer",
                textAlign: "start", minBlockSize: 44, display: "inline-flex", alignItems: "center",
              }}
            >
              This isn't me — read a different profile
            </button>

            <Actions style={{ marginBlockStart: 18 }}>
              <OBButton onClick={() => { void confirmBandIfDetected(); go(CV_SCREEN); }}>Continue</OBButton>
              <OBButton variant="tertiary" onClick={() => go(5)}>I'll do that later</OBButton>
            </Actions>
          </>
        ) : null}
      </PaperShell>
    );
  }


  /* 15 — WHITE, only when the read failed or was skipped */
  if (screen === MANUAL_SCREEN) {
    const ready = !!firstName.trim() && !!firm.trim() && !!sector && !!band && !!levelTitle;
    content = (
      <PaperShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={h1Light}>Aura couldn't read it — tell it the basics.</h1>
        <p style={bodyLight}>Four things, and Aura works from these until you point it at your profile.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBlockStart: 20 }}>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" aria-label="First name" style={fieldStyle} />
          <input value={firm} onChange={(e) => setFirm(e.target.value)} placeholder="Where you work" aria-label="Where you work" style={fieldStyle} />
          <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Your sector" style={fieldStyle}>
            <option value="">Your sector</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p style={{ ...bodyLight, marginBlockStart: 16, fontWeight: 600, color: OB.ink }}>Your level</p>
        {titleList((t, b) => { setLevelTitle(t); setBand(b); })}
        <Actions style={{ marginBlockStart: 20 }}>
        <OBButton disabled={!ready} aria-describedby={!ready ? "ob-manual-why" : undefined} onClick={async () => {
          await writeProfile({
            first_name: firstName.trim(), last_name: lastName.trim() || undefined,
            firm: firm.trim(), sector_focus: sector,
            level: levelTitle || (band ? BAND_TO_LEVEL[band] : undefined),
            seniority_band: band, band_source: "corrected",
          }, "identity save");
          go(5);
        }}>Save and carry on</OBButton>
        {!ready ? whyLine("ob-manual-why", "Fill in your name, where you work, your sector and your level to enable this.") : null}
        <OBButton variant="tertiary" onClick={() => goBack(1)}>Back</OBButton>
        </Actions>
      </PaperShell>
    );
  }

  /* 3.5 — WHITE. The member's turn: a CV, if they have one to hand. */
  if (screen === CV_SCREEN) {
    const leaveCv = () => {
      /* CvUploadControl owns the cross-check call. Firing it here too ran
         cv-crosscheck twice on every signed-in upload. */
      go(5);
    };
    content = (
      <PaperShell onExit={saveAndExit} subProgress={0.5} footer={escapeFooter}>
        <h1 style={h1Light}>Have a CV handy?</h1>
        <p style={bodyLight}>
          Your CV and your profile are read together. Your profile says what the world can see.
          A CV says what you actually did — the numbers, the programmes, the things nobody posted
          about. Aura reads it against your profile and shows you the difference.
        </p>
        <div style={{ marginBlockStart: 20 }}>
          <CvUploadControl
            userId={userId}
            anonToken={anonToken}
            onUploaded={() => setCvUploads((n) => n + 1)}
            onCvContact={(c) => { if (c.email && !wallEmail) setWallEmail(c.email); }}
            onCrosscheck={(cc) => {
              setCvCrosscheck(cc);
              /* Anonymous: the result lives on the session, the CV does not. */
              if (!userId && anonToken) {
                anonStateRef.current = { ...anonStateRef.current, cv_crosscheck: cc } as any;
                void saveSession(anonToken, anonStateRef.current);
              }
            }}
          />
        </div>
        {/* Shows only once the comparison comes back; absent, it renders nothing. */}
        <CvCrosscheck
          data={cvCrosscheck}
          style={{ marginBlockStart: 20 }}
          onAuraAction={(kind, ctx) => (kind === "capture_evidence" ? keepCvEvidence(ctx) : false)}
        />
        {/* The ask comes after the whole comparison, and it is loss-framed. */}
        {!userId && cvCrosscheck ? (
          <div style={{ marginBlockStart: 24, borderTop: `1px solid ${OB.line}`, paddingBlockStart: 20 }}>
            <h2 style={{ fontFamily: OB.ui, fontSize: 20, fontWeight: 700, color: OB.ink, margin: 0 }}>Keep this.</h2>
            <p style={{ fontFamily: OB.ui, fontSize: 15, color: OB.muted, marginBlockStart: 8 }}>
              Only this browser can reach this comparison. Make an account and it's yours anywhere.
            </p>
            <Actions style={{ marginBlockStart: 16 }}>
              <OBButton variant="tertiary" onClick={() => go(12)}>Skip ahead to my report</OBButton>
              <p style={{ margin: "-4px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted, textAlign: "center" }}>
                You'll skip the questions — your report will be thinner.
              </p>
            </Actions>
          </div>
        ) : null}
        <Actions style={{ marginBlockStart: 20 }}>
          <OBButton onClick={leaveCv}>
            {cvUploads > 0 ? "Read it" : "Continue"}
          </OBButton>
        </Actions>
      </PaperShell>
    );
  }

  /* 5 — WHITE, the first link */
  if (screen === 5) {
    content = (
      <PaperShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={h1Light}>Something you read this week.</h1>
        <p style={bodyLight}>
          Your profile says what you've done. It doesn't say what you think. One link is enough to start.
        </p>
        <p style={bodyLight}>
          {userId
            ? "Paste a link to an article or a post. Aura reads it and shows you what it found."
            : "Paste a link to an article or a post. Aura reads it now and shows you what it found."}
        </p>
        <label htmlFor="ob-link" style={{
          display: "block", margin: "20px 0 6px", fontSize: 12.5, fontWeight: 600, color: OB.ink,
        }}>Link</label>
        <input id="ob-link" value={linkInput}
          onChange={(e) => { setLinkInput(e.target.value); if (linkError) setLinkError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void submitLink(); }}
          placeholder="https://hbr.org/2026/07/the-exit-ready-cfo" inputMode="url"
          style={{ ...fieldStyle, borderColor: linkError ? "#C0392B" : (fieldStyle as any).borderColor }} />
        {linkError ? (
          <p style={{ margin: "7px 0 0", fontSize: 12, color: "#C0392B" }}>{linkError}</p>
        ) : (
          <p style={{ margin: "7px 0 0", fontSize: 12, color: OB.muted }}>
            A web link for now. Files and documents are coming.
          </p>
        )}
        <Actions style={{ marginBlockStart: 14 }}>
          <OBButton disabled={!linkInput.trim() || sendingLink} loading={sendingLink} loadingLabel="Sending…"
            aria-describedby={!linkInput.trim() ? "ob-add-why" : undefined}
            onClick={() => void submitLink()}>Add it</OBButton>
          {!linkInput.trim() ? whyLine("ob-add-why", "Paste a link to enable this.", true) : null}
          {/* Nobody is held here for want of an article. */}
          <OBButton variant="tertiary" onClick={() => go(8)}>I'll add one later</OBButton>
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
              Aura found this in your sector while it read your profile.
            </p>
            <p style={{ margin: "9px 0 0", fontSize: 14.5, fontWeight: 700, lineHeight: 1.4 }} {...memberText(suggested.title)}>
              {suggested.title}
            </p>
            <p style={{
              margin: "5px 0 0", fontFamily: OB.mono, fontSize: 11, color: OB.muted, letterSpacing: "0.02em",
            }}>{sourceLine(suggested)}</p>
            {suggested.summary ? (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted }}
                {...memberText(suggested.summary)}>
                {trimToSentence(suggested.summary, 220)}
              </p>
            ) : null}
            <div style={{ marginBlockStart: 14 }}>
              <OBButton variant="secondary" disabled={sendingLink} loading={sendingLink} loadingLabel="Sending…"
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
    /* Two stages, because two events exist: the link left, and the claims
       landed. Matching to the sector happens inside the second and has no
       event of its own, so it is not a step of its own. */
    const captureStages: WorkingStage[] = buildStages("capture_ingest", {
      completed: captureRun.completed,
      active: captureRun.active,
      failed: captureRun.failedAt,
      labels: { fetch: "Article fetched", read: "What Aura found in it" },
    });
    const settled = claimsSlow && claims.length === 0;
    content = capturePending ? (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Kept.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Aura couldn't pull anything usable out of this one here — some pages don't open to it.
          The link is on your record and Aura reads it again when your report is saved.
        </p>
        <Actions style={{ marginBlockStart: 22 }}>
          <OBButton onClick={() => { setCapturePending(false); go(7); }}>Carry on</OBButton>
        </Actions>
      </NightShell>
    ) : linkFailed ? (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>That one didn't come through.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>
          Aura couldn't reach that link. Try another one, or carry on — you can add it later.
        </p>
        <Actions style={{ marginBlockStart: 22 }}>
          <OBButton onClick={() => { setLinkFailed(false); go(5); }}>Try a different link</OBButton>
          <OBButton variant="tertiary" onClick={() => { setLinkFailed(false); go(8); }}>Carry on</OBButton>
        </Actions>
      </NightShell>
    ) : (
      <NightShell onExit={saveAndExit} face footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>Reading it.</h1>
        <p style={{ ...bodyNight, textAlign: "center" }}>Finding the parts you can use.</p>
        {settled ? null : (
          <>
            <div style={{ marginBlockStart: 22 }}>
              <WorkingPanel
                onNight
                operation="capture_ingest"
                title="Reading it"
                stages={captureStages}
                runId={captureRunId}
                onCarryOn={{ label: "Carry on — I'll pick this up later", action: () => go(8) }}
              />
            </div>
          </>
        )}
        {proof && proof.lines.length > 0 ? (
            <WaitProof lines={proof.lines} startAt={0} howLong="While you wait — here's what Aura found in your own posts." />
        ) : null}
        {settled && (
          <>
            <p style={{ ...bodyNight, textAlign: "center", marginBlockStart: 22 }}>
              Aura is still reading this one. It'll be on your Home when it's done — you don't need to wait here.
            </p>
            <Actions style={{ marginBlockStart: 20 }}><OBButton onClick={() => go(8)}>Keep going</OBButton></Actions>
          </>
        )}
      </NightShell>
    );
  }

  /* 7 — NIGHT, the capture payoff: real fragments, then what they become */
  if (screen === 7) {
    const shown = claims.slice(0, 5);
    content = (
      <NightShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={{ ...h1Night, textAlign: "center" }}>
          {shown.length ? "Here's what Aura found in it." : "Nothing came out of that one."}
        </h1>
        {shown.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBlockStart: 24 }}>
            {shown.map((c, i) => (
              <ClaimCard key={`${c.title}-${i}`} index={i} title={c.title} content={c.content} />
            ))}
          </div>
        ) : (
          <p style={{ ...bodyNight, textAlign: "center", marginBlockStart: 18 }}>
            Some pages don't open to a reader. The link is kept against your record, and Aura
            reads it again when your report is saved.
          </p>
        )}
        <p style={{ ...bodyNight, textAlign: "center", marginBlockStart: 22 }}>
          You'll know when something moves these — without going looking.
        </p>
        <NextStrip count={shown.length} onNight />
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8, justifyItems: "center", maxWidth: 420, margin: "22px auto 4px",
        }}>
          {SHELF.map((s, i) => (
            <ShelfBadge key={s.key} label={s.label} tone={s.tone} onNight
              icon={SHELF_ICON[i]} hint={SHELF_HINT[i]}
              unlocked={shelfState[i].unlocked} figure={shelfState[i].figure} />
          ))}
        </div>
        <Actions style={{ marginBlockStart: 18 }}><OBButton onClick={() => go(8)}>Keep going</OBButton></Actions>
      </NightShell>
    );
  }

  /* 8 — WHITE, before the sliders */
  if (screen === 8) {
    if (!band) { content = bandPrompt(); } else {
    const sliderCount = dims?.length ?? 0;
    // Sector rows do not exist yet — every member gets the band set, so the
    // copy may only promise the level.
    const pickedLine = bandLabel && sliderCount
      ? `${sliderCount} sliders. Under a minute. Picked for ${bandLabel}.`
      : null;
    content = (
      <PaperShell onExit={saveAndExit} face footer={escapeFooter}>
        {contentError ? retryPanel(() => void loadDimensions()) : (
          <>
            <h1 style={{ ...h1Light, textAlign: "center" }}>Now your own read.</h1>
            <p style={{ ...bodyLight, textAlign: "center" }}>
              Where your own read and your posts disagree is where the useful part is.
            </p>
            <p style={{ ...bodyLight, textAlign: "center" }}>
              This isn't a test. Each one asks what you've actually done, in plain sentences rather than numbers.
            </p>
            {pickedLine ? <p style={{ ...bodyLight, textAlign: "center" }}>{pickedLine}</p> : null}
            <Actions style={{ marginBlockStart: 24 }}>
              <OBButton onClick={() => { setDimIdx(0); go(9); }} loading={!dims} loadingLabel="Loading…">
                Okay
              </OBButton>
            </Actions>
          </>
        )}
      </PaperShell>
    );
    }
  }

  /* 8.5 — retired; resume positions are forwarded to screen 8 above. */

  /* 9 — WHITE ×8, the sliders */
  if (screen === 9) {
    if (!band) {
      content = bandPrompt();
    } else if (contentError) {
      content = (
        <PaperShell onExit={saveAndExit} footer={escapeFooter}>
          <h1 style={h1Light}>Give that one more go.</h1>
          <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
          <Actions style={{ marginBlockStart: 20 }}><OBButton onClick={() => void loadDimensions()}>Try again</OBButton></Actions>
        </PaperShell>
      );
    } else if (!dims) {
      content = quietLoadPanel();
    } else {
      const d = dims[Math.min(dimIdx, dims.length - 1)];
      const value = scores[d.name] ?? 50;
      const last = dimIdx >= dims.length - 1;
      content = (
        <PaperShell onExit={saveAndExit} subProgress={(dimIdx + 1) / dims.length} footer={escapeFooter}>
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
            className="ob-slider"
            aria-label={d.name}
            aria-valuetext={value < 34 ? (d.anchor_low ?? "") : value < 67 ? (d.anchor_mid ?? "") : (d.anchor_high ?? "")}
            onChange={(e) => setScore(d.name, Number(e.target.value))}
            onPointerUp={(e) => void saveScores({ ...scores, [d.name]: Number((e.target as HTMLInputElement).value) })}
            onKeyUp={(e) => void saveScores({ ...scores, [d.name]: Number((e.target as HTMLInputElement).value) })}
            style={{ marginBlockStart: 26 }}
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
                  fontWeight: live ? 600 : 400,
                  padding: "6px 0",
                  transition: `color 220ms ${EASE}`,
                }}>
                  <span style={{ fontFamily: OB.mono, fontSize: "var(--ob-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: OB.muted, flexShrink: 0, paddingBlockStart: 2 }}>{tag}</span>
                  <span>{text}</span>
                </div>
              ))}
          </div>
          <Actions style={{ marginBlockStart: 26 }}>
            <OBButton onClick={() => {
              const committed = { ...scores, [d.name]: value };
              if (!scores[d.name]) setScore(d.name, value);
              void saveScores(committed);
              if (!last) { persistDimProgress(dimIdx + 1); setDimIdx((i) => i + 1); return; }
              const finalValues = dims.map((x) => committed[x.name] ?? value);
              const flatNow = Math.max(...finalValues) - Math.min(...finalValues) <= 15;
              if (flatNow && !flatAck) setFlatWarn(true); else go(10);
            }}>{last ? `Done — that's all ${dims.length}` : "Next"}</OBButton>
            {/* Back always exists here, and the first slider steps back a stage
                rather than off the beginning of the flow. */}
            <OBButton variant="tertiary" onClick={() => {
              if (dimIdx > 0) setDimIdx((i) => Math.max(0, i - 1)); else goBack(8);
            }}>Back</OBButton>
          </Actions>
          {last && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 8, justifyItems: "center", maxWidth: 420, marginLeft: "auto", marginRight: "auto", marginTop: 22,
            }}>
              {SHELF.map((s, i) => (
                <ShelfBadge key={s.key} label={s.label} tone={s.tone}
                  icon={SHELF_ICON[i]} hint={SHELF_HINT[i]}
                  unlocked={shelfState[i].unlocked} figure={shelfState[i].figure} />
              ))}
            </div>
          )}
          </>
          )}
        </PaperShell>
      );
    }
  }

  /* 10 — WHITE, before the questions */
  if (screen === 10) {
    if (!band) { content = bandPrompt(); } else {
    content = (
      <PaperShell onExit={saveAndExit} face footer={escapeFooter}>
        {contentError ? retryPanel(() => void loadQuestions()) : (
          <>
            <h1 style={{ ...h1Light, textAlign: "center" }}>This next bit is what makes it yours.</h1>
            <p style={{ ...bodyLight, textAlign: "center" }}>
              {ASSESSMENT_QUESTIONS_WORD.charAt(0).toUpperCase() + ASSESSMENT_QUESTIONS_WORD.slice(1)} questions about
              how you actually work — read together with your posts, what you captured and your sliders.
            </p>
            <p style={{ ...bodyLight, textAlign: "center" }}>
              What comes out is the signals in your read, the space nobody near you has claimed, and where the ground is
              still soft.
            </p>
            <p style={{ ...bodyLight, textAlign: "center" }}>{ASSESSMENT_QUESTIONS} questions. Two minutes. Saved as you go.</p>
            <Actions style={{ marginBlockStart: 24 }}>
              <OBButton onClick={() => { setQIdx(0); go(11); }} loading={!questions} loadingLabel="Loading…">
                Let's do it
              </OBButton>
            </Actions>
          </>
        )}
      </PaperShell>
    );
    }
  }

  /* 11 — WHITE, the nine questions */
  if (screen === 11) {
    if (!band) {
      content = bandPrompt();
    } else if (contentError) {
      content = (
        <PaperShell onExit={saveAndExit} footer={escapeFooter}>
          <h1 style={h1Light}>Give that one more go.</h1>
          <p style={bodyLight}>Aura couldn't reach the shelf for a second. Nothing is lost.</p>
          <Actions style={{ marginBlockStart: 20 }}><OBButton onClick={() => void loadQuestions()}>Try again</OBButton></Actions>
        </PaperShell>
      );
    } else if (!questions) {
      content = quietLoadPanel();
    } else {
      const q = questions[Math.min(qIdx, questions.length - 1)];
      const last = qIdx >= questions.length - 1;
      const advance = (value: string) => {
        /* one commit per question — a held Enter fired this twice and, because
           setQIdx is a functional update, both applied and a question was skipped */
        if (committedQRef.current === qIdx) return;
        committedQRef.current = qIdx;
        const next = { ...answers, [`Q${qIdx + 1} ${q.prompt}`]: value };
        setAnswers(next);
        setTextAnswer("");
        setMultiPicked([]);
        setSinglePicked(null);
        if (userId) {
          void saveAnswers(userId, next);
          /* Stamp the band that produced these answers, so a later band change
             discards them instead of merging two prompt sets. */
          if (band) void upsertProfile(userId, { answered_band: band }, "answered band stamp");
        }
        persistQuestionProgress(next, last ? qIdx : qIdx + 1);
        if (last) void finishQuestions(next); else setQIdx((i) => i + 1);
      };
      const back = () => {
        committedQRef.current = -1;
        setTextAnswer("");
        setMultiPicked([]);
        setSinglePicked(null);
        /* The write lives outside the updater — a state updater must be pure,
           and StrictMode double-invokes them. */
        const nextIdx = Math.max(0, qIdx - 1);
        persistQuestionProgress(answers, nextIdx);
        setQIdx(nextIdx);
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

      /* The headline can never promise three positions we are about to withdraw. */
      const promptText = proposedFallback ? "What position could only you credibly take?" : q.prompt;


      content = (
        <PaperShell onExit={saveAndExit} subProgress={(qIdx + 1) / questions.length} footer={escapeFooter}>
          <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            Question {qIdx + 1} of {questions.length}
          </p>
          {qIdx === 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: OB.muted }}>Saved as you go — you can stop any time.</p>
          ) : null}
          <h1 style={{ ...h1Light, marginBlockStart: 10, fontSize: "clamp(21px,5.6vw,27px)" }}>{promptText}</h1>
          {helperText ? <p style={bodyLight}>{helperText}</p> : null}
          {q.why_asked ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.55, color: OB.muted }}>
              <span style={{ fontFamily: OB.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", marginInlineEnd: 7 }}>Why this</span>
              {q.why_asked}
            </p>
          ) : null}

          {q.kind === "choice" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 20 }}>
                {opts.map((o, i) => optionButton(i, o.label, () => setSinglePicked(String(i)), singlePicked === String(i)))}
              </div>
              <Actions style={{ marginBlockStart: 16 }}>
                <OBButton disabled={!singlePicked} aria-describedby={!singlePicked ? "ob-q-why" : undefined} onClick={() => {
                  if (!singlePicked) return;
                  advance(opts[Number(singlePicked)]?.label ?? "");
                }}>Next</OBButton>
                {!singlePicked ? whyLine("ob-q-why", "Pick one answer to enable this.", true) : null}
              </Actions>
            </>
          ) : q.kind === "multi" ? (
            <>
              <p style={{ margin: "16px 0 0", fontSize: 12.5, color: OB.muted }}>Pick up to {cap}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 10 }}>
                {opts.map((o, i) => optionButton(
                  i,
                  o.label,
                  () => setMultiPicked((prev) => prev.includes(String(i)) ? prev.filter((x) => x !== String(i)) : [...prev, String(i)]),
                  multiPicked.includes(String(i)),
                  !multiPicked.includes(String(i)) && atCap,
                ))}
              </div>
              <Actions style={{ marginBlockStart: 16 }}>
                <OBButton disabled={multiPicked.length === 0} aria-describedby={multiPicked.length === 0 ? "ob-qm-why" : undefined} onClick={() => advance(
                  multiPicked.map((i) => opts[Number(i)]?.label ?? "").filter(Boolean).join(" · "),
                )}>Next</OBButton>
                {multiPicked.length === 0 ? whyLine("ob-qm-why", "Pick at least one to enable this.", true) : null}
              </Actions>
            </>
          ) : q.kind === "proposed" ? (
            proposedReady ? (
              <>
                <p style={{ margin: "14px 0 0", fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.12em", color: OB.muted }}>
                  From what Aura just read in your writing.
                </p>
                <p style={{ margin: "16px 0 0", fontSize: 12.5, color: OB.muted }}>
                  Keep the one that's actually you. The two you drop tell Aura just as much.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 10 }}>
                  {proposals!.map((pr, i) => (
                    /* the two the member is not keeping visibly recede */
                    <div key={i} style={{
                      display: "flex", flexDirection: "column",
                      opacity: singlePicked && singlePicked !== String(i) ? 0.55 : 1,
                      transition: `opacity 220ms ${EASE}`,
                    }}>
                      {optionButton(i, pr.label, () => setSinglePicked(String(i)), singlePicked === String(i), false, pr.why)}
                    </div>
                  ))}
                </div>
                <Actions style={{ marginBlockStart: 16 }}>
                  <OBButton disabled={!singlePicked} aria-describedby={!singlePicked ? "ob-qp-why" : undefined} onClick={() => {
                    if (!singlePicked) return;
                    const kept = proposals![Number(singlePicked)]?.label ?? "";
                    const dropped = proposals!.filter((_, i) => String(i) !== singlePicked).map((x) => x.label);
                    advance(`${kept}${dropped.length ? ` (not: ${dropped.join(", ")})` : ""}`);
                  }}>Next</OBButton>
                  {!singlePicked ? whyLine("ob-qp-why", "Keep the one that's actually you to enable this.", true) : null}
                </Actions>
              </>
            ) : proposedFallback ? (
              <>
                <p style={{ margin: "16px 0 0", fontSize: 12.5, color: OB.muted }}>
                  Aura hasn't got enough of your writing to propose three yet — say it in your own words instead.
                </p>
                <input value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                  aria-label={q.prompt}
                  onFocus={rotatePlaceholder}
                  onKeyDown={(e) => {
                    if (e.repeat) return;
                    if (e.key === "Enter" && textAnswer.trim()) advance(textAnswer.trim());
                  }}
                  placeholder={placeholder} style={{ ...fieldStyle, marginBlockStart: 12 }} />
                <Actions style={{ marginBlockStart: 16 }}>
                  <OBButton disabled={!textAnswer.trim()} aria-describedby={!textAnswer.trim() ? "ob-qtf-why" : undefined}
                    onClick={() => advance(textAnswer.trim())}>Next</OBButton>
                  {!textAnswer.trim() ? whyLine("ob-qtf-why", "Write an answer to enable this.", true) : null}
                </Actions>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: OB.muted, marginBlockStart: 20 }}>
                <Loader2 size={14} className="animate-spin" /> Reading your posts and what you captured…
              </div>
            )
          ) : (
            <>
              <input value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                aria-label={q.prompt}
                onFocus={rotatePlaceholder}
                onKeyDown={(e) => {
                  if (e.repeat) return;
                  if (e.key === "Enter" && textAnswer.trim()) advance(textAnswer.trim());
                }}
                placeholder={placeholder} style={{ ...fieldStyle, marginBlockStart: 20 }} />
              <Actions style={{ marginBlockStart: 16 }}>
                <OBButton disabled={!textAnswer.trim()} aria-describedby={!textAnswer.trim() ? "ob-qt-why" : undefined}
                  onClick={() => advance(textAnswer.trim())}>Next</OBButton>
                {!textAnswer.trim() ? whyLine("ob-qt-why", "Write an answer to enable this.", true) : null}
              </Actions>
            </>
          )}

          <Actions style={{ marginBlockStart: 12 }}>
            {showNone ? (
              <OBButton variant="tertiary" onClick={() => advance("None of these fit")}>None of these fit</OBButton>
            ) : null}
            <OBButton variant="tertiary" onClick={() => { if (qIdx > 0) back(); else goBack(10); }}>Back</OBButton>
          </Actions>

          {/* Named once, on the last screen before the account wall — nowhere else. */}
          {!userId && anonToken && qIdx === questions.length - 1 ? (
            <div style={{
              marginBlockStart: 20, padding: "14px 16px", borderRadius: 12,
              background: OB.canvas, border: `1px solid ${OB.line}`,
            }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: OB.ink }}>This is still anonymous.</p>
              <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6, color: OB.muted }}>
                Everything you've done is saved to this browser. Saving your report is what makes it yours.
              </p>
            </div>
          ) : null}
        </PaperShell>
      );
    }
  }

  /* The wall — asked once, and only here, and only AFTER screen 12 has made the
     case. The ask never precedes the inventory of what he now owns. */
  if (!userId && anonToken && screen >= 13) {
    const openAccount = async (e: React.FormEvent) => {
      e.preventDefault();
      if (wallBusy) return;
      setWallError(null);
      setWallEmailError(null);
      setWallPasswordError(null);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wallEmail.trim())) {
        setWallEmailError("That doesn't look like an email address. Check it and try again."); return;
      }
      if (wallPassword.length < 8) { setWallPasswordError("Use eight characters or more."); return; }
      if (!wallConsent) return;
      setWallBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("auth-signup", {
          body: {
            email: wallEmail.trim().toLowerCase(), password: wallPassword,
            origin: window.location.origin, consent_version: CONSENT_VERSION,
          },
        });
        type SignupResult = { ok?: boolean; existing?: boolean; code?: string; error?: string };
        let result = data as SignupResult | null;
        /* A non-2xx from the function arrives as an error with the body still
           attached. The specific complaint lives there — read it, never bin it. */
        if (!result && error) {
          try { result = (await (error as any)?.context?.json?.()) as SignupResult; } catch { /* not JSON */ }
        }
        if (result?.existing) {
          setWallError("You already have an account with that address. Sign in and your report is waiting.");
          return;
        }
        if (result?.code === "signup_limit") {
          setWallError("That is as many accounts as can be opened from this network today. It lifts in 24 hours. Write to support@aura-intel.org and it is sorted by hand in the meantime.");
          return;
        }
        if (result?.code === "temporarily_unavailable") {
          setWallError("Our end didn't answer. That's ours, not yours. Nothing you entered is lost — press once more.");
          return;
        }
        const msg = result?.error || error?.message;
        if (msg) {
          /* A 400 from account creation carries a real complaint about one of
             the two fields. It belongs under that field, not in a block. */
          const lower = msg.toLowerCase();
          if (lower.includes("password")) { setWallPasswordError(msg); return; }
          if (lower.includes("email") || lower.includes("address")) { setWallEmailError(msg); return; }
          setWallError(msg);
          return;
        }
        const { data: signedIn } = await supabase.auth.signInWithPassword({
          email: wallEmail.trim().toLowerCase(), password: wallPassword,
        });
        if (signedIn?.session) {
          const res = await handoffAnonRun({
            token: anonToken,
            uid: signedIn.session.user.id,
            accessToken: signedIn.session.access_token,
            state: (anonStateRef.current ?? {}) as AssessmentState & Record<string, any>,
            startedAt: sessionStartedAtRef.current,
          });
          if (!res.ok) {
            setWallError("We could not attach your report to your account yet — nothing is lost. Try again.");
            return;
          }
          window.location.replace("/onboarding");
          return;
        }
        setWallDone("Your account is open. Sign in and everything you just answered is waiting.");
      } catch {
        setWallError("We couldn't reach Aura just now. Check your connection — nothing you entered is lost.");
      } finally {
        setWallBusy(false);
      }
    };
    return (
      <>
      <style>{PAGE_CSS}</style>
      <JourneyNav.Provider value={{ onBack: undefined, banner: null, screen, name: firstName || null }}>
      <PaperShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={{ fontFamily: OB.ui, fontSize: 28, fontWeight: 700, color: OB.ink }}>
          {WALL.heading}
        </h1>
        <p style={{ fontFamily: OB.ui, fontSize: 15, color: OB.muted, marginBlockStart: 10 }}>
          {WALL.body}
        </p>
        {wallDone ? (
          <>
            <p role="status" style={{ marginBlockStart: 18, color: OB.ink, fontFamily: OB.ui }}>{wallDone}</p>
            <Actions style={{ marginBlockStart: 18 }}>
              <OBButton onClick={() => { window.location.assign("/auth"); }}>Sign in</OBButton>
            </Actions>
          </>
        ) : (
          <form onSubmit={openAccount} style={{ marginBlockStart: 18 }}>
            <label htmlFor="ob-wall-email" style={{ display: "block", fontSize: 13, color: OB.muted, marginBlockEnd: 6 }}>Your email</label>
            <input id="ob-wall-email" type="email" autoComplete="email" value={wallEmail}
              onChange={(e) => setWallEmail(e.target.value)} style={fieldStyle} />
            <div aria-live="polite">
              {wallEmailError && <p style={{ fontSize: 13, color: OB.err, marginBlockStart: 6 }}>{wallEmailError}</p>}
            </div>
            <label htmlFor="ob-wall-pwd" style={{ display: "block", fontSize: 13, color: OB.muted, margin: "16px 0 6px" }}>A password</label>
            <input id="ob-wall-pwd" type="password" autoComplete="new-password" value={wallPassword}
              onChange={(e) => setWallPassword(e.target.value)} style={fieldStyle} />
            <p style={{ fontSize: 12, color: OB.muted, marginBlockStart: 6 }}>Eight characters or more.</p>
            <div aria-live="polite">
              {wallPasswordError && <p style={{ fontSize: 13, color: OB.err, marginBlockStart: 6 }}>{wallPasswordError}</p>}
            </div>
            <div aria-live="polite">
              {wallError && <p style={{ fontSize: 13, color: OB.err, marginBlockStart: 10 }}>{wallError}</p>}
            </div>
            <label htmlFor="ob-wall-consent" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBlockStart: 16, fontSize: 13, color: OB.muted }}>
              <input id="ob-wall-consent" type="checkbox" checked={wallConsent}
                onChange={(e) => setWallConsent(e.target.checked)}
                style={{ width: 20, height: 20, flexShrink: 0, marginBlockStart: 1, accentColor: OB.blue, cursor: "pointer" }} />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener" style={{ color: OB.blue, textDecoration: "underline" }}>Terms</a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener" style={{ color: OB.blue, textDecoration: "underline" }}>Privacy Policy</a>.
                My data is processed under Saudi PDPL, and I can delete everything in one click.
              </span>
            </label>
            <Actions style={{ marginBlockStart: 18 }}>
              <OBButton disabled={wallBusy || !wallConsent} aria-describedby={!wallConsent ? "ob-wall-why" : undefined}
                onClick={() => undefined} type="submit">
                {wallBusy ? WALL.ctaBusy : WALL.cta}
              </OBButton>
              {!wallConsent && !wallBusy ? whyLine("ob-wall-why", "Tick the box above to enable this.", true) : null}
            </Actions>
            <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: OB.muted }}>{WALL.sub}</p>
          </form>
        )}
      </PaperShell>
      </JourneyNav.Provider>
      </>
    );
  }

  /* 12 — WHITE, the shelf */
  if (screen === 12) {
    /* WHAT HE NOW OWNS — the case, made before the ask. Every row is drawn
       from real state; a row with no value does not render at all. */
    const anonRead = ((anonStateRef.current as any)?.read ?? null) as Record<string, any> | null;
    const ownArchetype = String(reveal?.archetype || anonRead?.archetype || "").trim();
    const ownSubjects = (reveal?.subjects?.length ?? 0) || (Array.isArray(anonRead?.themes) ? anonRead!.themes.length : 0);
    const ownCapabilities = Object.keys(scores ?? {}).length;
    const ccFindings = Array.isArray((cvCrosscheck as any)?.findings)
      ? ((cvCrosscheck as any).findings as any[]).filter((f) => f && (f.what || f.do_this)).length
      : 0;
    const ownGap = String(readRaw?.honest_gap || anonRead?.honest_gap || "").trim();
    const ownRows: Array<{ label: string; value: string }> = [];
    if (ownArchetype) ownRows.push({ label: ENDING.rowArchetype, value: ownArchetype });
    if (ownSubjects > 0) ownRows.push({ label: ENDING.rowSubjectsLabel, value: ENDING.rowSubjects(ownSubjects) });
    if (ownCapabilities > 0) ownRows.push({ label: ENDING.rowCapabilitiesLabel, value: ENDING.rowCapabilities(ownCapabilities) });
    if (ccFindings > 0) ownRows.push({ label: ENDING.rowCrosscheckLabel, value: ENDING.rowCrosscheck(ccFindings) });
    if (ownGap) ownRows.push({ label: ENDING.rowGapLabel, value: ownGap });

    if (arrival || (!userId && anonToken)) {
      content = (
        <PaperShell onExit={saveAndExit} footer={escapeFooter}>
          <p style={{ fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>{ENDING.eyebrow}</p>
          <h1 style={{ ...h1Light, marginBlockStart: 10 }}>{ENDING.headline}</h1>
          <p style={{ ...bodyLight }}>{ENDING.body}</p>

          {ownRows.length ? (
            <div style={{ marginBlockStart: 22 }}>
              <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted, textTransform: "uppercase" }}>
                {ENDING.yoursHead}
              </p>
              <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {ownRows.map((r) => (
                  <li key={r.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: "var(--ob-small)", color: OB.muted }}>{r.label}</span>
                    <span style={{ fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", color: OB.ink, fontWeight: 600 }}>{r.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The loss is true only while there is no account. */}
          {!userId ? (
            <p style={{
              margin: "22px 0 0", paddingInlineStart: 14, borderInlineStart: "3px solid #E0A82E",
              fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", color: OB.ink,
            }}>{ENDING.loss}</p>
          ) : null}

          <div style={{ marginBlockStart: 26, opacity: 0.72 }}>
            <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted, textTransform: "uppercase" }}>
              {ENDING.tenthHead}
            </p>
            <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {ENDING.tenth.map((line) => (
                <li key={line} style={{ position: "relative", paddingInlineStart: 18, fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted }}>
                  <span aria-hidden style={{
                    position: "absolute", insetInlineStart: 0, insetBlockStart: 7,
                    inlineSize: 7, blockSize: 7, borderRadius: 999, border: `1px solid ${OB.muted}`,
                  }} />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p style={{ ...bodyLight, marginBlockStart: 22 }}>{ENDING.closing}</p>

          <Actions style={{ marginBlockStart: 22 }}>
            <OBButton onClick={() => {
              try { localStorage.removeItem("aura_just_joined"); } catch { /* private mode */ }
              setArrival(null);
              go(13);
            }}>{userId ? ENDING.ctaSignedIn : ENDING.cta}</OBButton>
          </Actions>
          <p style={{ margin: "10px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.muted, textAlign: "center" }}>
            {ENDING.ctaSub}
          </p>
          <Actions style={{ marginBlockStart: 10 }}>
            <OBButton variant="tertiary" onClick={saveAndExit}>{ENDING.finishLater}</OBButton>
          </Actions>
        </PaperShell>
      );
    } else {
    /* Only the work that actually happened is shown, and a step only ticks on a
       real event. The three reading steps have no event of their own, so they
       stay plain named lines until the read itself lands. */
    const genStages: WorkingStage[] = revealPending
      ? marketRun.stages
      : buildStages("market_read", { completed: ["gather", "write"], active: null });
    content = (
      <PaperShell onExit={saveAndExit} footer={escapeFooter}>
        {!revealPending ? <Confetti /> : null}
        {revealPending ? (
          <div style={{ marginBlockEnd: 22 }}>
            <WorkingPanel
              operation="market_read"
              title="Writing your read"
              stages={genStages}
              runId={revealRunId}
            />
          </div>
        ) : null}
        <h1 style={{ ...h1Light, textAlign: "center" }}>Here's what Aura now knows about you.</h1>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8, justifyItems: "center", maxWidth: 420, margin: "26px auto 6px",
        }}>
          {SHELF.map((s, i) => (
            <ShelfBadge key={s.key} label={s.label} sublabel={SHELF_SUB[i]}
              tone={s.tone}
              icon={SHELF_ICON[i]} hint={SHELF_HINT[i]}
              unlocked={shelfState[i].unlocked} figure={shelfState[i].figure} />
          ))}
        </div>
        <p style={{ ...bodyLight, textAlign: "center" }}>
          {proof && proof.posts > 0 ? (
            <>
              I have {num(proof.posts)} of your posts and {num(proof.words)} words in your own voice
              {proof.pctWithNumber !== null ? `, ${proof.pctWithNumber}% of them carrying a real number` : ""}
              {claims.length ? `, plus ${num(claims.length)} things you captured` : ""}. That is what I write from — not a
              template.
            </>
          ) : (
            <>
              {EMPTY_POSTS_LINE}
              {claims.length ? ` I already have ${num(claims.length)} ${claims.length === 1 ? "thing" : "things"} you captured and your own answers on file.` : " I already have your own answers on file."}
            </>
          )}
        </p>
        <p style={{ ...bodyLight, textAlign: "center" }}>
          {mayPromiseMorning
            ? "Tonight I read for the signals in your read. Tomorrow morning there's something waiting."
            : "I'll keep reading for the signals in your read. When something is worth your name on it, you'll hear — not before."}
        </p>
        {revealPending && proof && proof.lines.length > 0 ? (
          <WaitProof lines={proof.lines} startAt={3} howLong="Writing your read. About a minute." />
        ) : null}
        <Actions style={{ marginBlockStart: 24 }}>
          <OBButton onClick={() => go(13)} loading={revealPending && !revealSlow} loadingLabel="Writing your read…">
            {revealPending && revealSlow ? "See what I have so far" : "See how people see me"}
          </OBButton>
        </Actions>
      </PaperShell>
    );
    }
  }

  /* 13 — FULL-BLEED BLUE */
  if (screen === 13) {
    const shareFooter = { posts: postsRead ?? 0, saved: claims.length };
    const caption = suggestedCaption(postsRead ?? 0);
    const liveCaption = captionDraft.trim() || caption;
    /* one rasterisation at a time: post, download and report all read the same DOM node */
    const busy = sharing || posting || buildingReport || savingDraft;

    const downloadRead = async () => {
      if (!shareRef.current) return;
      if (busy) return;
      setSharing(true);
      try {
        const how = await shareRevealCard(shareRef.current, { caption: liveCaption });
        toast.success(how === "shared"
          ? "Sent to your share sheet."
          : "Image saved — the caption is on your clipboard, ready to paste.");
      } catch (err) {
        console.error("[reveal] share failed", err);
        toast.error("Couldn't build the image. Your read is safe — it's on your Home.");
      } finally {
        setSharing(false);
      }
    };

    const brandPaper: BrandPaper | null = (() => {
      if (!readRaw) return null;
      try {
        const p = buildBrandPaper(readRaw, { first_name: firstName.trim() || null });
        return p && (p.positioning_statement || p.market_read || p.topics.length) ? p : null;
      } catch (e) {
        console.error("[reveal] brand paper build failed", e);
        return null;
      }
    })();

    const downloadFullReport = async () => {
      if (!paperMountRef.current) return;
      if (busy) return;
      setBuildingReport(true);
      try {
        const slug = (firstName.trim() || "profile").toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile";
        const date = new Date().toISOString().slice(0, 10);
        await exportReportPdf(paperMountRef.current, `aura-position-${slug}-${date}.pdf`);
        toast.success("Report downloaded.");
      } catch (err) {
        console.error("[reveal] report export failed", err);
        toast.error("Couldn't build the report just now — it's waiting for you inside Aura.");
      } finally {
        setBuildingReport(false);
      }
    };

    /* Minting the share link and copying it live on the after-keep screen —
       nothing on the reveal competes with the one decision. */
    content = (
      <div className="obc" style={{
        minBlockSize: "100dvh",
        overflow: "clip",
        /* Blue, and only blue. Cyan is decoration — never a fill. */
        background: "linear-gradient(170deg, var(--ob-blue), var(--ob-blue-light))",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px",
      }}>
        <div className="obc-in" style={{ inlineSize: "100%", maxInlineSize: "var(--ob-max)" }}>
          {reveal ? <RevealCard data={reveal} footer={shareFooter} /> : revealLoading ? (
            /* The read may already be finished and sitting in the database.
               While we are still asking, say nothing about where it is. */
            <div role="status" style={{ textAlign: "center", color: "var(--ob-white)" }}>
              <p style={{ fontSize: 16, lineHeight: 1.6 }}>Opening your read…</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--ob-white)" }}>
              <p style={{ fontSize: 16, lineHeight: 1.6 }}>
                {readDone
                  ? "Your read is saved. You'll find it on your Home."
                  : "Aura is still writing your read. It'll be on your Home the moment it's done."}
              </p>
              <Actions style={{ marginBlockStart: 20 }}>
                <OBButton onClick={() => go(SHARE_SCREEN)}
                  style={{ background: "var(--ob-white)", color: "var(--ob-blue)" }}>{ENDING.cta}</OBButton>
              </Actions>
            </div>
          )}
          {reveal ? (
          <>
          {/* the same card, laid out for the exported image */}
          {reveal ? (
            /* html2canvas mis-handles fixed positioning at a large negative
               offset — an absolute node inside a relative box rasterises. */
            <div style={{ position: "relative", width: 0, height: 0, overflow: "visible" }} aria-hidden>
              <div style={{ position: "absolute", left: -10000, top: 0, pointerEvents: "none" }}>
                <RevealCard ref={shareRef} data={reveal} footer={shareFooter} forExport />
              </div>
            </div>
          ) : null}
          {reveal && brandPaper ? (
            <div style={{ position: "relative", width: 0, height: 0, overflow: "visible" }} aria-hidden>
              <div ref={paperMountRef} style={{
                position: "absolute", left: -10000, top: 0,
                width: 794, pointerEvents: "none", zIndex: -1,
              }}>
                <BrandPaperDocument paper={brandPaper} />
              </div>
            </div>
          ) : null}
          {/* Share copy is not edited before the decision to share — it lives on
             the after-keep screen. */}
          <Actions style={{ marginBlockStart: 20 }}>
          {/* ONE primary. Every other option moved after the decision. */}
          <OBButton disabled={busy} loading={buildingReport} loadingLabel="Building your read…"
            onClick={async () => { if (brandPaper) await downloadFullReport(); go(SHARE_SCREEN); }}
            style={{ background: "#FFFFFF", color: OB.blue }}>{ENDING.cta}</OBButton>
          {brandPaper ? (
            brandPaper.the_gap || brandPaper.own_words_quote ? (
              <p style={{
                margin: "-2px 0 0", fontSize: 12.5, lineHeight: 1.55,
                color: "rgba(255,255,255,.80)", textAlign: "center",
              }}>The full read includes the gap. The card doesn't.</p>
            ) : null
          ) : (
            /* A promised deliverable never vanishes in silence. */
            <p style={{
              margin: 0, fontSize: 12.5, lineHeight: 1.55,
              color: "rgba(255,255,255,.85)", textAlign: "center",
            }}>Your full read is still being written. It'll be in your inbox and on your Home page shortly.</p>
          )}
          {postedUrl ? (
            <a href={postedUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "block", textAlign: "center", color: "#FFFFFF", fontSize: 14,
              textDecoration: "underline", padding: "10px 0",
            }}>View it on LinkedIn</a>
          ) : null}
          <OBButton variant="tertiary" onClick={() => go(SHARE_SCREEN)}
            style={{ color: "rgba(255,255,255,.72)" }}>Continue without downloading</OBButton>
          </Actions>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,.85)", textAlign: "center" }}>
            {REPORT_FREE_LINE}
          </p>
          <p style={{
            margin: "12px 0 0", fontSize: 12, lineHeight: 1.7,
            color: "rgba(255,255,255,.80)", textAlign: "center",
          }}>
            This is a read, not a verdict. <ReadCorrection userId={userId} onNight inline /> ·{" "}
            <MethodNote onNight inline />
          </p>
          </>
          ) : null}
        </div>
      </div>
    );
  }

  /* 13.5 — AFTER HE HAS KEPT IT. Sharing is offered here and nowhere earlier. */
  if (screen === SHARE_SCREEN) {
    const caption = suggestedCaption(postsRead ?? 0);
    const liveCaption = captionDraft.trim() || caption;
    const shareFooter = { posts: postsRead ?? 0, saved: claims.length };
    const busy = sharing || posting || buildingReport || savingDraft;

    const downloadCard = async () => {
      if (!shareRef.current || busy) return;
      setSharing(true);
      try {
        const how = await shareRevealCard(shareRef.current, { caption: liveCaption });
        toast.success(how === "shared"
          ? "Sent to your share sheet."
          : "Image saved — the caption is on your clipboard, ready to paste.");
      } catch (err) {
        console.error("[reveal] share failed", err);
        toast.error("Couldn't build the image. Your read is safe — it's on your Home.");
      } finally {
        setSharing(false);
      }
    };

    const mintShare = async () => {
      if (!userId || !reveal || shareUrl || minting) return;
      setMinting(true);
      try {
        const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const isArabic = /[\u0600-\u06FF]/.test(`${reveal.archetype} ${reveal.marketRead || ""}`);
        const { error } = await (supabase.from("report_shares") as any).insert({
          token,
          user_id: userId,
          headline: reveal.archetype,
          archetype: reveal.archetype,
          market_read: reveal.marketRead || null,
          subjects: reveal.subjects ?? [],
          own_words: reveal.ownWordsQuote || null,
          display_name: firstName.trim() || null,
          lang: isArabic ? "ar" : "en",
        });
        if (error) throw error;
        setShareUrl(`${window.location.origin}/r/${token}`);
      } catch (err) {
        console.error("[reveal] share link failed", err);
        toast.error("Couldn't make the link just now. Try again in a moment.");
      } finally {
        setMinting(false);
      }
    };

    const shareText = shareUrl ? `${liveCaption}\n\n${shareUrl}` : liveCaption;
    const copyShareLink = async () => {
      if (!shareUrl) return;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied.");
      } catch {
        toast.error("Couldn't copy that. Long-press the link to copy it.");
      }
    };

    content = (
      <PaperShell onExit={saveAndExit} footer={escapeFooter}>
        <h1 style={{ ...h1Light }}>{AFTER_KEEP.heading}</h1>
        <p style={{ ...bodyLight }}>{AFTER_KEEP.body}</p>

        {reveal ? (
          <div style={{ position: "relative", width: 0, height: 0, overflow: "visible" }} aria-hidden>
            <div style={{ position: "absolute", left: -10000, top: 0, pointerEvents: "none" }}>
              <RevealCard ref={shareRef} data={reveal} footer={shareFooter} forExport />
            </div>
          </div>
        ) : null}

        <div style={{ marginBlockStart: 18 }}>
          <label htmlFor="ob-caption" style={{ display: "block", fontSize: 12.5, color: OB.muted, marginBlockEnd: 6 }}>
            {AFTER_KEEP.captionLabel}
          </label>
          <textarea
            id="ob-caption"
            dir="auto"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            rows={4}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </div>

        <Actions style={{ marginBlockStart: 18 }}>
          {!shareUrl ? (
            <OBButton variant="secondary" disabled={!reveal || minting} loading={minting} loadingLabel="Making your link…"
              onClick={() => void mintShare()}>{AFTER_KEEP.share}</OBButton>
          ) : null}
          <OBButton variant="tertiary" disabled={!reveal || busy} onClick={() => void downloadCard()}>
            {sharing ? "Building…" : AFTER_KEEP.download}
          </OBButton>
        </Actions>

        {shareUrl ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBlockStart: 14 }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank" rel="noopener noreferrer" style={quietLink}>WhatsApp</a>
              <a href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`}
                target="_blank" rel="noopener noreferrer" style={quietLink}>LinkedIn</a>
              <button type="button" onClick={() => void copyShareLink()} style={quietLink}>Copy link</button>
            </div>
            <p style={{ margin: "12px 0 0", fontFamily: OB.mono, fontSize: 11.5, lineHeight: 1.6, color: OB.muted }}>
              Anyone with this link sees your read. Nothing else — no email, no captures, no drafts.
            </p>
          </>
        ) : null}

        <Actions style={{ marginBlockStart: 18 }}>
          <OBButton variant="tertiary" onClick={() => go(14)}>{AFTER_KEEP.continue}</OBButton>
        </Actions>
      </PaperShell>
    );
  }

  /* 13b — WHITE, and only after 13 */
  if (screen === 14) {
    content = (
      <PaperShell onExit={saveAndExit} face footer={escapeFooter}>
        <h1 style={{ ...h1Light, textAlign: "center" }}>When should I bring it to you?</h1>
        <p style={{ ...bodyLight, textAlign: "center" }}>
          I read overnight. Tell me when your day starts and that's when it's waiting.
        </p>
        <div style={{ display: "flex", gap: 9, marginBlockStart: 20 }}>
          {(["Morning", "Midday", "Evening"] as const).map((slot) => (
            <button key={slot} type="button" onClick={() => void chooseDailyTime(slot)} style={{
              flex: 1, padding: "13px 8px", borderRadius: RADIUS.card, cursor: "pointer",
              fontFamily: "inherit", fontSize: 13.5, fontWeight: dailyTime === slot ? 700 : 500,
              background: dailyTime === slot ? OB.blue : OB.canvas,
              border: `1px solid ${dailyTime === slot ? OB.blue : OB.line}`,
              color: dailyTime === slot ? "#FFFFFF" : OB.ink,
              minBlockSize: 44,
            }}>{slot}</button>
          ))}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: OB.muted, textAlign: "center" }}>
          Your time zone · {timeZone}
        </p>

        {/* 1 · One feedback question */}
        <div style={{ marginBlockStart: 24 }}>
          <p style={{ margin: 0, fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted, textTransform: "uppercase" }}>
            One question
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", color: OB.ink }}>
            Was that read accurate about you?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBlockStart: 14 }}>
            {optionButton("reveal-yes", "Yes, close", () => void handleRevealFeedback(5, revealMessage), revealRating === 5)}
            {optionButton("reveal-partly", "Partly", () => void handleRevealFeedback(3, revealMessage), revealRating === 3)}
            {optionButton("reveal-no", "Not really", () => void handleRevealFeedback(1, revealMessage), revealRating === 1)}
          </div>
          {revealRating !== null ? (
            <textarea
              aria-label="What did it miss? (optional)"
              value={revealMessage}
              onChange={(e) => setRevealMessage(e.target.value)}
              onBlur={() => { if (revealRating !== null && revealMessage.trim()) void handleRevealFeedback(revealRating, revealMessage.trim()); }}
              placeholder="What did it miss? (optional)"
              rows={3}
              style={{ ...fieldStyle, marginBlockStart: 14, resize: "vertical" }}
            />
          ) : null}
        </div>

        {/* 2 · What a seat adds, and what stays out of reach */}
        <div style={{ marginBlockStart: 28, padding: 18, borderRadius: RADIUS.card, border: `1px solid ${OB.line}`, background: OB.canvas }}>
          <p style={{ margin: 0, fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", fontWeight: 700, color: OB.ink }}>
            {SEAT_HEADING}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", fontWeight: 600, color: OB.ink }}>
            {SEAT_ONE_JOB}
          </p>
          <p style={{ margin: "18px 0 0", fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            {SEAT_HOW_LABEL}
          </p>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {SEAT_ROWS.map((row, i) => (
              <li key={i} style={{ fontSize: "var(--ob-small)", lineHeight: 1.6, color: OB.muted, paddingInlineStart: 18, position: "relative" }}>
                <span style={{ position: "absolute", insetInlineStart: 0, color: OB.blue }}>—</span>
                {row}
              </li>
            ))}
          </ul>
          <p style={{ margin: "18px 0 0", fontFamily: OB.mono, fontSize: 11, letterSpacing: "0.14em", color: OB.muted }}>
            What stays out of reach without one
          </p>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {LOSS_LINES.map((line, i) => (
              <li key={i} style={{ fontSize: "var(--ob-body)", lineHeight: "var(--ob-lh)", color: OB.ink, paddingInlineStart: 18, position: "relative" }}>
                <span style={{ position: "absolute", insetInlineStart: 0, color: OB.blue }}>—</span>
                {line}
              </li>
            ))}
          </ul>
          <p style={{ margin: "16px 0 0", fontSize: "var(--ob-body)", fontWeight: 600, color: OB.ink }}>{SEAT_PRICE}</p>
          <p style={{ margin: "4px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.muted }}>{SEAT_PRICE_SUBLINE}</p>
          <p style={{ margin: "8px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.ink }}>{SEAT_CONSTRAINT}</p>
          <Actions style={{ marginBlockStart: 16 }}>
            {/* One primary. Both seat doors complete the journey before they
                leave — a reserved seat used to strand the member on screen 14
                with no read email and onboarding_step stuck at 3. */}
            <OBButton onClick={() => void finish()}>Take me in</OBButton>
            <OBButton
              variant="secondary"
              style={{ borderColor: OB.blue, color: OB.blue, background: "#FFFFFF" }}
              onClick={() => void leaveForSeat("reserve_69")}
            >
              {SEAT_CTA}
            </OBButton>
            <OBButton variant="tertiary" onClick={() => void leaveForSeat("keep_posted")}>
              {SEAT_CTA_SECONDARY}
            </OBButton>
            {connected || !userId ? null : (
              /* A settings action, dressed as one: quiet, in the same row. */
              <OBButton variant="tertiary" onClick={() => void connectLinkedIn({ allowRedirect: true })}
                loading={connecting} loadingLabel="Connecting…">
                Connect LinkedIn
              </OBButton>
            )}
          </Actions>
          <p style={{ margin: "10px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.muted, textAlign: "center" }}>
            {SEAT_RESERVE_NOTE}
          </p>
          {connected || !userId ? null : (
            <p style={{ margin: "10px 0 0", fontSize: "var(--ob-small)", lineHeight: 1.55, color: OB.muted, textAlign: "center" }}>
              {connectNote || "Connect LinkedIn and you find out which of the signals in your read your audience already rewards."}
            </p>
          )}
        </div>


        {connected || userId ? null : (
          <p style={{ ...bodyLight, textAlign: "center" }}>{CONNECT_AFTER_ACCOUNT}</p>
        )}

        <p style={footnote}>Aura publishes only when you approve it. Nothing goes out in your name on its own.</p>
      </PaperShell>
    );
  }

  return (
    <>
      <style>{PAGE_CSS}</style>
      {exitNote ? (
        <div role="status" style={{
          position: "fixed", insetBlockStart: 12, insetInline: 0, zIndex: 60, display: "flex", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <span style={{
            background: OB.ink, color: "#FFFFFF", fontSize: 13, borderRadius: 999, padding: "9px 16px",
            boxShadow: "0 8px 24px rgba(15,21,25,.22)",
          }}>{exitNote}</span>
        </div>
      ) : null}
      <JourneyNav.Provider value={{
        onBack: screen === 1 && step1Phase === "result"
          ? () => returnToAddress()
          : canBack
            ? goBack
            : screen === 0 && anonToken && (anonStateRef.current as any)?.read
              ? () => { void backToRead(); }
              : undefined,
        banner: resumeBanner,
        screen,
        name: firstName || null,

      }}>
        {content}
      </JourneyNav.Provider>
    </>
  );
};

export default Onboarding;