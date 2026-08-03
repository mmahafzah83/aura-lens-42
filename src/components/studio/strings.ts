export type Lang = "en" | "ar";
export type Posture = "delegator" | "editor" | "author";

/** Every user-facing string in the one-room studio, in both languages. */
export const T = {
  loading: { en: "Loading…", ar: "جارٍ التحميل…" },
  signIn: { en: "Please sign in", ar: "من فضلك سجّل الدخول" },
  signInLink: { en: "Go to sign in", ar: "اذهب لتسجيل الدخول" },

  // Top bar
  wordmark: { en: "Aura", ar: "أورا" },
  navHome: { en: "Home", ar: "الرئيسية" },
  navPieces: { en: "Your pieces", ar: "أعمالك" },
  navHow: { en: "How Aura writes", ar: "كيف تكتب أورا" },
  navGuides: { en: "Guides", ar: "الأدلة" },
  workingAs: { en: "Working as", ar: "طريقة العمل" },
  change: { en: "change", ar: "تغيير" },

  // Posture
  postureHead: { en: "How would you like to work with Aura?", ar: "كيف تحب أن تعمل مع أورا؟" },
  postureSub: {
    en: "You can change this whenever you like, on any piece.",
    ar: "يمكنك تغيير هذا متى شئت، في أي عمل.",
  },
  postureDelegator: { en: "Write it for me", ar: "اكتبه لي" },
  postureDelegatorSub: { en: "Aura drafts, you approve. Fastest.", ar: "أورا تكتب وأنت توافق. الأسرع." },
  postureEditor: { en: "Write it, then let me shape it", ar: "اكتبه، ثم دعني أشكّله" },
  postureEditorSub: {
    en: "Aura drafts, you edit freely before anything goes out.",
    ar: "أورا تكتب، وأنت تعدّل بحرية قبل أن يخرج أي شيء.",
  },
  postureAuthor: { en: "I'll write, you do the rest", ar: "أنا أكتب، وأنتِ تتولّين الباقي" },
  postureAuthorSub: {
    en: "You bring your own words. Aura makes the slides and handles the timing.",
    ar: "أنت تأتي بكلماتك. أورا تصنع الشرائح وتتولّى التوقيت.",
  },
  postureNameDelegator: { en: "Write it for me", ar: "اكتبه لي" },
  postureNameEditor: { en: "Write it, I shape it", ar: "اكتبه وأشكّله" },
  postureNameAuthor: { en: "I write it", ar: "أنا أكتبه" },

  // Journey map
  step1: { en: "Choose the subject", ar: "اختر الموضوع" },
  step2: { en: "Write the post", ar: "اكتب المنشور" },
  step3: { en: "Make the slides", ar: "اصنع الشرائح" },
  step4: { en: "Put it on LinkedIn", ar: "انشره على لينكدإن" },
  mapNote: {
    en: "Click any step to go back. Nothing is locked.",
    ar: "اضغط أي خطوة للرجوع. لا شيء مقفل.",
  },

  // Sub navigation
  subStart: { en: "Start", ar: "البداية" },
  subBuild: { en: "Build", ar: "البناء" },
  subLook: { en: "Look", ar: "المظهر" },
  savedMoment: { en: "Saved a moment ago", ar: "حُفظ قبل لحظات" },
  undo: { en: "Undo", ar: "تراجع" },
  saveAndClose: { en: "Save and close", ar: "احفظ وأغلق" },
  continue: { en: "Continue", ar: "متابعة" },

  // Step 1 — choose
  chooseHead: { en: "What is this piece about?", ar: "عن ماذا يدور هذا العمل؟" },
  chooseHelp: {
    en: "These come from what you saved. Pick one, or type your own subject.",
    ar: "هذه من المواد التي حفظتها. اختر واحدة، أو اكتب موضوعك.",
  },
  sources: { en: "sources", ar: "مصدر" },
  chooseOwn: { en: "Write about something else", ar: "اكتب عن شيء آخر" },
  chooseOwnPlaceholder: { en: "What do you want to write about?", ar: "عن ماذا تريد أن تكتب؟" },
  chooseUse: { en: "Use this one", ar: "استخدم هذا" },
  chooseEmpty: {
    en: "Aura writes from what you read. Save an article you found interesting and come back.",
    ar: "أورا تكتب مما تقرأه. احفظ مقالاً لفت انتباهك ثم عُد.",
  },
  pasteHead: { en: "Paste my own post", ar: "الصق منشوري" },
  pasteHelp: {
    en: "Bring your own words. Aura will take them from here.",
    ar: "أحضر كلماتك. أورا ستكمل من هنا.",
  },
  pastePlaceholder: { en: "Paste your post here…", ar: "الصق منشورك هنا…" },
  pasteUse: { en: "Use these words", ar: "استخدم هذه الكلمات" },

  // Step 2 — write
  writeHead: { en: "Your post", ar: "منشورك" },
  writeHelp: {
    en: "What you see here is what goes out. Change any word.",
    ar: "ما تراه هنا هو ما سيُنشر. غيّر أي كلمة.",
  },
  writing: { en: "Writing your post — about 20 seconds.", ar: "نكتب منشورك — حوالي 20 ثانية." },
  writeFailed: {
    en: "Something went wrong on our side. Please try once more.",
    ar: "حدث خطأ من جهتنا. جرّب مرة أخرى من فضلك.",
  },
  sessionEnded: { en: "Your sign-in ended. Sign in again and try once more.", ar: "انتهت جلستك. سجّل الدخول وحاول مرة أخرى." },
  tryAgain: { en: "Try again", ar: "حاول مرة أخرى" },
  optPost: { en: "Put this on LinkedIn", ar: "انشر هذا على لينكدإن" },
  optSlides: { en: "Also make slides", ar: "اصنع شرائح أيضاً" },
  optLater: { en: "Keep it for later", ar: "احتفظ به لوقت لاحق" },
  characters: { en: "characters", ar: "حرفاً" },
  tooLong: { en: "This is long for LinkedIn. Shorter posts are read more.", ar: "هذا طويل للينكدإن. المنشورات الأقصر تُقرأ أكثر." },

  // Step 3 — slides
  makingSlides: { en: "Making your slides — this takes up to a minute.", ar: "نصنع شرائحك — قد يستغرق حتى دقيقة." },
  slidesFailedHead: { en: "Aura could not finish the slides", ar: "لم تستطع أورا إنهاء الشرائح" },
  makeSlides: { en: "Make the slides", ar: "اصنع الشرائح" },
  slidesNeedPost: { en: "Write the post first — the slides are made from your words.", ar: "اكتب المنشور أولاً — الشرائح تُصنع من كلماتك." },

  // Zone: this piece
  zonePiece: { en: "This piece", ar: "هذا العمل" },
  showing: { en: "Showing", ar: "المعروض" },
  showPost: { en: "The post", ar: "المنشور" },
  showSlides: { en: "The slides", ar: "الشرائح" },
  stillToDo: { en: "Still to do", ar: "ما تبقّى" },
  todoWords: { en: "Words approved", ar: "الكلمات معتمدة" },
  todoSlides: { en: "Slides made", ar: "الشرائح جاهزة" },
  todoCover: { en: "Cover picture", ar: "صورة الغلاف" },
  todoPublish: { en: "Put on LinkedIn", ar: "منشور على لينكدإن" },
  todoNote: { en: "This is where you are, not a checkpoint.", ar: "هذا موقعك الحالي، وليس شرطاً." },
  readAll: { en: "read all", ar: "اقرأ الكل" },
  readLess: { en: "show less", ar: "أظهر أقل" },
  noPostYet: { en: "No words yet.", ar: "لا كلمات بعد." },

  // Zone: stage
  zoneStage: { en: "Stage", ar: "المسرح" },
  prevSlide: { en: "Previous slide", ar: "الشريحة السابقة" },
  nextSlide: { en: "Next slide", ar: "الشريحة التالية" },
  slideOf: { en: "Slide", ar: "شريحة" },
  of: { en: "of", ar: "من" },
  noSlidesYet: { en: "No slides yet.", ar: "لا شرائح بعد." },

  // Zone: inspector
  zoneInspector: { en: "Change this slide", ar: "غيّر هذه الشريحة" },
  picture: { en: "Picture", ar: "الصورة" },
  addPicture: { en: "Add a picture", ar: "أضف صورة" },
  removePicture: { en: "Remove the picture", ar: "احذف الصورة" },
  uploading: { en: "Adding…", ar: "جارٍ الإضافة…" },
  noPictureHere: { en: "This slide has no room for a picture. Pick another slide.", ar: "لا مساحة لصورة في هذه الشريحة. اختر شريحة أخرى." },
  changeLine: { en: "Change this line only", ar: "غيّر هذا السطر فقط" },
  changingLine: { en: "Changing…", ar: "جارٍ التغيير…" },
  removeSlide: { en: "Remove slide", ar: "احذف الشريحة" },
  layoutDisclosure: { en: "Change how this slide is laid out", ar: "غيّر شكل ترتيب هذه الشريحة" },
  moveEarlier: { en: "Move earlier", ar: "حرّكها للخلف" },
  moveLater: { en: "Move later", ar: "حرّكها للأمام" },
  alwaysFirst: { en: "This one always comes first.", ar: "هذه دائماً في البداية." },
  alwaysLast: { en: "This one always comes last.", ar: "هذه دائماً في النهاية." },
  cameFrom: { en: "This slide came from this line of your post:", ar: "هذه الشريحة جاءت من هذا السطر في منشورك:" },
  cannotUse: { en: "Not available here", ar: "غير متاح هنا" },
  lockedLayout: {
    en: "The first and last slides keep their shape so your piece opens and closes the same way every time.",
    ar: "الشريحة الأولى والأخيرة تحتفظان بشكلهما ليبدأ عملك وينتهي بالطريقة نفسها في كل مرة.",
  },

  // Layout reasons
  reasonNeighbour: {
    en: "The slide next to this one already uses that shape, so two would look the same in a row.",
    ar: "الشريحة المجاورة تستخدم هذا الشكل، فستبدو شريحتان متطابقتين متتاليتين.",
  },
  reasonMissing: {
    en: "That shape needs a part this slide does not have yet, such as a number or a quote.",
    ar: "هذا الشكل يحتاج جزءاً لا تملكه الشريحة بعد، مثل رقم أو اقتباس.",
  },

  // Footer
  changedMind: { en: "Changed your mind?", ar: "غيّرت رأيك؟" },
  undoBeforeSlides: { en: "Go back to before the slides were made", ar: "ارجع إلى ما قبل صنع الشرائح" },
  exportFile: { en: "Export the file", ar: "صدّر الملف" },
  putOnLinkedIn: { en: "Put on LinkedIn", ar: "انشره على لينكدإن" },
  exporting: { en: "Making the file…", ar: "نجهّز الملف…" },
  exportDone: { en: "The file is on your computer.", ar: "الملف الآن على جهازك." },
  exportFailed: { en: "The file could not be made. Try once more.", ar: "تعذّر إنشاء الملف. جرّب مرة أخرى." },

  // Publish — text
  posting: { en: "Posting to LinkedIn — this takes a few seconds.", ar: "جارٍ النشر على لينكدإن — بضع ثوانٍ." },
  postedHead: { en: "Posted.", ar: "تم النشر." },
  postedHelp: { en: "It is live on your LinkedIn now.", ar: "إنه منشور على لينكدإن الآن." },
  seeOnLinkedIn: { en: "See it on LinkedIn", ar: "شاهده على لينكدإن" },
  notConnected: {
    en: "You need to connect LinkedIn once before posting. You can keep this and connect from your settings.",
    ar: "تحتاج إلى ربط لينكدإن مرة واحدة قبل النشر. يمكنك الاحتفاظ به والربط من الإعدادات.",
  },
  postFailed: {
    en: "We could not post it just now. Your words are kept — edit anything and try again.",
    ar: "لم نتمكن من نشره الآن. كلماتك محفوظة — عدّل ما تشاء وحاول مرة أخرى.",
  },
  savedForLater: { en: "Kept. You will find it with your pieces.", ar: "تم الحفظ. ستجده مع أعمالك." },

  // Publish — slides
  slidesPublishHead: { en: "Putting slides on LinkedIn takes three steps", ar: "نشر الشرائح على لينكدإن يتم في ثلاث خطوات" },
  slidesStep1: { en: "Aura makes the file", ar: "أورا تصنع الملف" },
  slidesStep2: { en: "You upload it to LinkedIn", ar: "أنت ترفعه على لينكدإن" },
  slidesStep3: { en: "You paste the link back here", ar: "أنت تلصق الرابط هنا" },
  slidesWhy: {
    en: "Why we ask for the link: it's the only way Aura knows the post went live. Without it, your slides won't count towards anything you see in Aura.",
    ar: "لماذا نطلب الرابط: هذه الطريقة الوحيدة لتعرف أورا أن المنشور صار حياً. بدونه لن تُحتسب شرائحك في أي شيء تراه في أورا.",
  },
  openLinkedIn: { en: "Open LinkedIn", ar: "افتح لينكدإن" },
  captionCopied: { en: "Your caption is copied.", ar: "تم نسخ النص المرافق." },
  linkPlaceholder: { en: "Paste the link to your post…", ar: "الصق رابط منشورك…" },
  linkSave: { en: "Save the link", ar: "احفظ الرابط" },
  linkSaved: { en: "Saved. Aura will follow how it performs.", ar: "تم الحفظ. ستتابع أورا أداءه." },
  linkBad: { en: "That does not look like a LinkedIn link.", ar: "هذا لا يبدو رابط لينكدإن." },
  cancel: { en: "Cancel", ar: "إلغاء" },

  // Step 4 chooser
  publishHead: { en: "Put it on LinkedIn", ar: "انشره على لينكدإن" },
  publishAsPost: { en: "Send the words as a post", ar: "أرسل الكلمات كمنشور" },
  fileSteps: { en: "a PDF of your", ar: "ملف PDF من" },
  slidesWord: { en: "slides", ar: "شريحة" },
  captionNote: { en: "we open LinkedIn with your caption already copied.", ar: "نفتح لينكدإن ونصّك المرافق منسوخ بالفعل." },
  linkNote: { en: "so Aura can tell you how it performed.", ar: "لتخبرك أورا كيف كان أداؤه." },

  // Confirm before posting
  confirmPostHead: {
    en: "Post this to LinkedIn now? It will appear on your profile straight away.",
    ar: "أننشر هذا على لينكدإن الآن؟ سيظهر على ملفك فوراً.",
  },
  confirmPostYes: { en: "Post it", ar: "انشره" },
  confirmPostNo: { en: "Not yet", ar: "ليس الآن" },

  // Reordering reasons
  cannotMoveEarlier: { en: "The opening slide always comes first.", ar: "الشريحة الافتتاحية تأتي أولاً دائماً." },
  cannotMoveLater: { en: "The closing slide always comes last.", ar: "الشريحة الختامية تأتي أخيراً دائماً." },

  // Look tab
  lookHead: { en: "How it looks", ar: "شكل العمل" },
  lookTheme: { en: "Colours", ar: "الألوان" },
  lookLength: { en: "How many slides", ar: "عدد الشرائح" },
  lookLengthNote: {
    en: "Changing this makes the slides again from your post.",
    ar: "تغيير هذا يعيد صنع الشرائح من منشورك.",
  },
  lookNeedsDeck: { en: "Make the slides first.", ar: "اصنع الشرائح أولاً." },

  // Problems
  exportNoDeck: { en: "There are no slides to make a file from yet.", ar: "لا توجد شرائح لعمل ملف منها بعد." },
  exportNotReady: {
    en: "The slides are not ready on screen yet. Wait a moment and try again.",
    ar: "الشرائح ليست جاهزة على الشاشة بعد. انتظر لحظة وحاول مرة أخرى.",
  },
  slidesTimedOut: {
    en: "The slides took too long. Nothing was lost — try once more.",
    ar: "استغرقت الشرائح وقتاً طويلاً. لم يُفقد شيء — جرّب مرة أخرى.",
  },
  lineChangeFailed: {
    en: "Aura could not find another way to say this line. Your words are unchanged.",
    ar: "لم تجد أورا صياغة أخرى لهذا السطر. كلماتك كما هي.",
  },
  typedTopicNoSlides: {
    en: "Slides are built from a saved subject. Pick one from your saved material to make slides.",
    ar: "الشرائح تُبنى من موضوع محفوظ. اختر واحداً من موادك المحفوظة لصنع الشرائح.",
  },
  draftRestored: { en: "We brought back what you were writing.", ar: "أعدنا ما كنت تكتبه." },

  // Picture problems — our own words, never a provider's
  picTypeBad: {
    en: "That file type isn't supported. Please use a JPG, PNG, or WebP picture.",
    ar: "نوع الملف غير مدعوم. استخدم صورة JPG أو PNG أو WebP.",
  },
  picTooBig: { en: "That picture is too large. Please use a smaller one.", ar: "الصورة كبيرة جداً. استخدم صورة أصغر." },
  picUnreadable: { en: "We couldn't open that picture. Please try a different one.", ar: "لم نستطع فتح هذه الصورة. جرّب صورة أخرى." },
  picTooSmall: { en: "This picture is too small to stay sharp — try a larger one.", ar: "هذه الصورة صغيرة جداً لتبقى واضحة — جرّب صورة أكبر." },
  picUploadFailed: {
    en: "The picture could not be added just now. Please try once more.",
    ar: "تعذّر إضافة الصورة الآن. جرّب مرة أخرى من فضلك.",
  },
} as const;

