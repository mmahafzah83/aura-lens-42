/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client-side DOM interaction audit. Runs against the currently rendered page,
 * or against any same-origin Document passed in (e.g. an iframe.contentDocument).
 */

export type QaStatus = "pass" | "fail" | "warn";

export interface QaResult {
  testId: string;
  testName: string;
  category: string;
  status: QaStatus;
  details: {
    description: string;
    element?: string;
    expected?: string;
    actual?: string;
    severity?: "critical" | "high" | "medium" | "low";
    [key: string]: unknown;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getWin(doc: Document): Window {
  return (doc.defaultView as Window) || window;
}

function describe(el: Element | null): string {
  if (!el) return "(none)";
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
  const cls = (el as HTMLElement).className && typeof (el as HTMLElement).className === "string"
    ? "." + ((el as HTMLElement).className as string).trim().split(/\s+/).slice(0, 2).join(".")
    : "";
  const text = (el as HTMLElement).innerText?.trim().slice(0, 40) || "";
  const rect = (el as HTMLElement).getBoundingClientRect?.();
  const pos = rect ? ` @${Math.round(rect.left)},${Math.round(rect.top)}` : "";
  return `<${tag}${id}${cls}>${text ? ` "${text}"` : ""}${pos}`;
}

function isVisible(el: Element, doc?: Document): boolean {
  const he = el as HTMLElement;
  if (!he.getBoundingClientRect) return false;
  const r = he.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const win = getWin(doc || he.ownerDocument || document);
  const cs = win.getComputedStyle(he);
  if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
  return true;
}

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => parseInt(n, 10));
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hasReactClickHandler(el: Element): boolean {
  const keys = Object.keys(el);
  for (const k of keys) {
    if (k.startsWith("__reactProps")) {
      const props = (el as any)[k];
      if (props && typeof props.onClick === "function") return true;
    }
    if (k.startsWith("__reactFiber")) {
      const fiber = (el as any)[k];
      if (fiber?.memoizedProps?.onClick) return true;
    }
  }
  return false;
}

async function safeRun(
  results: QaResult[],
  fn: () => Promise<void> | void,
  errorTest: { testId: string; testName: string; category: string },
) {
  try {
    await fn();
  } catch (e: any) {
    results.push({
      ...errorTest,
      status: "fail",
      details: { description: `Audit group threw: ${e?.message ?? String(e)}` },
    });
  }
}

/* ---------------- GROUP 1 — Tooltip Consistency ---------------- */
async function auditTooltips(results: QaResult[], doc: Document) {
  const candidates = new Set<Element>();
  doc.querySelectorAll("[data-tooltip], [aria-describedby]").forEach((el) => candidates.add(el));
  doc.querySelectorAll("svg.lucide-help-circle, svg.lucide-info").forEach((el) => {
    const trigger = (el as Element).closest("button, [role='button'], span, div");
    if (trigger) candidates.add(trigger);
  });
  doc.querySelectorAll("button, span, [role='button']").forEach((el) => {
    const t = (el as HTMLElement).innerText?.trim();
    if (t === "?" || t === "ⓘ") candidates.add(el);
  });

  const visible = Array.from(candidates).filter((e) => isVisible(e, doc)).slice(0, 20);

  for (let i = 0; i < visible.length; i++) {
    const el = visible[i];
    const before = new Set(doc.querySelectorAll("[role='tooltip'], .tooltip, .popover, [data-radix-popper-content-wrapper]"));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(300);
    const afterEnter = Array.from(doc.querySelectorAll("[role='tooltip'], .tooltip, .popover, [data-radix-popper-content-wrapper]"))
      .filter((n) => !before.has(n));
    const appeared = afterEnter.length > 0;

    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await sleep(500);
    const stillThere = afterEnter.filter((n) => doc.contains(n) && isVisible(n, doc));

    if (appeared && stillThere.length > 0) {
      results.push({
        testId: `tooltip.${i}`,
        testName: "Tooltip dismiss on hover-out",
        category: "tooltips",
        status: "fail",
        details: {
          description: "Tooltip appeared but did not dismiss on mouseleave",
          element: describe(el),
          expected: "auto-dismiss on mouseleave",
          actual: "requires manual close",
        },
      });
    }
  }
  results.push({
    testId: "tooltips.summary",
    testName: "Tooltips checked",
    category: "tooltips",
    status: "pass",
    details: { description: `${visible.length} tooltip triggers tested` },
  });
}

/* ---------------- GROUP 2 — Modal Behavior ---------------- */
async function auditModals(results: QaResult[], doc: Document) {
  const triggerKeywords = ["start", "generate", "share", "assessment", "audit", "open", "view"];
  const candidates: HTMLElement[] = [];
  doc.querySelectorAll("button, [role='button']").forEach((el) => {
    const t = ((el as HTMLElement).innerText || "").trim().toLowerCase();
    if (!t) return;
    if (triggerKeywords.some((k) => t.includes(k))) candidates.push(el as HTMLElement);
  });

  const sample = candidates.filter((e) => isVisible(e, doc)).slice(0, 6);
  const win = getWin(doc);

  for (let i = 0; i < sample.length; i++) {
    const trigger = sample[i];
    const before = new Set(doc.querySelectorAll("[role='dialog'], [data-state='open']"));
    trigger.click();
    await sleep(500);
    const dialogs = Array.from(doc.querySelectorAll("[role='dialog']"))
      .filter((n) => !before.has(n) && isVisible(n, doc));
    if (dialogs.length === 0) continue;

    const dialog = dialogs[0] as HTMLElement;
    const cs = win.getComputedStyle(dialog);
    const issues: string[] = [];

    const hasCloseBtn = !!dialog.querySelector(
      "button[aria-label*='close' i], button[aria-label*='dismiss' i], button.close, [data-dismiss]"
    ) || Array.from(dialog.querySelectorAll("button")).some((b) => /close|cancel|×/i.test(b.innerText || ""));
    if (!hasCloseBtn) issues.push("no visible close button");

    let usesFixed = cs.position === "fixed";
    let p: HTMLElement | null = dialog.parentElement;
    let depth = 0;
    while (!usesFixed && p && depth < 4) {
      if (win.getComputedStyle(p).position === "fixed") usesFixed = true;
      p = p.parentElement;
      depth++;
    }
    if (!usesFixed) issues.push("uses position:absolute");

    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(400);
    const closedOnEscape = !doc.contains(dialog) || !isVisible(dialog, doc);
    if (!closedOnEscape) {
      issues.push("doesn't close on Escape");
      doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(200);
    }

    results.push({
      testId: `modal.${i}`,
      testName: "Modal behavior",
      category: "modals",
      status: issues.length === 0 ? "pass" : "fail",
      details: {
        description: issues.length === 0 ? "Modal opens/closes cleanly" : issues.join("; "),
        element: describe(trigger),
        expected: "fixed overlay, closes on Escape, has close button",
        actual: issues.join("; ") || "ok",
      },
    });
  }
}

/* ---------------- GROUP 3 — Buttons ---------------- */
function auditButtons(results: QaResult[], doc: Document) {
  const buttons = Array.from(doc.querySelectorAll("button, [role='button']")).filter((e) => isVisible(e, doc));
  let dead = 0, small = 0, unlabeled = 0;
  const samples: string[] = [];

  buttons.forEach((b, idx) => {
    const he = b as HTMLElement;
    // Radix UI primitives bind click handlers internally and don't expose them
    // via onclick or React fiber props — skip the dead-button check for them.
    const isRadixPrimitive = /^radix-:/.test(he.id || "");
    const hasHandler =
      isRadixPrimitive ||
      (he as any).onclick !== null ||
      hasReactClickHandler(he) ||
      he.getAttribute("type") === "submit";
    const w = he.offsetWidth, h = he.offsetHeight;
    const label = (he.innerText || "").trim() || he.getAttribute("aria-label") || he.getAttribute("title") || "";
    if (!hasHandler) { dead++; if (samples.length < 5) samples.push(`dead: ${describe(he)}`); }
    if (w < 44 || h < 32) { small++; }
    if (!label) { unlabeled++; if (samples.length < 10) samples.push(`unlabeled: ${describe(he)}`); }

    if (!hasHandler || !label) {
      results.push({
        testId: `button.${idx}`,
        testName: "Button audit",
        category: "buttons",
        status: "fail",
        details: {
          description: [!hasHandler && "no click handler", !label && "no accessible label"].filter(Boolean).join("; "),
          element: describe(he),
        },
      });
    }
  });

  results.push({
    testId: "buttons.summary",
    testName: "Buttons summary",
    category: "buttons",
    status: dead + unlabeled > 0 ? "warn" : "pass",
    details: {
      description: `${buttons.length} buttons checked. dead=${dead}, small_tap=${small}, unlabeled=${unlabeled}`,
      samples: samples.slice(0, 10),
    } as any,
  });
}

/* ---------------- GROUP 4 — Links ---------------- */
function auditLinks(results: QaResult[], doc: Document) {
  const anchors = Array.from(doc.querySelectorAll("a")) as HTMLAnchorElement[];
  let broken = 0, externalNoBlank = 0;
  anchors.forEach((a, idx) => {
    const href = a.getAttribute("href") || "";
    const isExternal = /^https?:\/\//i.test(href);
    const isInternal = !isExternal && href.length > 0 && !href.startsWith("mailto:") && !href.startsWith("tel:");
    if (isInternal && (href === "#" || href.startsWith("javascript:") || href === "")) {
      broken++;
      results.push({
        testId: `link.${idx}`,
        testName: "Internal link href",
        category: "links",
        status: "fail",
        details: { description: "Internal link missing real href", element: describe(a), actual: href || "(empty)" },
      });
    }
    if (isExternal && a.target !== "_blank") {
      externalNoBlank++;
      results.push({
        testId: `link.${idx}.target`,
        testName: "External link target",
        category: "links",
        status: "warn",
        details: { description: "External link missing target=_blank", element: describe(a), actual: a.target || "(none)" },
      });
    }
  });
  results.push({
    testId: "links.summary",
    testName: "Links summary",
    category: "links",
    status: broken > 0 ? "fail" : externalNoBlank > 0 ? "warn" : "pass",
    details: { description: `${anchors.length} links. broken=${broken}, external_no_blank=${externalNoBlank}` },
  });
}

/* ---------------- GROUP 5 — Forms ---------------- */
function auditForms(results: QaResult[], doc: Document) {
  const fields = Array.from(doc.querySelectorAll("input, textarea, select")) as HTMLElement[];
  let unlabeled = 0, emptySelects = 0;
  fields.filter((e) => isVisible(e, doc)).forEach((f, idx) => {
    const id = f.id;
    const hasLabel = !!(
      f.getAttribute("aria-label") ||
      f.getAttribute("placeholder") ||
      (id && doc.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      f.closest("label")
    );
    if (!hasLabel) {
      unlabeled++;
      results.push({
        testId: `form.${idx}`,
        testName: "Form field label",
        category: "forms",
        status: "fail",
        details: { description: "Field has no label/aria-label/placeholder", element: describe(f) },
      });
    }
    if (f.tagName === "SELECT" && (f as HTMLSelectElement).options.length < 2) {
      emptySelects++;
      results.push({
        testId: `form.${idx}.options`,
        testName: "Select options",
        category: "forms",
        status: "warn",
        details: { description: "Select has fewer than 2 options", element: describe(f) },
      });
    }
  });
  results.push({
    testId: "forms.summary",
    testName: "Forms summary",
    category: "forms",
    status: unlabeled > 0 ? "fail" : "pass",
    details: { description: `${fields.length} fields. unlabeled=${unlabeled}, empty_selects=${emptySelects}` },
  });
}

/* ---------------- GROUP 6 — Scroll & Overflow ---------------- */
function auditOverflow(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const horizontal = doc.documentElement.scrollWidth > win.innerWidth + 1;
  results.push({
    testId: "overflow.document",
    testName: "Document horizontal overflow",
    category: "overflow",
    status: horizontal ? "fail" : "pass",
    details: {
      description: horizontal ? "Document scrolls horizontally" : "No horizontal overflow",
      expected: `<= ${win.innerWidth}`,
      actual: String(doc.documentElement.scrollWidth),
    },
  });

  const offenders: string[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he, doc)) return;
    if (he.scrollWidth > he.clientWidth + 1) {
      const cs = win.getComputedStyle(he);
      if (cs.overflowX === "visible") offenders.push(describe(he));
    }
  });
  if (offenders.length > 0) {
    results.push({
      testId: "overflow.elements",
      testName: "Element horizontal overflow",
      category: "overflow",
      status: "warn",
      details: { description: `${offenders.length} elements overflow horizontally`, samples: offenders.slice(0, 10) } as any,
    });
  }
}

