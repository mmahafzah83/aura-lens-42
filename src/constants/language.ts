/**
 * AURA LANGUAGE SYSTEM — MANDATORY FOR ALL FUTURE CHANGES
 *
 * Every user-facing string lives here.
 * When adding new features, add strings here first, then import.
 *
 * RULES:
 * 1. Simple English — a 12-year-old should understand every word
 * 2. Never describe the tool — describe who the user BECOMES
 * 3. Hit the nerve: their expertise is invisible. Visibility = credibility.
 * 4. One action per moment
 * 5. No jargon: never "generate", "process", "optimize", "leverage", "sync"
 * 6. The user is an expert. Aura amplifies them — it doesn't teach them.
 *
 * WORKFLOW:
 * 1. Check this file first — the string may already exist
 * 2. If it doesn't exist, ADD it here, then import it
 * 3. NEVER hardcode user-facing strings in components
 *
 * BANNED WORDS (never use in any user-facing text):
 * generate, activate, process, optimize, leverage, ecosystem,
 * dashboard, metrics, analytics, pipeline, sync, configure,
 * parse, render, initialize, validate, authenticate, token,
 * model, inference, embedding, API, endpoint, parameters,
 * schema, deploy, bandwidth, scalable, disruptive, cutting-edge,
 * best-in-class, game-changer, seamless, empower, solutions,
 * utilize, functionality, onboard, credentials
 */

// ════════════════════════════════════
// LOADING STATES
// ════════════════════════════════════
export const LOADING = {
  writing: "Writing...",
  reading: "Reading...",
  looking: "Looking...",
  thinking: "Thinking...",
  moment: "One moment...",
  saving: "Saving...",
  updating: "Updating...",

  // Progressive loading for post generation
  postGeneration: [
    "Reading your signals...",
    "Matching your voice...",
    "Writing...",
  ],

  // Progressive loading for capture
  captureProgress: [
    "Reading the article...",
    "Finding patterns...",
    "Saved.",
  ],
} as const;

// ════════════════════════════════════
// TOASTS & NOTIFICATIONS
// ════════════════════════════════════
export const TOAST = {
  captureSaved: "Saved. Aura is on it.",
  draftReady: "Your draft is ready.",
  copied: "Copied. Go put your name on it.",
  draftSaved: "Saved. It's here when you're ready.",
  voiceLocked: "Voice locked in. From now on, every post sounds like the best version of you.",
  assessmentDone: "Done. Aura sees who you are now — and everything it creates will reflect it.",
  numbersIn: "Numbers in. Now Aura knows what resonates with your audience.",
  inviteSent: "Sent. They're about to discover what you already know.",
  published: "Published.",
  urlLinked: "Linked. Performance data will flow back.",
  scoreUpdated: "Your score just moved.",
} as const;

// ════════════════════════════════════
// ERROR MESSAGES
// ════════════════════════════════════
export const ERROR = {
  generic: "Didn't connect. Try once more.",
  invalidUrl: "That link didn't work. Double-check it?",
  rateLimited: "Give it a second. Aura's catching up.",
  aiResting: "Taking a breather. Back in a moment.",
  sessionExpired: "Session expired. Sign back in — everything's still here.",
  internalError: "Something's off on our end. We're on it.",
  chatError: "Lost the thread. Send that again.",
  duplicate: "You've already saved this one. Try something new.",
  paywall: "Couldn't read that article — it might be behind a paywall. Try pasting the text instead.",
} as const;

// ════════════════════════════════════
// SECTION HEADERS
// ════════════════════════════════════
export const HEADERS = {
  // Home
  weekAtGlance: "YOUR WEEK AT A GLANCE",
  whatsMoving: "WHAT'S MOVING IN YOUR WORLD",
  whileYouWereBusy: "WHILE YOU WERE BUSY",
  yourRadar: "YOUR RADAR",
  whatsDriving: "WHAT'S DRIVING YOUR RISE",
  yourRhythm: "YOUR RHYTHM",

  // My Story
  professionalIdentity: "YOUR PROFESSIONAL IDENTITY",
  whereAttentionGoes: "WHERE YOUR ATTENTION GOES",
  deepExpertise: "WHERE YOUR EXPERTISE RUNS DEEP",
  whatSetsApart: "WHAT SETS YOU APART",

  // Publish
  yourVoice: "YOUR VOICE",
  strongestAngles: "YOUR STRONGEST ANGLES",
  writingDna: "HOW WELL THIS SOUNDS LIKE YOU",

  // Impact
  threeForces: "THE THREE FORCES",
  authorityTrajectory: "YOUR AUTHORITY TRAJECTORY",

  // Intelligence
  strategicRadar: "YOUR STRATEGIC RADAR",

  // Sidebar
  yourSpace: "YOUR SPACE",
} as const;

// ════════════════════════════════════
// SUBTITLES
// ════════════════════════════════════
export const SUBTITLES = {
  score: "This number reflects how visible your expertise is to the market. The higher it climbs, the more opportunities find you instead of you chasing them.",
  scoreBreakdown: "One of these three is holding you back. Fix it and watch the score move.",
  rhythm: "You don't need to post every day. You just need to not disappear. Consistency beats volume — every time.",
  myStory: "Everything you know — finally visible to the people who need to see it.",
  intelligence: "You already see these patterns. Aura just makes them visible — so you can turn what you know into content that builds your name.",
  publish: "Every post comes from what you actually know. Not templates. Not trends. Your real expertise.",
  publishVoice: "Aura learned how you write from your real posts. This is your voice — not AI's.",
  publishDrafts: "These are ready to go. One click, and your expertise is out there working for you — even while you sleep.",
  impact: "Every week you show up, your name reaches rooms you've never been in. That's how advisory calls, board invitations, and speaking slots find you.",
  focusAreas: "You keep coming back to these themes. There's a reason — and Aura knows what it is.",
  capabilities: "The things you do that most people in your space can't. These show up in everything you write.",
} as const;

