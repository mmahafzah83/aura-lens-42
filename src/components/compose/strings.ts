export type Lang = "en" | "ar";

/** Every user-facing string in the guided compose flow, in both languages. */
export const S = {
  stepLabels: {
    en: ["Start", "Choose", "Check", "Write", "Review", "Done"],
    ar: ["البداية", "الاختيار", "التحقق", "الكتابة", "المراجعة", "تم"],
  },
  signIn: { en: "Please sign in", ar: "من فضلك سجّل الدخول" },
  signInLink: { en: "Go to sign in", ar: "اذهب لتسجيل الدخول" },
  loading: { en: "Loading…", ar: "جارٍ التحميل…" },
  greeting: { en: "Hello", ar: "مرحباً" },

  // Step 1
  s1Head: { en: "What would you like to do today?", ar: "ماذا تريد أن تفعل اليوم؟" },
  s1Help: { en: "Pick one. Nothing is saved until you say so.", ar: "اختر واحداً. لا شيء يُحفظ حتى توافق." },
  s1CardTitle: { en: "Write one post", ar: "اكتب منشوراً واحداً" },
  s1CardSub: {
    en: "Aura writes it from something you already saved. You read it, change what you want, then post it.",
    ar: "أورا تكتبه من شيء حفظته أنت. تقرأه، تعدّل ما تشاء، ثم تنشره.",
  },
  s1Time: { en: "about 3 minutes", ar: "حوالي 3 دقائق" },
  s1More: { en: "More ways to post are coming.", ar: "طرق أخرى للنشر قادمة قريباً." },
  continue: { en: "Continue", ar: "متابعة" },
  nothingYet: { en: "Nothing is written yet.", ar: "لم يُكتب شيء بعد." },

  // Step 2
  s2Head: { en: "Here are the things worth writing about this week.", ar: "هذه المواضيع التي تستحق الكتابة هذا الأسبوع." },
  s2Help: {
    en: "These come from what you saved. We only show the ones strong enough to make a good post — that is why the list is short.",
    ar: "هذه من المواد التي حفظتها. لا نعرض إلا القوي منها بما يكفي لمنشور جيد — لهذا القائمة قصيرة.",
  },
  sources: { en: "sources", ar: "مصدر" },
  s2Empty: {
    en: "Aura writes from what you read — so it needs something first. Save an article you found interesting this week and come back.",
    ar: "أورا تكتب مما تقرأه — لذا تحتاج مقالاً أولاً. احفظ شيئاً لفت انتباهك هذا الأسبوع ثم عُد.",
  },
  s2GoCapture: { en: "Go to capture", ar: "اذهب للحفظ" },
  s2SeeAll: { en: "See everything I saved", ar: "اعرض كل ما حفظت" },
  s2Other: { en: "Write about something else", ar: "أكتب عن شيء آخر" },
  s2OtherPlaceholder: { en: "What do you want to write about?", ar: "عن ماذا تريد أن تكتب؟" },
  s2Use: { en: "Use this one", ar: "استخدم هذا" },
  s2Still: { en: "Still nothing written.", ar: "لم يُكتب شيء بعد." },
  back: { en: "Back", ar: "رجوع" },

  // Step 3
  s3Head: { en: "Is this what you want to say?", ar: "هل هذا ما تريد قوله؟" },
  s3Help: {
    en: "This is the idea your post will be built from. Read it and tell us if it is right — changing your mind now costs nothing.",
    ar: "هذه هي الفكرة التي سيُبنى منها منشورك. اقرأها وقل لنا إن كانت صحيحة — التراجع الآن لا يكلّف شيئاً.",
  },
  s3IsArgument: { en: "This is the argument, not the finished post.", ar: "هذه هي الفكرة، وليست المنشور النهائي." },
  s3WhatItIs: { en: "What it is", ar: "ما هو" },
  s3WhyMatters: { en: "Why it matters for you", ar: "لماذا يهمّك" },
  s3WriteIn: { en: "Write this in:", ar: "اكتبه بـ:" },
  s3Go: { en: "Yes — write my post", ar: "نعم — اكتب منشوري" },
  s3Cost: { en: "This takes about 20 seconds.", ar: "يستغرق حوالي 20 ثانية." },

  // Step 4
  s4Head: { en: "Writing your post.", ar: "نكتب منشورك الآن." },
  s4Lines: {
    en: ["Reading what you saved", "Matching the way you write", "Checking it before you see it"],
    ar: ["نقرأ ما حفظته", "نطابق طريقتك في الكتابة", "نراجعه قبل أن تراه"],
  },
  s4Help: { en: "You can wait here — it takes about 20 seconds.", ar: "يمكنك الانتظار هنا — يستغرق حوالي 20 ثانية." },
  s4AlmostThere: { en: "Almost there…", ar: "اقتربنا…" },
  s4Error: { en: "Something went wrong on our side. Please try once more.", ar: "حدث خطأ من جهتنا. جرّب مرة أخرى من فضلك." },
  tryAgain: { en: "Try again", ar: "حاول مرة أخرى" },

  // Step 5
  s5Head: { en: "Here is your post.", ar: "هذا منشورك." },
  s5Help: { en: "Read it first. You can post it as it is, or make it stronger.", ar: "اقرأه أولاً. يمكنك نشره كما هو، أو جعله أقوى." },
  s5NoCheckHead: { en: "We could not check this post", ar: "لم نستطع فحص هذا المنشور" },
  s5NoCheckBody: {
    en: "That is our problem, not yours — your writing is fine. You can post it now, or ask us to write it again.",
    ar: "هذه مشكلتنا لا مشكلتك — كتابتك سليمة. يمكنك نشره الآن، أو أن تطلب منّا كتابته مرة أخرى.",
  },
  s5Weak: { en: "Two things would make this stronger:", ar: "أمران يجعلان هذا أقوى:" },
  s5Fix: { en: "Fix this", ar: "أصلح هذا" },
  s5Hook: { en: "We sharpened your opening line.", ar: "حسّنّا سطرك الأول." },
  s5SeeOriginal: { en: "See the original", ar: "اعرض الأصلي" },
  s5HideOriginal: { en: "Hide the original", ar: "أخفِ الأصلي" },
  s5SwitchAr: { en: "Write this in العربية instead", ar: "اكتبه بالعربية بدلاً من ذلك" },
  s5SwitchEn: { en: "Write this in English instead", ar: "اكتبه بالإنجليزية بدلاً من ذلك" },
  s5SwitchNote: { en: "This rewrites it in the other language.", ar: "هذا يعيد كتابته باللغة الأخرى." },
  s5Post: { en: "Post it to LinkedIn", ar: "انشره على لينكدإن" },
  s5Save: { en: "Save for later", ar: "احفظه لوقت لاحق" },
  s5EditHint: {
    en: "You can edit this — change any word before you post.",
    ar: "يمكنك تعديل هذا — غيّر أي كلمة قبل النشر.",
  },
  s5EditHint2: { en: "This is your draft. Edit anything you like.", ar: "هذه مسودّتك. عدّل ما تشاء." },
  s5Posting: {
    en: "Posting to LinkedIn — this can take up to a minute.",
    ar: "جارٍ النشر على لينكدإن — قد يستغرق حتى دقيقة.",
  },
  s5Saving: { en: "Saving…", ar: "جارٍ الحفظ…" },
  s5FormatHead: { en: "How do you want to post this?", ar: "كيف تريد نشره؟" },
  s5FormatPost: { en: "As a post", ar: "كمنشور" },
  s5FormatPostSub: { en: "Your words, exactly as above.", ar: "كلماتك، تماماً كما في الأعلى." },
  s5FormatDeck: { en: "As a deck", ar: "كشرائح" },
  s5FormatDeckSub: {
    en: "Slides people swipe through — the best-performing format on LinkedIn right now.",
    ar: "شرائح يتصفّحها الناس — الأفضل أداءً على لينكدإن حالياً.",
  },
  s5DeckNeedsSignal: {
    en: "A deck is built from a saved signal. This one was written from a free topic, so a deck isn't available here.",
    ar: "الشرائح تُبنى من إشارة محفوظة. هذا المنشور من موضوع حر، لذا الشرائح غير متاحة هنا.",
  },
  s5OpenDeck: { en: "Open the deck studio →", ar: "افتح استوديو الشرائح ←" },
  s5DeckNote: {
    en: "Your words are saved as a draft first — the deck is built fresh from your signal.",
    ar: "تُحفظ كلماتك كمسودّة أولاً — وتُبنى الشرائح من إشارتك من جديد.",
  },
  s5NotConnected: {
    en: "You need to connect LinkedIn once before posting. You can save this and connect from your settings.",
    ar: "تحتاج إلى ربط LinkedIn مرة واحدة قبل النشر. يمكنك حفظه والربط من الإعدادات.",
  },
  s5PostFailed: {
    en: "We could not post it just now. It is saved as a draft — try again in a minute.",
    ar: "لم نتمكن من نشره الآن. تم حفظه كمسودّة — جرّب بعد قليل.",
  },

  // Step 6
  s6PostedHead: { en: "Posted.", ar: "تم النشر." },
  s6PostedHelp: { en: "It is live on your LinkedIn now.", ar: "إنه منشور على لينكدإن الآن." },
  s6SeeIt: { en: "See it on LinkedIn", ar: "شاهده على لينكدإن" },
  s6CopyLink: { en: "Copy link", ar: "انسخ الرابط" },
  s6Copied: { en: "Copied ✓", ar: "تم النسخ ✓" },
  s6SavedHead: { en: "Saved.", ar: "تم الحفظ." },
  s6SavedHelp: { en: "You will find it in your drafts in the Composer.", ar: "ستجده في مسوداتك داخل المنصّة." },
  s6Next: {
    en: "This post is now part of your voice — the next one will sound more like you.",
    ar: "هذا المنشور صار جزءاً من صوتك — التالي سيشبهك أكثر.",
  },
  s6Another: { en: "Write another", ar: "اكتب منشوراً آخر" },
  s6Home: { en: "Back to home", ar: "العودة للرئيسية" },
} as const;

export function t(key: keyof typeof S, lang: Lang): string {
  const entry = S[key] as Record<string, unknown>;
  return String(entry[lang]);
}