/**
 * Turn a `checkImage` result into one of our own sentences, by cause.
 * A provider message is never shown to a member.
 */
export function pictureProblem(englishFromChecker: string, lang: Lang): string {
  const s = englishFromChecker.toLowerCase();
  if (s.includes("file type")) return T.picTypeBad[lang];
  if (s.includes("mb")) return T.picTooBig[lang];
  if (s.includes("couldn't open") || s.includes("could not open")) return T.picUnreadable[lang];
  if (s.includes("too small")) return T.picTooSmall[lang];
  return T.picUploadFailed[lang];
}

/** Arabic names for the slot labels rendered by the inspector. */
export const slotLabelAr: Record<string, string> = {
  chip: "التسمية",
  hero_lines: "الافتتاحية",
  headline: "العنوان",
  subline: "التأطير",
  term: "المصطلح",
  term_def: "التعريف",
  quote: "الاقتباس",
  stat_value: "الرقم",
  stat_label: "ماذا يقيس",
  source: "المصدر",
  body: "الفكرة الأساسية",
  checklist: "الخطوات",
  callout_label: "تسمية التنويه",
  callout_body: "التنويه",
  cta_pill: "سؤال الختام",
  media: "الصورة",
};

/** Arabic names for the slide layouts. */
export const archetypeLabelAr: Record<string, string> = {
  cover_hero: "الغلاف",
  cover_stat: "غلاف برقم",
  frame: "التأطير",
  evidence: "الدليل",
  benchmark: "المقارنة",
  quote: "اقتباس",
  steps: "خطوات",
  definition: "تعريف",
  close: "الختام",
};