/* ---------------- GROUP 7 — Fonts ---------------- */
function auditFonts(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const banned = ["inter", "roboto", "arial", "system-ui", "-apple-system"];
  const violations: { kind: string; element: string; font: string }[] = [];

  doc.querySelectorAll("h1, h2, h3").forEach((el) => {
    if (!isVisible(el, doc)) return;
    const f = win.getComputedStyle(el).fontFamily.toLowerCase();
    if (!f.includes("cormorant")) violations.push({ kind: "heading", element: describe(el), font: f });
  });
  doc.querySelectorAll("p, span, div").forEach((el) => {
    if (!isVisible(el, doc)) return;
    const text = (el as HTMLElement).innerText?.trim();
    if (!text || text.length < 10) return;
    if ((el as HTMLElement).children.length > 0) return;
    const f = win.getComputedStyle(el).fontFamily.toLowerCase();
    if (banned.some((b) => f.startsWith(b) || f.split(",")[0].trim().includes(b))) {
      if (!f.includes("dm sans") && !f.includes("cormorant") && !f.includes("jetbrains")) {
        violations.push({ kind: "body", element: describe(el), font: f });
      }
    } else if (!f.includes("dm sans") && !f.includes("cormorant") && !f.includes("jetbrains")) {
      violations.push({ kind: "body", element: describe(el), font: f });
    }
  });
  doc.querySelectorAll("[class*='score'], [class*='metric'], [class*='number'], [class*='mono']").forEach((el) => {
    if (!isVisible(el, doc)) return;
    const f = win.getComputedStyle(el).fontFamily.toLowerCase();
    if (!f.includes("jetbrains")) violations.push({ kind: "mono", element: describe(el), font: f });
  });

  results.push({
    testId: "fonts.compliance",
    testName: "Font compliance",
    category: "fonts",
    status: violations.length === 0 ? "pass" : "warn",
    details: {
      description: `${violations.length} font violations`,
      samples: violations.slice(0, 15),
    } as any,
  });
}

/* ---------------- GROUP 8 — Color Compliance (orange) ---------------- */
function auditColors(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const allowedClassRe = /signal|alert|fading|dormant|urgent|warning|time-sensitive|status/i;
  const violations: string[] = [];

  doc.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he, doc)) return;
    const cs = win.getComputedStyle(he);
    const candidates = [cs.color, cs.backgroundColor, cs.borderColor];
    const hasOrange = candidates.some((c) => {
      const hex = rgbToHex(c);
      return hex === "#F97316" || /rgba?\(\s*249,\s*115,\s*22/.test(c);
    });
    if (!hasOrange) return;

    let allowed = false;
    let probe: HTMLElement | null = he;
    while (probe) {
      const cls = typeof probe.className === "string" ? probe.className : "";
      if (allowedClassRe.test(cls)) { allowed = true; break; }
      if (probe.closest && probe.closest("[data-trend-card], [data-live-intelligence]")) { allowed = true; break; }
      probe = probe.parentElement;
    }
    if (!allowed) violations.push(describe(he));
  });

  results.push({
    testId: "colors.orange",
    testName: "Orange color compliance",
    category: "colors",
    status: violations.length === 0 ? "pass" : "warn",
    details: {
      description: `${violations.length} unauthorized orange usages`,
      samples: violations.slice(0, 15),
    } as any,
  });
}

/* ---------------- GROUP 9 — Images ---------------- */
function auditImages(results: QaResult[], doc: Document) {
  const imgs = Array.from(doc.querySelectorAll("img")) as HTMLImageElement[];
  const broken = imgs.filter((i) => i.naturalWidth === 0 && i.complete);
  broken.forEach((i, idx) => {
    results.push({
      testId: `image.${idx}`,
      testName: "Broken image",
      category: "images",
      status: "fail",
      details: { description: "Image failed to load", element: describe(i), actual: i.src },
    });
  });
  results.push({
    testId: "images.summary",
    testName: "Images summary",
    category: "images",
    status: broken.length > 0 ? "fail" : "pass",
    details: { description: `${imgs.length} images, ${broken.length} broken` },
  });
}

/* ---------------- GROUP 10 — Animations ---------------- */
function auditAnimations(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const loaderRe = /spin|load|skeleton|pulse|shimmer/i;
  const offenders: string[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he, doc)) return;
    const cs = win.getComputedStyle(he);
    if (cs.animationIterationCount !== "infinite") return;
    const cls = typeof he.className === "string" ? he.className : "";
    if (loaderRe.test(cls)) return;
    offenders.push(describe(he));
  });
  results.push({
    testId: "animations.infinite",
    testName: "Infinite animations",
    category: "animations",
    status: offenders.length === 0 ? "pass" : "warn",
    details: {
      description: `${offenders.length} non-loader infinite animations`,
      samples: offenders.slice(0, 10),
    } as any,
  });
}

/* ---------------- runDomAudit ---------------- */
export async function runDomAudit(targetDoc?: Document): Promise<QaResult[]> {
  const doc = targetDoc || document;
  const results: QaResult[] = [];

  await safeRun(results, () => auditTooltips(results, doc), { testId: "tooltips.error", testName: "Tooltip group", category: "tooltips" });
  await safeRun(results, () => auditModals(results, doc), { testId: "modals.error", testName: "Modal group", category: "modals" });
  await safeRun(results, () => auditButtons(results, doc), { testId: "buttons.error", testName: "Buttons group", category: "buttons" });
  await safeRun(results, () => auditLinks(results, doc), { testId: "links.error", testName: "Links group", category: "links" });
  await safeRun(results, () => auditForms(results, doc), { testId: "forms.error", testName: "Forms group", category: "forms" });
  await safeRun(results, () => auditOverflow(results, doc), { testId: "overflow.error", testName: "Overflow group", category: "overflow" });
  await safeRun(results, () => auditFonts(results, doc), { testId: "fonts.error", testName: "Fonts group", category: "fonts" });
  await safeRun(results, () => auditColors(results, doc), { testId: "colors.error", testName: "Colors group", category: "colors" });
  await safeRun(results, () => auditImages(results, doc), { testId: "images.error", testName: "Images group", category: "images" });
  await safeRun(results, () => auditAnimations(results, doc), { testId: "animations.error", testName: "Animations group", category: "animations" });
  await safeRun(results, () => auditTooltipDeep(results, doc), { testId: "tooltips_deep.error", testName: "Tooltip deep group", category: "tooltips_deep" });
  await safeRun(results, () => auditLoadingStates(results, doc), { testId: "loading.error", testName: "Loading states group", category: "loading" });
  await safeRun(results, () => auditEmptyStates(results, doc), { testId: "empty.error", testName: "Empty states group", category: "empty" });
  await safeRun(results, () => auditAccessibility(results, doc), { testId: "a11y.error", testName: "Accessibility group", category: "accessibility" });

  // ── Functional UX groups (additive) ──
  await safeRun(results, () => auditTooltipsConsistency(results, doc), { testId: "tooltip.error", testName: "Tooltip consistency group", category: "tooltip" });
  await safeRun(results, () => auditModalsBehavior(results, doc), { testId: "modal.error", testName: "Modal behavior group", category: "modal" });
  await safeRun(results, () => auditFormValidation(results, doc), { testId: "formval.error", testName: "Form validation group", category: "formval" });
  await safeRun(results, () => auditContentGeneration(results, doc), { testId: "content.error", testName: "Content generation group", category: "content" });
  await safeRun(results, () => auditDataIntegrity(results, doc), { testId: "dataint.error", testName: "Data integrity group", category: "dataint" });
  await safeRun(results, () => auditCapturePipeline(results, doc), { testId: "capture.error", testName: "Capture pipeline group", category: "capture" });
  await safeRun(results, () => auditAskAura(results, doc), { testId: "askaura.error", testName: "Ask Aura group", category: "askaura" });
  await safeRun(results, () => auditCTAIntegrity(results, doc), { testId: "cta.error", testName: "CTA integrity group", category: "cta" });
  await safeRun(results, () => auditErrorStates(results, doc), { testId: "errorstate.error", testName: "Error states group", category: "errorstate" });
  // ── Aura-specific, page-aware functional tests ──
  await safeRun(results, () => auditAuraPage(results, doc), { testId: "aura.error", testName: "Aura page tests", category: "aura" });
  await safeRun(results, () => auditCrossPage(results, doc), { testId: "crosspage.error", testName: "Cross-page consistency", category: "aura.crosspage" });
  // Navigation flow runs LAST because it may navigate the iframe away.
  await safeRun(results, () => auditNavFlow(results, doc), { testId: "navflow.error", testName: "Navigation flow group", category: "navflow" });

  return results;
}

export default runDomAudit;