// ════════════════════════════════════
// EMPTY STATES
// ════════════════════════════════════
export const EMPTY_STATE = {
  home: {
    text: "You have the expertise. The certificates. The years. But does your market know? Right now, to anyone who hasn't met you in person — you're invisible. One article is all it takes to change that. Paste a link and watch Aura turn what you already know into something the market can finally see.",
    cta: "Paste a link →",
  },
  intelligence: {
    text: "Every article you've ever read left a pattern in your thinking. You see connections others miss — but only you know they're there. Save a few articles and watch the signals appear — each one is something you can publish that nobody else is writing about.",
    cta: "Start with one article →",
  },
  publishNoSignals: {
    text: "The gap between \"expert\" and \"recognized expert\" isn't knowledge — it's visibility. You already know enough to lead conversations in your sector. Build your first signals and watch Aura turn them into posts that put your name in the right rooms.",
    cta: "Build your first signal →",
  },
  publishHasSignals: (n: number) => ({
    text: `You have ${n} signals — that's ${n} insights you understand that most people in your market haven't figured out yet. The only difference between you and the person getting the speaking invitation? They published. Pick your strongest signal and change that.`,
    cta: "Write from your strongest signal →",
  }),
  impact: {
    text: "Visibility is credibility. If you're an expert but nobody sees your work — to the market, you don't exist. Every recognized authority started exactly where you are now: one publish away from being found. This is where you'll watch that change.",
    cta: "Write your first post →",
  },
  library: {
    text: "Empty for now. When you write your first post, it'll wait here until you're ready to put your name on it. No rush — but the sooner it's out there, the sooner it works for you.",
    cta: "Write your first post →",
  },
  askAura: {
    text: "You have a Chief of Staff who knows your sector, your signals, and your blind spots. Ask anything — \"What should I write about?\" \"What did my competitors publish?\" \"Where am I invisible?\" The more you ask, the sharper it gets.",
    placeholder: "What should I write about this week?",
  },
  readingList: {
    text: "Your reading list builds itself from the gaps in your expertise. Save a few more articles and Aura will start showing you exactly what to read next — not random content, but the pieces that fill the blind spots in your authority.",
  },
} as const;

// ════════════════════════════════════
// BUTTONS & CTAs
// ════════════════════════════════════
export const CTA = {
  pasteLink: "Paste a link →",
  writeThis: "Write this →",
  createThis: "Create this →",
  buildThis: "Build this →",
  shorter: "Shorter →",
  published: "Published ✓",
  showMeWhoIAm: "Show me who I am in this market →",
  seePositioning: "See my positioning →",
  teachVoice: "Teach Aura your voice",
  uploadNumbers: "Upload my numbers →",
  bringIn: "Bring someone in",
  next: "Next →",
} as const;

// ════════════════════════════════════
// TIER LABELS
// ════════════════════════════════════
export const TIERS: Record<string, string> = {
  Starting: "Scout",
  Observer: "Observer",
  Building: "Rising",
  Strategist: "Strategist",
  Authority: "Authority",
  Luminary: "Luminary",
};

// ════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════
export const ONBOARDING = {
  step1Label: "LET'S SEE WHAT YOU'VE GOT",
  step1Intro: "You're not starting from zero — you have years of expertise the market hasn't seen yet. Tell Aura what you know. 60 seconds.",
  expertisePillarsLabel: "WHAT DO YOU KNOW THAT MOST PEOPLE IN YOUR SECTOR DON'T?",
  assessmentCtaButton: "Show me who I am in this market →",
  assessmentIntro: "Your expertise deserves a frame. Not a CV — a market position. Tell Aura who you are in 5 minutes, and it'll show you how the market should see you.",
  assessmentSubtitle: "This shapes everything Aura does for you — from what it reads between the lines to how it writes in your voice. The more honest you are, the more powerful the result.",
} as const;

// ════════════════════════════════════
// EMAIL TEMPLATES
// ════════════════════════════════════
export const EMAIL = {
  invite: {
    subject: "Your expertise deserves to be seen",
    preheader: "Your Aura beta access is approved. Here's everything you need to get started — and why it matters.",
    heroHeadline: "You're in. Welcome to Aura.",
    heroTagline: "Your expertise has always been there. Now it starts working for you.",
    ctaButton: "Open my Aura →",
    ctaLabel: "YOUR ACCESS",
    ctaSubtext: "Click below to give your expertise the visibility it deserves. Your first briefing is waiting.",
    sectionWhat: "WHAT HAPPENS INSIDE",
    sectionSteps: "YOUR FIRST 10 MINUTES",
    step1: "Set your password",
    step2: "Tell Aura who you are — 5 minutes",
    step3: "Save one article",
    step4: "Watch your first signal appear",
    defaultNote: "I built Aura because I kept meeting brilliant professionals whose market didn't know they existed. Not because they lacked expertise — but because no one had built them a system to make it visible. Aura is that system. I hope it changes the way your work is seen.",
    footer: "Strategic Intelligence · Private Beta",
  },
  weeklyBrief: {
    subject: "What moved in your sector this week",
  },
  silenceReminder: {
    subject: "Your radar is cooling — 2 minutes to warm it up",
  },
  passwordReset: {
    subject: "Reset your Aura password",
  },
} as const;