/**
 * Arabic forms of the plain-English problem lines produced by `plainFailure`.
 * Matched on a stable fragment of the English text; anything unmatched falls
 * back to a general Arabic line rather than leaking English.
 */
export const attentionAr: Array<[RegExp, string]> = [
  [/one emphasis only/i, "لا يمكن إبراز أكثر من عنصر واحد في الشريحة."],
  [/without a source/i, "هناك رقم بلا مصدر. أضف من أين جاء."],
  [/nothing on it/i, "هناك شريحة فارغة. أضف نصاً أو احذفها."],
  [/same layout/i, "شريحتان متجاورتان تستخدمان الشكل نفسه."],
  [/too long for the slide|overflows/i, "النص أطول من مساحة الشريحة."],
  [/hook line/i, "سطر الافتتاحية أطول من المسموح، وسينكسر على سطرين."],
  [/adjust something/i, "احتاجت أورا إلى تعديل شيء وستحاول مرة أخرى."],
];

/** Translate one plain-English problem line for an Arabic interface. */
export function attentionText(englishLine: string, lang: Lang): string {
  if (lang !== "ar") return englishLine;
  for (const [pattern, arabic] of attentionAr) {
    if (pattern.test(englishLine)) return arabic;
  }
  return "احتاجت أورا إلى تعديل شيء وستحاول مرة أخرى.";
}

/** Arabic version of a start-card reason, keyed off its kind. */
export function startReason(kind: string, count: number, english: string, lang: Lang): string {
  if (lang !== "ar") return english;
  if (kind === "new_evidence") return `${count} مصدراً يقف خلف هذا الآن — بعضها وصل بعد آخر منشور لك عنه.`;
  if (kind === "accelerating") return `يكتسب زخماً — ${count} مصدراً وما زال يتصاعد.`;
  if (kind === "never_written") return `أقوى إشاراتك ولم تكتب عنها بعد — ${count} مصدراً.`;
  return english;
}

export function tr(key: keyof typeof T, lang: Lang): string {
  const entry = T[key] as Record<string, unknown>;
  return String(entry[lang]);
}

export function postureLabel(p: Posture, lang: Lang): string {
  if (p === "delegator") return tr("postureNameDelegator", lang);
  if (p === "author") return tr("postureNameAuthor", lang);
  return tr("postureNameEditor", lang);
}