/* ---------------- helpers for new groups ---------------- */
function parseRgb(s: string): [number, number, number, number] | null {
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] ? parseFloat(m[4]) : 1];
}
function relLum([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(fg: string, bg: string): number | null {
  const a = parseRgb(fg); const b = parseRgb(bg);
  if (!a || !b) return null;
  const L1 = relLum([a[0], a[1], a[2]]);
  const L2 = relLum([b[0], b[1], b[2]]);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- GROUP 11 — Tooltip Deep ---------------- */
async function auditTooltipDeep(results: QaResult[], doc: Document) {
  const triggers = new Set<Element>();
  doc.querySelectorAll("svg.lucide-help-circle, svg.lucide-info").forEach((s) => {
    const t = s.closest("button, [role='button'], span, div");
    if (t) triggers.add(t);
  });
  doc.querySelectorAll("button, span").forEach((el) => {
    const txt = (el as HTMLElement).innerText?.trim();
    if (txt === "?" || txt === "ⓘ") triggers.add(el);
  });
  const visible = Array.from(triggers).filter((e) => isVisible(e, doc));
  const behaviors: string[] = [];
  let i = 0;
  for (const el of visible.slice(0, 30)) {
    const before = new Set(doc.querySelectorAll("[role='tooltip'], [data-radix-popper-content-wrapper]"));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(250);
    const onHover = Array.from(doc.querySelectorAll("[role='tooltip'], [data-radix-popper-content-wrapper]")).filter(n => !before.has(n));
    const opensOnHover = onHover.length > 0;
    let opensOnClick = false;
    if (!opensOnHover) {
      (el as HTMLElement).click();
      await sleep(250);
      opensOnClick = Array.from(doc.querySelectorAll("[role='tooltip'], [role='dialog'], [data-radix-popper-content-wrapper]")).filter(n => !before.has(n)).length > 0;
    }
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(200);
    const trigger = opensOnHover ? "hover" : opensOnClick ? "click" : "none";
    behaviors.push(trigger);
    if (trigger === "none") {
      results.push({
        testId: `tooltip_deep.${i}`,
        testName: "Tooltip trigger behavior",
        category: "tooltips_deep",
        status: "warn",
        details: {
          description: `Trigger: ${trigger}`,
          element: describe(el),
          expected: "Consistent hover-to-open across the app",
          actual: trigger,
          severity: "medium",
        },
      });
    }
    i++;
  }
  const set = new Set(behaviors.filter(b => b !== "none"));
  if (set.size > 1) {
    results.push({
      testId: "tooltip_deep.consistency",
      testName: "Tooltip pattern consistency",
      category: "tooltips_deep",
      status: "fail",
      details: {
        description: `Mixed tooltip patterns found: ${Array.from(set).join(", ")}`,
        expected: "All tooltips use the same trigger pattern",
        actual: Array.from(set).join(", "),
        severity: "high",
      },
    });
  }
}

/* ---------------- GROUP 12 — Loading States ---------------- */
function auditLoadingStates(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const skeletons = doc.querySelectorAll("[class*='skeleton' i], [data-skeleton], [class*='shimmer' i]");
  const spinners = doc.querySelectorAll("[class*='spinner' i], svg.lucide-loader-2, [class*='loading' i]");
  results.push({
    testId: "loading.skeletons",
    testName: "Skeleton loaders present",
    category: "loading",
    status: skeletons.length === 0 && spinners.length === 0 ? "warn" : "pass",
    details: {
      description: `Found ${skeletons.length} skeletons, ${spinners.length} spinners`,
      expected: "Skeleton or spinner during data fetch",
      actual: `skeletons=${skeletons.length}, spinners=${spinners.length}`,
      severity: "medium",
    },
  });
  const badSpinners: string[] = [];
  spinners.forEach((s) => {
    if (!isVisible(s, doc)) return;
    const cs = win.getComputedStyle(s);
    const color = cs.color.toLowerCase();
    const rgb = parseRgb(color);
    if (rgb) {
      const isBronze = Math.abs(rgb[0] - 197) < 40 && Math.abs(rgb[1] - 165) < 40 && Math.abs(rgb[2] - 90) < 40;
      const isInk = rgb[0] > 200 && rgb[1] > 200 && rgb[2] > 200;
      if (!isBronze && !isInk) badSpinners.push(describe(s));
    }
  });
  if (badSpinners.length > 0) {
    results.push({
      testId: "loading.spinner_color",
      testName: "Spinner brand color",
      category: "loading",
      status: "warn",
      details: {
        description: `${badSpinners.length} spinners not using brand bronze`,
        expected: "Brand bronze (#C5A55A) or ink",
        actual: "off-brand color",
        samples: badSpinners.slice(0, 5),
        severity: "low",
      } as any,
    });
  }
}

/* ---------------- GROUP 13 — Empty States ---------------- */
function auditEmptyStates(results: QaResult[], doc: Document) {
  const empties = doc.querySelectorAll("[class*='empty' i], [data-empty]");
  let generic = 0;
  empties.forEach((el, idx) => {
    if (!isVisible(el, doc)) return;
    const txt = ((el as HTMLElement).innerText || "").toLowerCase();
    if (/no data yet|nothing here|empty/.test(txt) && txt.length < 60) {
      generic++;
      results.push({
        testId: `empty.${idx}`,
        testName: "Generic empty state copy",
        category: "empty",
        status: "warn",
        details: {
          description: "Empty state uses generic copy",
          element: describe(el),
          expected: "Personalized copy referencing user context",
          actual: txt.slice(0, 80),
          severity: "medium",
        },
      });
    }
  });
  results.push({
    testId: "empty.summary",
    testName: "Empty states summary",
    category: "empty",
    status: empties.length === 0 ? "warn" : generic > 0 ? "warn" : "pass",
    details: {
      description: `${empties.length} empty-state regions, ${generic} generic`,
      severity: "low",
    },
  });
}

/* ---------------- GROUP 14 — Accessibility ---------------- */
function auditAccessibility(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const imgs = Array.from(doc.querySelectorAll("img")) as HTMLImageElement[];
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt"));
  noAlt.forEach((i, idx) => results.push({
    testId: `a11y.alt.${idx}`,
    testName: "Image missing alt text",
    category: "accessibility",
    status: "fail",
    details: { description: "Image has no alt attribute", element: describe(i), expected: "alt attribute (empty allowed for decorative)", actual: "(missing)", severity: "high" },
  }));

  const samples = Array.from(doc.querySelectorAll("p, span, h1, h2, h3, button, a, label")).filter((e) => isVisible(e, doc)).slice(0, 80);
  const contrastFails: any[] = [];
  samples.forEach((el, idx) => {
    const he = el as HTMLElement;
    const text = he.innerText?.trim();
    if (!text || text.length < 2) return;
    const cs = win.getComputedStyle(he);
    let bg = cs.backgroundColor;
    let p: HTMLElement | null = he;
    while (p && (!bg || /rgba\([^)]*,\s*0(?:\.0+)?\)/.test(bg) || bg === "transparent")) {
      p = p.parentElement;
      if (!p) break;
      bg = win.getComputedStyle(p).backgroundColor;
    }
    if (!bg || bg === "transparent") bg = "rgb(10,10,10)";
    const ratio = contrastRatio(cs.color, bg);
    if (ratio === null) return;
    const fontSize = parseFloat(cs.fontSize);
    const fontWeight = parseInt(cs.fontWeight) || 400;
    const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
    const min = isLarge ? 3 : 4.5;
    if (ratio < min) {
      contrastFails.push({
        testId: `a11y.contrast.${idx}`,
        element: describe(he),
        ratio: ratio.toFixed(2),
        required: min,
        fg: cs.color,
        bg,
        text: text.slice(0, 40),
      });
    }
  });
  contrastFails.slice(0, 20).forEach((f) => results.push({
    testId: f.testId,
    testName: "WCAG contrast below threshold",
    category: "accessibility",
    status: "fail",
    details: {
      description: `Contrast ${f.ratio}:1 < ${f.required}:1 — "${f.text}"`,
      element: f.element,
      expected: `${f.required}:1`,
      actual: `${f.ratio}:1`,
      fg: f.fg,
      bg: f.bg,
      severity: "high",
    } as any,
  }));
  results.push({
    testId: "a11y.contrast.summary",
    testName: "Contrast summary",
    category: "accessibility",
    status: contrastFails.length === 0 ? "pass" : "fail",
    details: { description: `${contrastFails.length} contrast violations among ${samples.length} sampled`, severity: "high" },
  });

  const buttons = Array.from(doc.querySelectorAll("button, a, [role='button']")).filter((e) => isVisible(e, doc)).slice(0, 30);
  let unfocusable = 0;
  buttons.forEach((b, idx) => {
    const he = b as HTMLElement;
    he.focus({ preventScroll: true } as any);
    const cs = win.getComputedStyle(he);
    const hasOutline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    const hasRing = cs.boxShadow && cs.boxShadow !== "none";
    if (!hasOutline && !hasRing) {
      unfocusable++;
      if (unfocusable <= 8) {
        results.push({
          testId: `a11y.focus.${idx}`,
          testName: "Missing focus indicator",
          category: "accessibility",
          status: "fail",
          details: {
            description: "Element has no visible focus indicator on Tab",
            element: describe(he),
            expected: "outline or ring on :focus-visible",
            actual: "none",
            severity: "high",
          },
        });
      }
    }
    he.blur();
  });
}

/* ============================================================
 * Functional UX audit groups (additive — do not modify above).
 * All event dispatches use the passed-in `doc` so they work
 * inside an iframe.contentDocument context.
 * ============================================================ */

function locationOf(el: Element): string {
  let p: Element | null = el;
  while (p) {
    if ((p as HTMLElement).id) return `#${(p as HTMLElement).id}`;
    const tag = p.tagName.toLowerCase();
    if (tag === "section" || tag === "main" || tag === "header" || tag === "nav") {
      const heading = p.querySelector("h1, h2, h3");
      if (heading) return `${tag} › "${(heading as HTMLElement).innerText?.trim().slice(0, 40)}"`;
      return tag;
    }
    p = p.parentElement;
  }
  return "(unknown)";
}

function rectsNear(a: DOMRect, b: DOMRect, px = 200): boolean {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(dx, dy) <= px;
}

function findTooltipNear(doc: Document, trigger: Element, before: Set<Element>): HTMLElement | null {
  const win = getWin(doc);
  const triggerRect = (trigger as HTMLElement).getBoundingClientRect();
  const candidates = Array.from(
    doc.querySelectorAll(
      "[role='tooltip'], [data-radix-popper-content-wrapper], [class*='tooltip' i], [class*='popover' i], [class*='tip' i]"
    )
  );
  for (const c of candidates) {
    if (before.has(c)) continue;
    if (!isVisible(c, doc)) continue;
    const cs = win.getComputedStyle(c as HTMLElement);
    if (cs.position !== "fixed" && cs.position !== "absolute") {
      // also accept role='tooltip' regardless of position
      if (c.getAttribute("role") !== "tooltip") continue;
    }
    const r = (c as HTMLElement).getBoundingClientRect();
    if (rectsNear(triggerRect, r, 220)) return c as HTMLElement;
  }
  return null;
}

/* ---------------- Tooltip Consistency ---------------- */
async function auditTooltipsConsistency(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const triggers = new Set<Element>();
  doc.querySelectorAll("[data-tooltip], [data-tip], [aria-describedby]").forEach((el) => triggers.add(el));
  doc.querySelectorAll("svg[class*='help' i], svg[class*='info' i], svg[class*='question' i]").forEach((s) => {
    const t = s.closest("button, [role='button'], span, div");
    if (t) triggers.add(t);
  });
  doc.querySelectorAll("button, span, [role='button']").forEach((el) => {
    const t = (el as HTMLElement).innerText?.trim();
    if (t === "?" || t === "ⓘ") triggers.add(el);
  });

  const visible = Array.from(triggers).filter((e) => isVisible(e, doc)).slice(0, 30);
  const counts = { "hover-dismiss": 0, "click-dismiss": 0, "click-manual": 0, "hover-sticky": 0, "no-tooltip": 0 } as Record<string, number>;

  for (let i = 0; i < visible.length; i++) {
    const el = visible[i];
    const before = new Set(
      doc.querySelectorAll("[role='tooltip'], [data-radix-popper-content-wrapper], [class*='tooltip' i], [class*='popover' i], [class*='tip' i]")
    );

    let category: keyof typeof counts = "no-tooltip";

    try {
      el.dispatchEvent(new (win as any).MouseEvent("mouseenter", { bubbles: true }));
      el.dispatchEvent(new (win as any).MouseEvent("mouseover", { bubbles: true }));
      await sleep(400);
      let tip = findTooltipNear(doc, el, before);

      if (tip) {
        el.dispatchEvent(new (win as any).MouseEvent("mouseleave", { bubbles: true }));
        el.dispatchEvent(new (win as any).MouseEvent("mouseout", { bubbles: true }));
        await sleep(600);
        const stillThere = doc.contains(tip) && isVisible(tip, doc);
        category = stillThere ? "hover-sticky" : "hover-dismiss";
      } else {
        try { (el as HTMLElement).click(); } catch { /* noop */ }
        await sleep(400);
        tip = findTooltipNear(doc, el, before);
        if (tip) {
          (doc.body || doc.documentElement).dispatchEvent(new (win as any).MouseEvent("mousedown", { bubbles: true }));
          (doc.body || doc.documentElement).dispatchEvent(new (win as any).MouseEvent("click", { bubbles: true }));
          await sleep(400);
          const stillThere = doc.contains(tip) && isVisible(tip, doc);
          category = stillThere ? "click-manual" : "click-dismiss";
        } else {
          category = "no-tooltip";
        }
      }
    } catch {
      category = "no-tooltip";
    }

    counts[category]++;

    const status: QaStatus =
      category === "hover-dismiss" || category === "click-dismiss"
        ? "pass"
        : category === "no-tooltip"
          ? "warn"
          : "fail";

    results.push({
      testId: `tooltip.${i}`,
      testName: "Tooltip behavior",
      category: "tooltip",
      status,
      details: {
        description: `Trigger categorized as "${category}"`,
        element: describe(el),
        location: locationOf(el),
        expected: "hover-dismiss or click-dismiss",
        actual: category,
        severity: status === "fail" ? "high" : "low",
      } as any,
    });

    await sleep(150);
  }

  const goodTypes = ["hover-dismiss", "click-dismiss"].filter((k) => counts[k] > 0);
  const badTypes = ["click-manual", "hover-sticky"].filter((k) => counts[k] > 0);
  const mixed = goodTypes.length + badTypes.length > 1;

  results.push({
    testId: "tooltip.summary",
    testName: "Tooltip consistency summary",
    category: "tooltip",
    status: badTypes.length > 0 ? "fail" : mixed ? "warn" : "pass",
    details: {
      description: `Tested ${visible.length} triggers — ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      expected: "Single consistent tooltip pattern",
      actual: mixed ? "mixed patterns on this page" : "consistent",
      severity: badTypes.length > 0 ? "high" : "medium",
    } as any,
  });
}

/* ---------------- Modal Behavior ---------------- */
async function auditModalsBehavior(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const keywords = ["start", "generate", "share", "view", "edit", "regenerate", "refresh"];
  const candidates: HTMLElement[] = [];

  doc.querySelectorAll("button, [role='button'], a").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he, doc)) return;
    const t = (he.innerText || "").trim().toLowerCase();
    const cls = typeof he.className === "string" ? he.className.toLowerCase() : "";
    if (
      keywords.some((k) => t.includes(k)) ||
      /modal|dialog/.test(cls) ||
      /start assessment|start audit/.test(t)
    ) {
      candidates.push(he);
    }
  });

  const sample = candidates.slice(0, 8);
  let modalsFound = 0;

  for (let i = 0; i < sample.length; i++) {
    const trigger = sample[i];
    const before = new Set(doc.querySelectorAll("[role='dialog'], [data-state='open']"));
    let dialog: HTMLElement | null = null;

    try {
      trigger.click();
      await sleep(800);

      const dialogs = Array.from(
        doc.querySelectorAll("[role='dialog'], [class*='modal' i], [class*='dialog' i], [class*='overlay' i]")
      ).filter((n) => !before.has(n) && isVisible(n, doc));

      // also accept any new fixed-position element covering most of viewport
      if (dialogs.length === 0) {
        const all = Array.from(doc.querySelectorAll("body *")).filter((n) => !before.has(n) && isVisible(n, doc));
        for (const n of all) {
          const cs = win.getComputedStyle(n as HTMLElement);
          if (cs.position === "fixed") {
            const r = (n as HTMLElement).getBoundingClientRect();
            if (r.width > win.innerWidth * 0.5 && r.height > win.innerHeight * 0.4) {
              dialog = n as HTMLElement;
              break;
            }
          }
        }
      } else {
        dialog = dialogs[0] as HTMLElement;
      }
    } catch {
      // navigation or other — skip
      continue;
    }

    if (!dialog) {
      results.push({
        testId: `modal.${i}`,
        testName: "Modal trigger",
        category: "modal",
        status: "pass",
        details: {
          description: "Trigger did not open a modal (likely navigation or inline action)",
          element: describe(trigger),
          actual: "no-modal",
          severity: "low",
        } as any,
      });
      continue;
    }

    modalsFound++;

    const hasCloseBtn =
      !!dialog.querySelector(
        "button[aria-label*='close' i], button[aria-label*='dismiss' i], [data-dismiss], button.close"
      ) ||
      Array.from(dialog.querySelectorAll("button")).some((b) => /close|cancel|×/i.test(b.innerText || ""));

    // Escape
    doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(400);
    let closesOnEscape = !doc.contains(dialog) || !isVisible(dialog, doc);

    // Backdrop click
    let closesOnBackdrop = closesOnEscape;
    if (!closesOnEscape) {
      const backdrop =
        doc.querySelector("[data-radix-dialog-overlay], [class*='overlay' i], [class*='backdrop' i]") as HTMLElement | null;
      if (backdrop && isVisible(backdrop, doc)) {
        try {
          backdrop.dispatchEvent(new (win as any).MouseEvent("mousedown", { bubbles: true }));
          backdrop.dispatchEvent(new (win as any).MouseEvent("click", { bubbles: true }));
        } catch { /* noop */ }
        await sleep(400);
        closesOnBackdrop = !doc.contains(dialog) || !isVisible(dialog, doc);
      }
    }

    // Best-effort: ensure closed before next test
    if (doc.contains(dialog) && isVisible(dialog, doc)) {
      doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      await sleep(200);
      const closeBtn = dialog.querySelector(
        "button[aria-label*='close' i], button[aria-label*='dismiss' i]"
      ) as HTMLElement | null;
      if (closeBtn) try { closeBtn.click(); } catch { /* noop */ }
      await sleep(200);
    }

    const issues: string[] = [];
    if (!hasCloseBtn) issues.push("no close button");
    if (!closesOnEscape) issues.push("does not close on Escape");
    if (!closesOnBackdrop) issues.push("does not close on backdrop click");

    results.push({
      testId: `modal.${i}`,
      testName: "Modal behavior",
      category: "modal",
      status: issues.length === 0 ? "pass" : "fail",
      details: {
        description: issues.length === 0 ? "Modal opens and closes cleanly" : issues.join("; "),
        element: describe(trigger),
        location: locationOf(trigger),
        expected: "Has close button, closes on Escape, closes on backdrop",
        actual: `has_close_button=${hasCloseBtn}, closes_on_escape=${closesOnEscape}, closes_on_backdrop=${closesOnBackdrop}`,
        severity: issues.length > 0 ? "high" : "low",
      } as any,
    });

    await sleep(200);
  }

  results.push({
    testId: "modal.summary",
    testName: "Modal behavior summary",
    category: "modal",
    status: "pass",
    details: {
      description: `${sample.length} triggers tested, ${modalsFound} modals opened`,
    },
  });
}

/* ---------------- Form Validation ---------------- */
async function auditFormValidation(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const inputs = (Array.from(doc.querySelectorAll("input, textarea")) as HTMLElement[])
    .filter((e) => isVisible(e, doc))
    .filter((e) => {
      const type = (e.getAttribute("type") || "").toLowerCase();
      return !["hidden", "checkbox", "radio", "file", "submit", "button"].includes(type);
    })
    .slice(0, 6);

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i] as HTMLInputElement | HTMLTextAreaElement;
    const form = input.closest("form");
    const submit =
      (form?.querySelector("button[type='submit'], input[type='submit']") as HTMLElement | null) ||
      (input.parentElement?.querySelector("button") as HTMLElement | null) ||
      (input.closest("div")?.querySelector("button") as HTMLElement | null);

    if (!submit) continue;

    try {
      input.value = "";
      input.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
      input.dispatchEvent(new (win as any).Event("change", { bubbles: true }));
      const beforeText = (doc.body.innerText || "").length;
      submit.click();
      await sleep(500);
      const afterText = (doc.body.innerText || "").length;

      const errorEl = doc.querySelector(
        "[role='alert'], [class*='error' i]:not([class*='boundary' i]), [aria-invalid='true'], [data-sonner-toast]"
      );
      const hasValidation = !!errorEl || afterText > beforeText + 5;

      results.push({
        testId: `formval.${i}`,
        testName: "Empty submission validation",
        category: "formval",
        status: hasValidation ? "pass" : "warn",
        details: {
          description: hasValidation
            ? "Empty submission produced validation feedback"
            : "Empty submission produced no warning",
          element: describe(input),
          location: locationOf(input),
          expected: "Visible error/toast on empty submit",
          actual: hasValidation ? "validation shown" : "silent submission",
          severity: hasValidation ? "low" : "medium",
        } as any,
      });
    } catch (e: any) {
      results.push({
        testId: `formval.${i}`,
        testName: "Empty submission validation",
        category: "formval",
        status: "warn",
        details: { description: `Could not test: ${e?.message ?? String(e)}`, element: describe(input) },
      });
    }

    await sleep(150);
  }
}

/* ---------------- Content Generation Smoke ---------------- */
async function auditContentGeneration(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const path = win.location?.pathname || "";
  if (!/\/publish/.test(path)) {
    results.push({
      testId: "content.skip",
      testName: "Content generation smoke",
      category: "content",
      status: "pass",
      details: { description: "not_applicable: only runs on /publish" },
    });
    return;
  }

  const buttons = Array.from(doc.querySelectorAll("button, [role='button']")) as HTMLElement[];
  const trigger = buttons.find((b) => {
    const t = (b.innerText || "").toLowerCase();
    return /generate/.test(t) && isVisible(b, doc);
  });

  if (!trigger) {
    results.push({
      testId: "content.skip",
      testName: "Content generation smoke",
      category: "content",
      status: "pass",
      details: { description: "not_applicable: no generate button found" },
    });
    return;
  }

  const input = (Array.from(doc.querySelectorAll("input, textarea")) as HTMLElement[]).find((e) => isVisible(e, doc)) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | undefined;

  try {
    if (input) {
      input.focus();
      input.value = "Digital transformation in water utilities";
      input.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
      input.dispatchEvent(new (win as any).Event("change", { bubbles: true }));
    }
    const beforeText = (doc.body.innerText || "").length;
    trigger.click();
    await sleep(10000);
    const afterText = (doc.body.innerText || "").length;
    const delta = afterText - beforeText;

    results.push({
      testId: "content.generate",
      testName: "Generate post smoke",
      category: "content",
      status: delta > 100 ? "pass" : "warn",
      details: {
        description: delta > 100 ? `New content rendered (+${delta} chars)` : `Insufficient new content (+${delta} chars)`,
        element: describe(trigger),
        expected: "> 100 chars of new content",
        actual: `+${delta} chars`,
        severity: delta > 100 ? "low" : "medium",
      } as any,
    });
  } catch (e: any) {
    results.push({
      testId: "content.generate",
      testName: "Generate post smoke",
      category: "content",
      status: "warn",
      details: { description: `Generation test errored: ${e?.message ?? String(e)}` },
    });
  }
}

/* ---------------- Data Display Integrity ---------------- */
function auditDataIntegrity(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const path = win.location?.pathname || "";

  const checks: { id: string; name: string; pass: boolean; detail: string }[] = [];

  if (/\/home/.test(path) || path === "/") {
    const scoreEl = Array.from(doc.querySelectorAll("[class*='score' i], [class*='metric' i]")).find((el) => {
      const t = (el as HTMLElement).innerText?.trim() || "";
      const n = parseFloat(t);
      return !Number.isNaN(n) && n > 0;
    });
    checks.push({ id: "dataint.home_score", name: "Home score visible", pass: !!scoreEl, detail: scoreEl ? "score present" : "no positive score found" });
  }

  if (/\/intelligence/.test(path)) {
    const signalCard = doc.querySelector("[class*='signal' i], [data-signal], [class*='card']");
    checks.push({ id: "dataint.intel_signal", name: "Intelligence signal card", pass: !!signalCard, detail: signalCard ? "card present" : "no signal card" });
  }

  if (/\/impact/.test(path)) {
    const text = (doc.body.innerText || "").toLowerCase();
    const hasBreakdown = /capture/.test(text) && /content/.test(text) && /signal/.test(text);
    checks.push({ id: "dataint.impact_breakdown", name: "Impact score breakdown", pass: hasBreakdown, detail: hasBreakdown ? "breakdown present" : "missing capture/content/signal labels" });
  }

  if (/\/my-story/.test(path)) {
    const text = (doc.body.innerText || "").toLowerCase();
    const hasFields = /firm|sector|company|role/.test(text);
    checks.push({ id: "dataint.story_fields", name: "My Story profile fields", pass: hasFields, detail: hasFields ? "fields present" : "no profile field labels" });
  }

  if (/\/publish/.test(path)) {
    const text = (doc.body.innerText || "");
    const hasTabs = /Plan/.test(text) && /Create/.test(text) && /Library/.test(text);
    checks.push({ id: "dataint.publish_tabs", name: "Publish tab navigation", pass: hasTabs, detail: hasTabs ? "tabs present" : "missing Plan/Create/Library" });
  }

  if (checks.length === 0) {
    results.push({
      testId: "dataint.skip",
      testName: "Data integrity",
      category: "dataint",
      status: "pass",
      details: { description: `not_applicable for path ${path}` },
    });
    return;
  }

  checks.forEach((c) =>
    results.push({
      testId: c.id,
      testName: c.name,
      category: "dataint",
      status: c.pass ? "pass" : "fail",
      details: {
        description: c.detail,
        expected: "Real data rendered",
        actual: c.pass ? "ok" : "empty/missing",
        severity: c.pass ? "low" : "high",
      } as any,
    })
  );
}

/* ---------------- Navigation Flow (LAST) ---------------- */
async function auditNavFlow(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const sidebar =
    doc.querySelector("[data-aura-sidebar], aside, nav") ||
    doc.querySelector("[class*='sidebar' i]");
  if (!sidebar) {
    results.push({
      testId: "navflow.skip",
      testName: "Navigation flow",
      category: "navflow",
      status: "pass",
      details: { description: "no sidebar found" },
    });
    return;
  }

  const items = Array.from(sidebar.querySelectorAll("a, button, [role='button']"))
    .filter((e) => isVisible(e, doc))
    .filter((e) => {
      const t = (e as HTMLElement).innerText?.trim() || "";
      return t.length > 0 && t.length < 30;
    })
    .slice(0, 6);

  for (let i = 0; i < items.length; i++) {
    const el = items[i] as HTMLElement;
    const text = el.innerText?.trim() || "";
    const beforePath = win.location?.pathname || "";
    const beforeBodyLen = (doc.body.innerText || "").length;
    let afterPath = beforePath;
    let renderedOk = false;
    let errored = false;

    try {
      el.click();
      await sleep(1500);
      afterPath = win.location?.pathname || "";
      const afterBodyLen = (doc.body.innerText || "").length;
      renderedOk = afterPath !== beforePath || Math.abs(afterBodyLen - beforeBodyLen) > 50;
    } catch (e: any) {
      errored = true;
    }

    const changed = afterPath !== beforePath;
    const blank = (doc.body.innerText || "").trim().length < 100;

    results.push({
      testId: `navflow.${i}`,
      testName: "Sidebar nav button",
      category: "navflow",
      status: errored || blank ? "fail" : changed || renderedOk ? "pass" : "warn",
      details: {
        description: errored
          ? "Click threw an error"
          : blank
            ? "Navigated to blank/404 page"
            : changed
              ? `Navigated ${beforePath} → ${afterPath}`
              : "URL did not change",
        element: describe(el),
        expected: "URL change and content render",
        actual: `from=${beforePath} to=${afterPath} rendered=${renderedOk}`,
        button_text: text,
        severity: errored || blank ? "high" : "low",
      } as any,
    });

    // After first navigation the page is gone — stop iterating.
    if (changed) break;
  }
}

/* ---------------- Capture Pipeline ---------------- */
async function auditCapturePipeline(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const path = win.location?.pathname || "";
  if (!/\/home/.test(path) && path !== "/") {
    return;
  }
  const buttons = (Array.from(doc.querySelectorAll("button, [role='button']")) as HTMLElement[])
    .filter((b) => isVisible(b, doc));
  const trigger = buttons.find((b) => /capture/i.test(b.innerText || "") || /capture/i.test(b.getAttribute("aria-label") || ""));
  if (!trigger) {
    results.push({
      testId: "capture.skip",
      testName: "Capture pipeline",
      category: "capture",
      status: "warn",
      details: { description: "No capture trigger found on this page", severity: "medium" } as any,
    });
    return;
  }
  try {
    trigger.click();
    await sleep(800);
    const sheet = doc.querySelector("[role='dialog'], [class*='sheet' i], [class*='capture' i]");
    const hasUrlInput = !!doc.querySelector("input[type='url'], input[placeholder*='url' i], input[placeholder*='link' i]");
    const hasTextOption = !!Array.from(doc.querySelectorAll("button, [role='tab']")).find((e) =>
      /text|note/i.test((e as HTMLElement).innerText || "")
    );
    const hasVoiceOption = !!Array.from(doc.querySelectorAll("button, [role='tab']")).find((e) =>
      /voice|record|mic/i.test((e as HTMLElement).innerText || "")
    );
    const submitBtn = Array.from(doc.querySelectorAll("button")).find((b) =>
      /save|submit|capture|add/i.test((b as HTMLElement).innerText || "")
    ) as HTMLElement | undefined;

    const issues: string[] = [];
    if (!sheet) issues.push("capture sheet did not open");
    if (!hasUrlInput) issues.push("no URL input");
    if (!hasTextOption) issues.push("no text/note option");
    if (!hasVoiceOption) issues.push("no voice option");
    if (!submitBtn) issues.push("no submit button");

    results.push({
      testId: "capture.interface",
      testName: "Capture interface",
      category: "capture",
      status: issues.length === 0 ? "pass" : "fail",
      details: {
        description: issues.length === 0 ? "Capture interface complete" : issues.join("; "),
        expected: "URL input, text option, voice option, submit button",
        actual: issues.join("; ") || "ok",
        severity: issues.length > 0 ? "high" : "low",
      } as any,
    });

    // close
    doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(300);
  } catch (e: any) {
    results.push({
      testId: "capture.error_run",
      testName: "Capture pipeline",
      category: "capture",
      status: "warn",
      details: { description: `Could not test: ${e?.message ?? String(e)}` },
    });
  }
}

/* ---------------- Ask Aura Availability ---------------- */
async function auditAskAura(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const buttons = (Array.from(doc.querySelectorAll("button, [role='button']")) as HTMLElement[])
    .filter((b) => isVisible(b, doc));
  const trigger = buttons.find((b) => /ask aura/i.test(b.innerText || "") || /ask aura/i.test(b.getAttribute("aria-label") || ""));
  if (!trigger) {
    results.push({
      testId: "askaura.skip",
      testName: "Ask Aura availability",
      category: "askaura",
      status: "warn",
      details: { description: "No Ask Aura button found", severity: "medium" } as any,
    });
    return;
  }
  try {
    trigger.click();
    await sleep(1000);
    const panel = doc.querySelector("[role='dialog'], [class*='chat' i], [class*='aura' i][class*='panel' i]");
    const input = doc.querySelector("textarea, input[type='text']") as HTMLElement | null;
    const sendBtn = Array.from(doc.querySelectorAll("button")).find((b) =>
      /send|ask/i.test((b as HTMLElement).innerText || "") || /send/i.test(b.getAttribute("aria-label") || "")
    ) as HTMLElement | undefined;

    const issues: string[] = [];
    if (!panel) issues.push("chat panel did not open");
    if (!input) issues.push("no input field");
    if (!sendBtn) issues.push("no send button");

    results.push({
      testId: "askaura.open",
      testName: "Ask Aura opens",
      category: "askaura",
      status: issues.length === 0 ? "pass" : "fail",
      details: {
        description: issues.length === 0 ? "Ask Aura panel ready" : issues.join("; "),
        expected: "Panel with input and send button",
        actual: issues.join("; ") || "ok",
        severity: issues.length > 0 ? "high" : "low",
      } as any,
    });

    // close
    doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(300);
  } catch (e: any) {
    results.push({
      testId: "askaura.error_run",
      testName: "Ask Aura availability",
      category: "askaura",
      status: "warn",
      details: { description: `Could not test: ${e?.message ?? String(e)}` },
    });
  }
}

/* ---------------- CTA Integrity (dead CTA detection) ---------------- */
async function auditCTAIntegrity(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const ctaTextRe = /(capture now|see your signals|upload linkedin|generate this|train voice|view all|see more|explore|→)/i;
  const destructiveRe = /(delete|remove|clear|reset|disconnect|sign out|log ?out)/i;
  const candidates = (Array.from(doc.querySelectorAll("button, a, [role='button']")) as HTMLElement[])
    .filter((e) => isVisible(e, doc))
    .filter((e) => {
      const t = (e.innerText || "").trim();
      if (!t) return false;
      if (destructiveRe.test(t)) return false;
      return ctaTextRe.test(t) || /→/.test(t);
    })
    .slice(0, 8);

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const beforeUrl = win.location?.href || "";
    const beforeOpenDialogs = doc.querySelectorAll("[role='dialog'][data-state='open'], [aria-expanded='true']").length;
    const beforeChildren = doc.body?.children.length || 0;
    let acted = false;
    try {
      el.click();
      await sleep(1000);
      const afterUrl = win.location?.href || "";
      const afterOpenDialogs = doc.querySelectorAll("[role='dialog'][data-state='open'], [aria-expanded='true']").length;
      const afterChildren = doc.body?.children.length || 0;
      acted =
        afterUrl !== beforeUrl ||
        afterOpenDialogs !== beforeOpenDialogs ||
        afterChildren !== beforeChildren;
    } catch {
      acted = true; // navigation throw counts as action
    }
    results.push({
      testId: `cta.${i}`,
      testName: "CTA action",
      category: "cta",
      status: acted ? "pass" : "fail",
      details: {
        description: acted ? "CTA produced an action" : "CTA appears dead — clicking did nothing",
        element: describe(el),
        location: locationOf(el),
        expected: "Navigation, modal/panel, or visible state change",
        actual: acted ? "action observed" : "no observable change",
        severity: acted ? "low" : "high",
      } as any,
    });
    // best-effort cleanup
    doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(150);
  }
}

/* ---------------- Loading & Error State Detection ---------------- */
function auditErrorStates(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const text = (doc.body?.innerText || "");

  // Stuck spinners (visible loaders)
  const spinners = Array.from(
    doc.querySelectorAll("[class*='spinner' i], svg.lucide-loader-2, [class*='loading' i], .animate-spin")
  ).filter((e) => isVisible(e, doc));
  if (spinners.length > 0) {
    results.push({
      testId: "errorstate.spinners",
      testName: "Visible loading spinners",
      category: "errorstate",
      status: "warn",
      details: {
        description: `${spinners.length} spinner(s) visible at audit time — may be stuck`,
        samples: spinners.slice(0, 5).map(describe),
        severity: "medium",
      } as any,
    });
  }

  // Visible error text
  const errorRe = /(something went wrong|failed to load|an error occurred|try again|error \d{3})/i;
  if (errorRe.test(text)) {
    const match = text.match(errorRe)?.[0] || "error";
    results.push({
      testId: "errorstate.visible_error",
      testName: "Visible error message",
      category: "errorstate",
      status: "fail",
      details: {
        description: `Page renders an error message: "${match}"`,
        expected: "Successful render with no surfaced error",
        actual: match,
        severity: "high",
      } as any,
    });
  }

  // Blank tall containers (possible failed fetch)
  const blanks: string[] = [];
  doc.querySelectorAll("section, article, main > div, [data-section]").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he, doc)) return;
    const r = he.getBoundingClientRect();
    if (r.height < 50) return;
    const inner = (he.innerText || "").trim();
    const childCount = he.children.length;
    if (childCount === 0 && inner.length === 0) {
      blanks.push(describe(he));
    }
  });
  if (blanks.length > 0) {
    results.push({
      testId: "errorstate.blank_sections",
      testName: "Blank data sections",
      category: "errorstate",
      status: "warn",
      details: {
        description: `${blanks.length} visible section(s) have no content`,
        samples: blanks.slice(0, 5),
        severity: "medium",
      } as any,
    });
  }

  void win;
}

/* ============================================================
 * Aura-specific page-aware functional tests.
 * Each helper runs only when the iframe URL matches the target page.
 * URL detection works for both /home, /intelligence, etc. AND
 * /home?tab=intelligence (the SPA tab routing used in AdminQA).
 * ============================================================ */

function getCurrentPage(doc: Document): "home" | "intelligence" | "publish" | "impact" | "my-story" | "other" {
  const win = getWin(doc);
  const path = win.location?.pathname || "";
  const search = win.location?.search || "";
  const tab = (search.match(/[?&]tab=([^&]+)/) || [])[1];
  if (/\/intelligence\b/.test(path) || tab === "intelligence") return "intelligence";
  if (/\/publish\b/.test(path) || tab === "authority") return "publish";
  if (/\/impact\b/.test(path) || tab === "influence") return "impact";
  if (/\/my-story\b/.test(path) || tab === "identity") return "my-story";
  if (/\/home\b/.test(path) || path === "/" || (path === "/home" && !tab)) return "home";
  return "other";
}

function txt(el: Element | null | undefined): string {
  return ((el as HTMLElement | null)?.innerText || "").trim();
}
function bodyText(doc: Document): string {
  return (doc.body?.innerText || "").trim();
}
function findByText(root: ParentNode, selector: string, re: RegExp): HTMLElement | null {
  const list = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
  return list.find((e) => re.test(e.innerText || "")) || null;
}
function findAllByText(root: ParentNode, selector: string, re: RegExp): HTMLElement[] {
  return (Array.from(root.querySelectorAll(selector)) as HTMLElement[]).filter((e) => re.test(e.innerText || ""));
}
function pushPage(
  results: QaResult[],
  page: string,
  id: string,
  name: string,
  status: QaStatus,
  description: string,
  expected?: string,
  actual?: string,
  severity: "critical" | "high" | "medium" | "low" = "high",
) {
  results.push({
    testId: `aura.${page}.${id}`,
    testName: name,
    category: `aura.${page}`,
    status,
    details: { description, expected, actual, page, severity } as any,
  });
}

/* ---------------- Router ---------------- */
async function auditAuraPage(results: QaResult[], doc: Document) {
  const page = getCurrentPage(doc);
  switch (page) {
    case "home": await auditHomePage(results, doc); break;
    case "intelligence": await auditIntelligencePage(results, doc); break;
    case "publish": await auditPublishPage(results, doc); break;
    case "impact": await auditImpactPage(results, doc); break;
    case "my-story": await auditMyStoryPage(results, doc); break;
    default: break;
  }
  // Ask Aura + Capture run on every authenticated page where the trigger exists.
  await auditAskAuraDeep(results, doc);
  await auditCaptureDeep(results, doc);
}

/* ---------------- HOME ---------------- */
async function auditHomePage(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const text = bodyText(doc);

  // H1 — Aura Score visible and valid + tier match
  try {
    const scoreCandidates = Array.from(doc.querySelectorAll("[class*='score' i], [class*='ring' i], svg text, h1, h2, .text-metric, [class*='metric' i]"))
      .map((e) => txt(e))
      .map((t) => parseInt(t.match(/\b(\d{1,3})\b/)?.[1] || "", 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 100);
    const tierMatch = text.match(/\b(Observer|Strategist|Authority)\b/);
    const tier = tierMatch?.[1];
    const score = scoreCandidates.find((n) => n > 0) ?? scoreCandidates[0];

    if (score === undefined || Number.isNaN(score)) {
      pushPage(results, "home", "h1", "Aura Score visible", "fail",
        "No score number 0–100 found on Home", "score 0–100 displayed", "missing");
    } else if (!tier) {
      pushPage(results, "home", "h1", "Aura Score visible", "warn",
        `Score ${score} found but no tier label`, "tier label near score", "no tier label");
    } else {
      const expectedTier = score >= 65 ? "Authority" : score >= 35 ? "Strategist" : "Observer";
      const ok = tier === expectedTier;
      pushPage(results, "home", "h1", "Aura Score and tier match", ok ? "pass" : "fail",
        ok ? `Score ${score} matches tier ${tier}` : `Score ${score} but tier shows ${tier} (expected ${expectedTier})`,
        `tier=${expectedTier} for score=${score}`,
        `tier=${tier}`);
    }
  } catch (e: any) {
    pushPage(results, "home", "h1", "Aura Score visible", "warn", `Error: ${e?.message || e}`);
  }

  // H2 — Personalized greeting
  const greetingEl = Array.from(doc.querySelectorAll("h1, h2, h3, p, div"))
    .find((e) => /good (morning|afternoon|evening)/i.test(txt(e))) as HTMLElement | undefined;
  if (!greetingEl) {
    pushPage(results, "home", "h2", "Personalized greeting", "warn",
      "No 'Good morning/afternoon/evening' greeting found", "personalized greeting with first name", "missing");
  } else {
    const g = txt(greetingEl);
    const bad = /undefined|null|\bUser\b/.test(g);
    const hasName = /,\s*[A-Z][a-z]+/.test(g) || /good (morning|afternoon|evening)\s+[A-Z][a-z]+/i.test(g);
    pushPage(results, "home", "h2", "Personalized greeting",
      bad ? "fail" : hasName ? "pass" : "warn",
      bad ? `Greeting contains placeholder: "${g.slice(0, 60)}"`
          : hasName ? `Greeting personalized: "${g.slice(0, 60)}"`
                    : `Greeting present but name unclear: "${g.slice(0, 60)}"`,
      "Greeting includes user's first name",
      g.slice(0, 80));
  }

  // H3 — Recommended moves / Aura's Read
  const moveSection = findByText(doc, "section, div, article", /YOUR NEXT MOVE|AURA'?S READ|recommended move/i);
  if (!moveSection) {
    pushPage(results, "home", "h3", "Recommended moves section", "warn",
      "No 'Your Next Move' or 'Aura's Read' section found", "section visible", "missing");
  } else {
    const ctas = Array.from(moveSection.querySelectorAll("button, a")).filter((b) => /publish|capture|view|read|→/i.test(txt(b)));
    const ok = ctas.length > 0 && txt(moveSection).length > 40;
    pushPage(results, "home", "h3", "Recommended moves with CTAs", ok ? "pass" : "fail",
      ok ? `Found ${ctas.length} CTA(s)` : "Section present but no actionable CTAs",
      ">=1 move with CTA button", `${ctas.length} CTAs found`);
  }

  // H4 — Live Intelligence feed
  const liveSection = findByText(doc, "section, div, article", /LIVE INTELLIGENCE|trending|industry trends/i);
  if (liveSection) {
    const cards = liveSection.querySelectorAll("[class*='card' i], article, li");
    const refreshBtn = findByText(liveSection, "button", /refresh/i);
    pushPage(results, "home", "h4", "Live Intelligence feed",
      cards.length > 0 || refreshBtn ? "pass" : "fail",
      cards.length > 0 ? `${cards.length} trend card(s)` : refreshBtn ? "Empty state with refresh CTA" : "Section blank — no cards and no empty state",
      ">=1 trend card OR refresh empty-state",
      `cards=${cards.length}`);
  }

  // H5 — Silence Alarm (best-effort)
  if (/INTELLIGENCE IS DECAYING|days since|fading signals/i.test(text)) {
    const cta = findByText(doc, "button, a", /capture now|→/i);
    pushPage(results, "home", "h5", "Silence alarm CTA", cta ? "pass" : "warn",
      cta ? "Silence alarm has actionable CTA" : "Silence alarm present without CTA",
      "alarm with capture CTA",
      cta ? "ok" : "missing CTA");
  }

  // H6 — Authority journey
  if (/Observer/i.test(text) && /Strategist/i.test(text) && /Authority/i.test(text)) {
    pushPage(results, "home", "h6", "Authority journey ladder", "pass",
      "Observer/Strategist/Authority labels present");
  } else {
    pushPage(results, "home", "h6", "Authority journey ladder", "warn",
      "Tier ladder labels not all visible", "Observer + Strategist + Authority", "incomplete");
  }

  // H7 — Capture rhythm grid
  const rhythm = doc.querySelector("[class*='rhythm' i], [data-capture-rhythm]");
  if (rhythm) {
    const cells = rhythm.querySelectorAll("[class*='cell' i], [class*='dot' i], [class*='square' i], div > div");
    const filled = Array.from(cells).filter((c) => {
      const cs = win.getComputedStyle(c as HTMLElement);
      const bg = cs.backgroundColor;
      return bg && bg !== "transparent" && !/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(bg);
    });
    pushPage(results, "home", "h7", "Capture rhythm grid",
      cells.length >= 4 ? "pass" : "fail",
      cells.length >= 4 ? `${cells.length} cells (${filled.length} filled)` : "Not enough rhythm cells",
      ">=4 rhythm cells", `${cells.length} cells`);
  }

  // H8 — Score breakdown
  const breakdownOk = /capture/i.test(text) && /content/i.test(text) && /signal/i.test(text);
  pushPage(results, "home", "h8", "Score breakdown components",
    breakdownOk ? "pass" : "warn",
    breakdownOk ? "Capture / Content / Signal labels present" : "Score breakdown labels missing",
    "Capture + Content + Signal labels",
    breakdownOk ? "all present" : "incomplete");
}

/* ---------------- INTELLIGENCE ---------------- */
async function auditIntelligencePage(results: QaResult[], doc: Document) {
  const text = bodyText(doc);

  // I1 — Signal cards
  const signalCards = Array.from(doc.querySelectorAll("[class*='signal' i], [data-signal], article"))
    .filter((e) => isVisible(e, doc));
  if (signalCards.length === 0 && /no signals yet/i.test(text)) {
    pushPage(results, "intelligence", "i1", "Signal cards display", "fail",
      "Empty 'no signals yet' state shown for user with captures", "signal cards visible", "empty state");
  } else {
    pushPage(results, "intelligence", "i1", "Signal cards display",
      signalCards.length > 0 ? "pass" : "warn",
      signalCards.length > 0 ? `${signalCards.length} signal-like card(s)` : "No signal cards detected",
      ">=1 signal card", `${signalCards.length}`);
  }

  // I2 — Confidence percentages
  const pcts = (text.match(/\b(\d{1,3})\s*%/g) || [])
    .map((s) => parseInt(s, 10))
    .filter((n) => n > 0 && n <= 100);
  if (pcts.length > 0) {
    const sortedDesc = [...pcts].sort((a, b) => b - a);
    const isDesc = pcts.slice(0, sortedDesc.length).every((v, i) => v >= (pcts[i + 1] ?? -Infinity)) ||
      pcts.join(",") === sortedDesc.join(",");
    pushPage(results, "intelligence", "i2", "Confidence values valid",
      isDesc ? "pass" : "warn",
      isDesc ? `${pcts.length} confidence values, descending` : `${pcts.length} confidence values, not strictly ordered`,
      "1–100, ordered descending",
      `count=${pcts.length}, ordered=${isDesc}`);
  }

  // I3 — Velocity badges
  const velocityRe = /accelerating|stable|fading|dormant/i;
  pushPage(results, "intelligence", "i3", "Velocity badges",
    velocityRe.test(text) ? "pass" : "warn",
    velocityRe.test(text) ? "Velocity vocabulary present" : "No velocity badges detected",
    "accelerating/stable/fading/dormant",
    velocityRe.test(text) ? "found" : "missing");

  // I4 — Signals vs Sources tabs
  const sourcesTab = findByText(doc, "button, [role='tab'], a", /^sources$/i);
  const signalsTab = findByText(doc, "button, [role='tab'], a", /^signals$/i);
  if (sourcesTab && signalsTab) {
    try {
      const before = bodyText(doc);
      sourcesTab.click(); await sleep(800);
      const after = bodyText(doc);
      const changed = Math.abs(after.length - before.length) > 30 || after.slice(0, 200) !== before.slice(0, 200);
      pushPage(results, "intelligence", "i4", "Signals/Sources tabs switch",
        changed ? "pass" : "fail",
        changed ? "Sources tab changed content" : "Tabs didn't change content",
        "Tab click changes content",
        changed ? "changed" : "no change");
      signalsTab.click(); await sleep(500);
    } catch (e: any) {
      pushPage(results, "intelligence", "i4", "Signals/Sources tabs switch", "warn", `Error: ${e?.message || e}`);
    }
  }

  // I5 — Signal expand
  const firstCard = signalCards[0] as HTMLElement | undefined;
  if (firstCard) {
    try {
      const before = bodyText(doc).length;
      firstCard.click(); await sleep(700);
      const after = bodyText(doc).length;
      pushPage(results, "intelligence", "i5", "Signal expand",
        after - before > 40 ? "pass" : "warn",
        after - before > 40 ? `Detail expanded (+${after - before} chars)` : "Click did not reveal detail",
        "Expanded detail visible",
        `delta=${after - before}`);
    } catch (e: any) {
      pushPage(results, "intelligence", "i5", "Signal expand", "warn", `Error: ${e?.message || e}`);
    }
  }

  // I6 — Market Coverage
  if (/MARKET COVERAGE/i.test(text)) {
    const hasPct = /\b\d{1,3}\s*%/.test(text);
    pushPage(results, "intelligence", "i6", "Market coverage section",
      hasPct ? "pass" : "warn",
      hasPct ? "Coverage section with percentage" : "Coverage section missing percentage",
      "Coverage % badge",
      hasPct ? "ok" : "no %");
  }

  // I7 — Your next move
  const move = findByText(doc, "section, div, article", /YOUR NEXT MOVE/i);
  if (move) {
    const cta = findByText(move, "button, a", /publish|→/i);
    pushPage(results, "intelligence", "i7", "Your next move CTA",
      cta ? "pass" : "fail",
      cta ? "Move with publish CTA" : "Move section missing CTA",
      "Publish → button",
      cta ? "ok" : "missing");
  }

  // I8 — Stats strip
  const statsRe = /(SOURCES|SIGNALS|MOVES)/g;
  const labels = [...new Set((text.toUpperCase().match(statsRe) || []))];
  if (labels.length >= 2) {
    const numbers = (text.match(/\b\d+\b/g) || []).map(Number).filter((n) => n > 0);
    pushPage(results, "intelligence", "i8", "Stats strip non-zero",
      numbers.length > 0 ? "pass" : "fail",
      numbers.length > 0 ? `Stats strip shows positive counters` : "All stat counters appear zero",
      "At least one counter > 0",
      `positive_numbers=${numbers.length}`);
  }
}

/* ---------------- PUBLISH ---------------- */
async function auditPublishPage(results: QaResult[], doc: Document) {
  const text = bodyText(doc);

  // P1 — Three tabs
  const planTab = findByText(doc, "button, [role='tab'], a", /^plan$/i);
  const createTab = findByText(doc, "button, [role='tab'], a", /^create$/i);
  const libraryTab = findByText(doc, "button, [role='tab'], a", /^library$/i);
  const tabsFound = [planTab, createTab, libraryTab].filter(Boolean).length;
  pushPage(results, "publish", "p1", "Plan/Create/Library tabs",
    tabsFound === 3 ? "pass" : "fail",
    tabsFound === 3 ? "All three tabs present" : `Only ${tabsFound}/3 tabs found`,
    "Plan + Create + Library", `${tabsFound}/3`);

  // P2 — Create tab form
  if (createTab) {
    try {
      createTab.click(); await sleep(800);
      const input = doc.querySelector("textarea, input[type='text']") as HTMLElement | null;
      const langToggle = findByText(doc, "button, [role='tab']", /english|arabic/i);
      pushPage(results, "publish", "p2", "Create tab form",
        input ? "pass" : "fail",
        input ? "Topic input + language toggle present" : "No topic input on Create tab",
        "input + language toggle",
        `input=${!!input}, lang=${!!langToggle}`);
    } catch (e: any) {
      pushPage(results, "publish", "p2", "Create tab form", "warn", `Error: ${e?.message || e}`);
    }
  }

  // P3 — Generate button (no destructive submit; just verify presence + handler)
  const genBtn = findByText(doc, "button", /generate/i);
  pushPage(results, "publish", "p3", "Generate button present",
    genBtn ? "pass" : "fail",
    genBtn ? `Generate button found` : "No Generate button visible",
    "Generate button visible + clickable",
    genBtn ? "ok" : "missing");

  // P4 — Flash mode
  const flash = findByText(doc, "button, a", /flash mode|try flash/i);
  pushPage(results, "publish", "p4", "Flash mode trigger",
    flash ? "pass" : "warn",
    flash ? "Flash mode trigger present" : "No Flash mode trigger found",
    "Flash mode CTA",
    flash ? "ok" : "missing");

  // P5 — Output actions (only meaningful if generated content exists)
  const copyBtn = findByText(doc, "button", /copy/i);
  const saveBtn = findByText(doc, "button", /save|library/i);
  if (copyBtn || saveBtn) {
    pushPage(results, "publish", "p5", "Post output actions", "pass",
      `Found Copy=${!!copyBtn}, Save=${!!saveBtn}`);
  }

  // P6 — Library
  if (libraryTab) {
    try {
      libraryTab.click(); await sleep(900);
      const libText = bodyText(doc);
      const isEmpty = /no posts|nothing here|empty/i.test(libText) && libText.length < 400;
      pushPage(results, "publish", "p6", "Library tab content",
        isEmpty ? "fail" : "pass",
        isEmpty ? "Library appears empty" : "Library has content",
        "Drafts/Published visible",
        isEmpty ? "empty" : "ok");
    } catch (e: any) {
      pushPage(results, "publish", "p6", "Library tab", "warn", `Error: ${e?.message || e}`);
    }
  }

  // P7 — Plan tab
  if (planTab) {
    try {
      planTab.click(); await sleep(900);
      const planText = bodyText(doc);
      const cards = doc.querySelectorAll("[class*='card' i], article");
      const ok = cards.length > 0 && planText.length > 200;
      pushPage(results, "publish", "p7", "Plan tab suggestions",
        ok ? "pass" : "fail",
        ok ? `${cards.length} suggestion-like cards` : "Plan tab appears empty",
        ">=1 angle suggestion",
        `cards=${cards.length}`);
    } catch (e: any) {
      pushPage(results, "publish", "p7", "Plan tab", "warn", `Error: ${e?.message || e}`);
    }
  }

  // P8 — Voice match
  if (/VOICE MATCH|train voice|voice engine/i.test(text)) {
    pushPage(results, "publish", "p8", "Voice match indicator", "pass",
      "Voice match / train voice indicator present");
  } else {
    pushPage(results, "publish", "p8", "Voice match indicator", "warn",
      "No voice match indicator found", "Voice match status visible", "missing");
  }
}

/* ---------------- IMPACT ---------------- */
async function auditImpactPage(results: QaResult[], doc: Document) {
  const text = bodyText(doc);

  // M1 — Score and tier
  const tierMatch = text.match(/\b(Observer|Strategist|Authority)\b/);
  const numbers = (text.match(/\b(\d{1,3})\b/g) || []).map(Number).filter((n) => n >= 0 && n <= 100);
  const score = numbers.find((n) => n > 0);
  if (score === undefined) {
    pushPage(results, "impact", "m1", "Authority score visible", "fail",
      "No score number found on Impact", "score 0–100", "missing");
  } else if (tierMatch) {
    const expectedTier = score >= 65 ? "Authority" : score >= 35 ? "Strategist" : "Observer";
    const ok = tierMatch[1] === expectedTier;
    pushPage(results, "impact", "m1", "Score and tier match",
      ok ? "pass" : "fail",
      ok ? `Score ${score} matches ${tierMatch[1]}` : `Score ${score} but tier ${tierMatch[1]} (expected ${expectedTier})`,
      `tier=${expectedTier}`,
      `tier=${tierMatch[1]}`);
  }

  // M2 — Breakdown components
  const hasAll = /capture/i.test(text) && /content/i.test(text) && /signal/i.test(text);
  pushPage(results, "impact", "m2", "Score breakdown 3 components",
    hasAll ? "pass" : "fail",
    hasAll ? "Capture/Content/Signal labels present" : "Missing one or more breakdown labels",
    "Capture + Content + Signal", hasAll ? "all" : "missing");

  // M3 — Trajectory scenario toggles
  const scenarios = ["current pace", "2x publishing", "stop capturing"];
  const buttons = scenarios.map((s) => findByText(doc, "button, [role='tab']", new RegExp(s.replace(/[*+?^${}()|[\]\\]/g, "\\$&"), "i")));
  if (buttons.filter(Boolean).length >= 2) {
    try {
      const snapshots: string[] = [];
      for (const b of buttons) {
        if (!b) continue;
        b.click(); await sleep(500);
        snapshots.push(bodyText(doc).slice(0, 800));
      }
      const allSame = snapshots.every((s) => s === snapshots[0]);
      pushPage(results, "impact", "m3", "Trajectory scenarios differ",
        allSame ? "fail" : "pass",
        allSame ? "All scenarios show identical numbers" : "Scenarios produce different forecasts",
        "Each scenario shows different forecast",
        allSame ? "identical" : "different");
    } catch (e: any) {
      pushPage(results, "impact", "m3", "Trajectory scenarios", "warn", `Error: ${e?.message || e}`);
    }
  }

  // M4 — Capture activity
  const chart = doc.querySelector("svg, canvas, [class*='chart' i], [class*='heatmap' i]");
  pushPage(results, "impact", "m4", "Capture activity chart",
    chart ? "pass" : "warn",
    chart ? "Chart element rendered" : "No chart element found",
    "Chart or heatmap visible",
    chart ? "ok" : "missing");

  // M5 — LinkedIn data section
  if (/upload linkedin|post performance/i.test(text)) {
    const upload = findByText(doc, "button, a", /upload/i);
    pushPage(results, "impact", "m5", "LinkedIn data section",
      upload ? "pass" : "warn",
      upload ? "Upload action present" : "Section without upload CTA",
      "Upload button or rendered data",
      upload ? "ok" : "missing");
  }

  // M6 — Market Mirror / Shadow Twin
  if (/market mirror|shadow twin/i.test(text)) {
    pushPage(results, "impact", "m6", "Market Mirror present", "pass",
      "Market Mirror section detected");
  }
}

/* ---------------- MY STORY ---------------- */
async function auditMyStoryPage(results: QaResult[], doc: Document) {
  const text = bodyText(doc);

  // S1 — Profile fields
  const hasName = /name/i.test(text);
  const hasFirm = /firm|company|organi[sz]ation/i.test(text);
  const hasSector = /sector|industry/i.test(text);
  const editBtns = findAllByText(doc, "button", /edit/i);
  const ok = hasName && hasFirm && hasSector;
  pushPage(results, "my-story", "s1", "Profile fields populated",
    ok ? "pass" : "fail",
    ok ? `Name + Firm + Sector visible (${editBtns.length} edit btns)` : "One or more profile field labels missing",
    "Name + Firm + Sector visible",
    `name=${hasName}, firm=${hasFirm}, sector=${hasSector}`);

  // S2 — Strategic identity
  if (/strategic identity|archetype|expertise|target client/i.test(text)) {
    pushPage(results, "my-story", "s2", "Strategic identity section", "pass",
      "Identity section content present");
  }

  // S3 — Signal coverage
  if (/signal coverage|coverage map/i.test(text)) {
    const pcts = (text.match(/\b(\d{1,3})\s*%/g) || []).map((s) => parseInt(s, 10)).filter((n) => n > 0 && n <= 100);
    pushPage(results, "my-story", "s3", "Signal coverage map",
      pcts.length > 0 ? "pass" : "warn",
      pcts.length > 0 ? `${pcts.length} coverage values` : "Coverage section without %",
      ">=1 theme bar with %",
      `pcts=${pcts.length}`);
  }

  // S4 — Market Mirror tabs
  if (/market mirror/i.test(text)) {
    const tabs = ["headhunter", "client cio|client", "conference"]
      .map((re) => findByText(doc, "button, [role='tab']", new RegExp(re, "i")))
      .filter(Boolean) as HTMLElement[];
    if (tabs.length >= 2) {
      try {
        const snaps: string[] = [];
        for (const t of tabs) {
          t.click(); await sleep(500);
          const panel = doc.querySelector("[role='tabpanel'], [class*='mirror' i]") || doc.body;
          snaps.push(((panel as HTMLElement).innerText || "").slice(0, 500));
        }
        const allSame = snaps.every((s) => s === snaps[0]);
        pushPage(results, "my-story", "s4", "Market Mirror perspectives differ",
          allSame ? "fail" : "pass",
          allSame ? "All perspectives show identical text" : "Perspectives differ",
          "Each tab unique perspective",
          allSame ? "identical" : "different");
      } catch (e: any) {
        pushPage(results, "my-story", "s4", "Market Mirror perspectives", "warn", `Error: ${e?.message || e}`);
      }
    }
  }

  // S5 — Brand assessment
  const brand = findByText(doc, "button, a", /start assessment|brand assessment/i);
  pushPage(results, "my-story", "s5", "Brand assessment trigger",
    brand ? "pass" : "warn",
    brand ? "Brand assessment button present" : "No brand assessment trigger",
    "Start Assessment button",
    brand ? "ok" : "missing");

  // S6 — Evidence audit
  const audit = findByText(doc, "button, a", /start audit|evidence audit/i);
  pushPage(results, "my-story", "s6", "Evidence audit trigger",
    audit ? "pass" : "warn",
    audit ? "Evidence audit button present" : "No evidence audit trigger",
    "Start Audit button",
    audit ? "ok" : "missing");

  // S7 — Milestones
  if (/milestone|achievement/i.test(text)) {
    pushPage(results, "my-story", "s7", "Milestones section", "pass",
      "Milestones/achievements present");
  }
}

/* ---------------- ASK AURA (deep) ---------------- */
async function auditAskAuraDeep(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const trigger = findByText(doc, "button, a, [role='button']", /ask aura/i);
  if (!trigger) return;
  // A1 + A2: open
  let panel: Element | null = null;
  try {
    trigger.click(); await sleep(1000);
    panel = doc.querySelector("[role='dialog'], [class*='chat' i], [class*='aura' i][class*='panel' i]");
    pushPage(results, "ask-aura", "a1", "Ask Aura opens",
      panel ? "pass" : "fail",
      panel ? "Chat panel opened" : "Click did not open chat",
      "Chat panel visible",
      panel ? "open" : "no panel");
  } catch (e: any) {
    pushPage(results, "ask-aura", "a1", "Ask Aura opens", "warn", `Error: ${e?.message || e}`);
    return;
  }

  if (!panel) return;

  const input = doc.querySelector("[role='dialog'] textarea, [role='dialog'] input[type='text'], textarea, input[type='text']") as HTMLInputElement | HTMLTextAreaElement | null;
  const sendBtn = Array.from(doc.querySelectorAll("button")).find((b) =>
    /send|ask/i.test(txt(b)) || /send/i.test(b.getAttribute("aria-label") || "")
  ) as HTMLElement | undefined;
  pushPage(results, "ask-aura", "a2", "Ask Aura input + send",
    input && sendBtn ? "pass" : "fail",
    input && sendBtn ? "Input and send button present" : `input=${!!input}, send=${!!sendBtn}`,
    "Input + Send button", `input=${!!input}, send=${!!sendBtn}`);

  // A3 + A4: question/response (best-effort)
  if (input && sendBtn) {
    try {
      const before = (panel as HTMLElement).innerText.length;
      input.value = "What should I publish this week?";
      input.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
      sendBtn.click();
      await sleep(10000);
      const after = ((panel as HTMLElement).innerText || "").length;
      const delta = after - before;
      const responseText = ((panel as HTMLElement).innerText || "").slice(before);
      const ok = delta > 50 && !/^error/i.test(responseText.trim());
      pushPage(results, "ask-aura", "a3", "Ask Aura responds",
        ok ? "pass" : "fail",
        ok ? `Response received (+${delta} chars)` : "No useful response after 10s",
        ">50 chars of response",
        `delta=${delta}`);
      if (ok) {
        const hasSignalLike = /\d{1,3}\s*%/.test(responseText) || /\*\*/.test(responseText);
        const hasRec = /publish|write|post|capture/i.test(responseText);
        const quality = hasSignalLike || hasRec;
        pushPage(results, "ask-aura", "a4", "Response quality (uses signals/recommendations)",
          quality ? "pass" : "warn",
          quality ? "Response references signals or recommends action" : "Response is generic",
          "Mentions signal % or actionable verb",
          `signal=${hasSignalLike}, rec=${hasRec}`);
      }
    } catch (e: any) {
      pushPage(results, "ask-aura", "a3", "Ask Aura responds", "warn", `Error: ${e?.message || e}`);
    }
  }

  // close
  try { doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); } catch { /* noop */ }
  await sleep(300);
}

/* ---------------- CAPTURE (deep) ---------------- */
async function auditCaptureDeep(results: QaResult[], doc: Document) {
  const win = getWin(doc);
  const trigger = findByText(doc, "button, a, [role='button']", /^capture$|capture now/i);
  if (!trigger) return;
  try {
    trigger.click(); await sleep(1000);
    const sheet = doc.querySelector("[role='dialog'], [class*='sheet' i], [class*='capture' i]");
    pushPage(results, "capture", "c1", "Capture interface opens",
      sheet ? "pass" : "fail",
      sheet ? "Capture interface opened" : "Click did not open capture",
      "Capture sheet/modal", sheet ? "open" : "missing");
    if (!sheet) return;

    const urlInput = doc.querySelector("input[type='url'], input[placeholder*='url' i], input[placeholder*='link' i]") as HTMLInputElement | null;
    const textOpt = findByText(doc, "button, [role='tab']", /text|note/i);
    const voiceOpt = findByText(doc, "button, [role='tab']", /voice|record|mic/i);
    const types = [urlInput, textOpt, voiceOpt].filter(Boolean).length;
    pushPage(results, "capture", "c2", "Capture input types",
      types >= 2 ? "pass" : "fail",
      `Found ${types} capture types (url=${!!urlInput}, text=${!!textOpt}, voice=${!!voiceOpt})`,
      ">=2 capture types",
      `${types}`);

    if (urlInput) {
      try {
        urlInput.value = "https://example.com/test";
        urlInput.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
        await sleep(200);
        const submit = findByText(doc, "button", /save|submit|capture|add/i);
        const enabled = !!submit && !(submit as HTMLButtonElement).disabled;
        pushPage(results, "capture", "c3", "Submit enabled with content",
          enabled ? "pass" : "fail",
          enabled ? "Submit enabled when input has content" : "Submit missing or disabled",
          "Enabled submit button",
          `submit=${!!submit}, disabled=${(submit as HTMLButtonElement | null)?.disabled}`);
      } catch (e: any) {
        pushPage(results, "capture", "c3", "Submit enabled", "warn", `Error: ${e?.message || e}`);
      }
    }

    // close
    doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(300);
  } catch (e: any) {
    pushPage(results, "capture", "c1", "Capture interface", "warn", `Error: ${e?.message || e}`);
  }
}

/* ---------------- CROSS-PAGE CONSISTENCY ---------------- */
async function auditCrossPage(results: QaResult[], doc: Document) {
  const win = getWin(doc);

  // X1 — Sidebar active state
  const sidebar =
    doc.querySelector("[data-aura-sidebar], aside, nav") ||
    doc.querySelector("[class*='sidebar' i]");
  if (sidebar) {
    const items = Array.from(sidebar.querySelectorAll("a, button")).filter((e) => isVisible(e, doc));
    const active = items.find((it) => {
      const cls = typeof (it as HTMLElement).className === "string" ? (it as HTMLElement).className : "";
      const aria = (it as HTMLElement).getAttribute("aria-current");
      return /active|selected|current/i.test(cls) || aria === "page" || aria === "true";
    });
    results.push({
      testId: "aura.crosspage.x1",
      testName: "Sidebar active state",
      category: "aura.crosspage",
      status: active ? "pass" : "fail",
      details: {
        description: active ? `Active item: "${txt(active).slice(0, 30)}"` : "No active state on any sidebar item",
        expected: "One sidebar item visually marked active",
        actual: active ? "active item found" : "none",
        severity: "high",
      } as any,
    });
  }

  // X2 — Help icon
  const help =
    findByText(doc, "button, [role='button']", /^\?$/) ||
    (doc.querySelector("svg[class*='help' i], svg[class*='question' i]")?.closest("button, [role='button']") as HTMLElement | null);
  if (help) {
    try {
      const before = doc.querySelectorAll("[role='dialog'], [class*='panel' i]").length;
      help.click(); await sleep(500);
      const after = doc.querySelectorAll("[role='dialog'], [class*='panel' i]").length;
      const opened = after > before;
      results.push({
        testId: "aura.crosspage.x2",
        testName: "Help panel opens",
        category: "aura.crosspage",
        status: opened ? "pass" : "warn",
        details: {
          description: opened ? "Help panel opened" : "Help icon click had no observable effect",
          severity: opened ? "low" : "medium",
        } as any,
      });
      if (opened) {
        doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        await sleep(200);
      }
    } catch (e: any) {
      results.push({
        testId: "aura.crosspage.x2",
        testName: "Help panel opens",
        category: "aura.crosspage",
        status: "warn",
        details: { description: `Error: ${e?.message || e}` } as any,
      });
    }
  }

  // X3 — Theme toggle
  const themeBtn =
    doc.querySelector("[aria-label*='theme' i], [aria-label*='dark' i], [aria-label*='light' i]") as HTMLElement | null;
  if (themeBtn) {
    try {
      const root = doc.documentElement;
      const beforeTheme = root.getAttribute("data-theme") || (root.classList.contains("dark") ? "dark" : "light");
      themeBtn.click(); await sleep(500);
      const afterTheme = root.getAttribute("data-theme") || (root.classList.contains("dark") ? "dark" : "light");
      const changed = afterTheme !== beforeTheme;
      // restore
      if (changed) { themeBtn.click(); await sleep(300); }
      results.push({
        testId: "aura.crosspage.x3",
        testName: "Theme toggle",
        category: "aura.crosspage",
        status: changed ? "pass" : "fail",
        details: {
          description: changed ? `Toggled ${beforeTheme} → ${afterTheme}` : "Theme did not change",
          expected: "Visible theme change",
          actual: changed ? "changed" : "no change",
          severity: changed ? "low" : "high",
        } as any,
      });
    } catch (e: any) {
      results.push({
        testId: "aura.crosspage.x3",
        testName: "Theme toggle",
        category: "aura.crosspage",
        status: "warn",
        details: { description: `Error: ${e?.message || e}` } as any,
      });
    }
  }

  // X4 — Notification bell
  const bell = doc.querySelector("button[aria-label='Notifications'], button[aria-label*='notification' i]") as HTMLElement | null;
  if (bell) {
    try {
      bell.click(); await sleep(500);
      const popup = doc.querySelector("[role='dialog'], [data-radix-popper-content-wrapper], [class*='popover' i]");
      results.push({
        testId: "aura.crosspage.x4",
        testName: "Notification bell",
        category: "aura.crosspage",
        status: popup ? "pass" : "warn",
        details: {
          description: popup ? "Notification panel opened" : "Bell click had no visible panel",
          severity: popup ? "low" : "medium",
        } as any,
      });
      if (popup) {
        doc.dispatchEvent(new (win as any).KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        await sleep(200);
      }
    } catch (e: any) {
      results.push({
        testId: "aura.crosspage.x4",
        testName: "Notification bell",
        category: "aura.crosspage",
        status: "warn",
        details: { description: `Error: ${e?.message || e}` } as any,
      });
    }
  }
}
