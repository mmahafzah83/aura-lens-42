/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client-side DOM interaction audit. Runs against the currently rendered page.
 * Returns an array of structured QA results to be persisted by the caller.
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

function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (!he.getBoundingClientRect) return false;
  const r = he.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(he);
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

async function safeRun<T>(
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
async function auditTooltips(results: QaResult[]) {
  const candidates = new Set<Element>();
  document.querySelectorAll("[data-tooltip], [aria-describedby]").forEach((el) => candidates.add(el));
  document.querySelectorAll("svg.lucide-help-circle, svg.lucide-info").forEach((el) => {
    const trigger = (el as Element).closest("button, [role='button'], span, div");
    if (trigger) candidates.add(trigger);
  });
  document.querySelectorAll("button, span, [role='button']").forEach((el) => {
    const t = (el as HTMLElement).innerText?.trim();
    if (t === "?" || t === "ⓘ") candidates.add(el);
  });

  const visible = Array.from(candidates).filter(isVisible).slice(0, 20);

  for (let i = 0; i < visible.length; i++) {
    const el = visible[i];
    const before = new Set(document.querySelectorAll("[role='tooltip'], .tooltip, .popover, [data-radix-popper-content-wrapper]"));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(300);
    const afterEnter = Array.from(document.querySelectorAll("[role='tooltip'], .tooltip, .popover, [data-radix-popper-content-wrapper]"))
      .filter((n) => !before.has(n));
    const appeared = afterEnter.length > 0;

    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await sleep(500);
    const stillThere = afterEnter.filter((n) => document.contains(n) && isVisible(n));

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
    } else {
      results.push({
        testId: `tooltip.${i}`,
        testName: "Tooltip behavior",
        category: "tooltips",
        status: "pass",
        details: {
          description: appeared ? "Tooltip appeared on hover and dismissed cleanly" : "No tooltip appeared on hover",
          element: describe(el),
        },
      });
    }
  }
}

/* ---------------- GROUP 2 — Modal Behavior ---------------- */
async function auditModals(results: QaResult[]) {
  const triggerKeywords = ["start", "generate", "share", "assessment", "audit", "open", "view"];
  const candidates: HTMLElement[] = [];
  document.querySelectorAll("button, [role='button']").forEach((el) => {
    const t = ((el as HTMLElement).innerText || "").trim().toLowerCase();
    if (!t) return;
    if (triggerKeywords.some((k) => t.includes(k))) candidates.push(el as HTMLElement);
  });

  const sample = candidates.filter(isVisible).slice(0, 6);

  for (let i = 0; i < sample.length; i++) {
    const trigger = sample[i];
    const before = new Set(document.querySelectorAll("[role='dialog'], [data-state='open']"));
    trigger.click();
    await sleep(500);
    const dialogs = Array.from(document.querySelectorAll("[role='dialog']"))
      .filter((n) => !before.has(n) && isVisible(n));
    if (dialogs.length === 0) continue;

    const dialog = dialogs[0] as HTMLElement;
    const cs = getComputedStyle(dialog);
    const issues: string[] = [];

    // close button check
    const hasCloseBtn = !!dialog.querySelector(
      "button[aria-label*='close' i], button[aria-label*='dismiss' i], button.close, [data-dismiss]"
    ) || Array.from(dialog.querySelectorAll("button")).some((b) => /close|cancel|×/i.test(b.innerText || ""));
    if (!hasCloseBtn) issues.push("no visible close button");

    // position check (also walk parents — the fixed wrapper is usually a parent)
    let usesFixed = cs.position === "fixed";
    let p: HTMLElement | null = dialog.parentElement;
    let depth = 0;
    while (!usesFixed && p && depth < 4) {
      if (getComputedStyle(p).position === "fixed") usesFixed = true;
      p = p.parentElement;
      depth++;
    }
    if (!usesFixed) issues.push("uses position:absolute");

    // Escape close
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(400);
    const closedOnEscape = !document.contains(dialog) || !isVisible(dialog);
    if (!closedOnEscape) {
      issues.push("doesn't close on Escape");
      // try backdrop click
      const backdrop = document.querySelector(
        "[data-radix-dialog-overlay], [data-state='open'].fixed, .modal-backdrop, [aria-hidden='true'].fixed"
      ) as HTMLElement | null;
      if (backdrop) {
        backdrop.click();
        await sleep(400);
        const closedOnBackdrop = !document.contains(dialog) || !isVisible(dialog);
        if (!closedOnBackdrop) issues.push("doesn't close on backdrop click");
      } else {
        issues.push("no detectable backdrop");
      }
      // force close fallback to avoid leaking modals across tests
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
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
        expected: "fixed overlay, closes on Escape + backdrop, has close button",
        actual: issues.join("; ") || "ok",
      },
    });
  }
}

/* ---------------- GROUP 3 — Buttons ---------------- */
function auditButtons(results: QaResult[]) {
  const buttons = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible);
  let dead = 0, small = 0, unlabeled = 0;
  const samples: string[] = [];

  buttons.forEach((b, idx) => {
    const he = b as HTMLElement;
    const hasHandler = (he as any).onclick !== null || hasReactClickHandler(he) || he.getAttribute("type") === "submit";
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
function auditLinks(results: QaResult[]) {
  const anchors = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
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
function auditForms(results: QaResult[]) {
  const fields = Array.from(document.querySelectorAll("input, textarea, select")) as HTMLElement[];
  let unlabeled = 0, emptySelects = 0;
  fields.filter(isVisible).forEach((f, idx) => {
    const id = f.id;
    const hasLabel = !!(
      f.getAttribute("aria-label") ||
      f.getAttribute("placeholder") ||
      (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
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
function auditOverflow(results: QaResult[]) {
  const horizontal = document.documentElement.scrollWidth > window.innerWidth + 1;
  results.push({
    testId: "overflow.document",
    testName: "Document horizontal overflow",
    category: "overflow",
    status: horizontal ? "fail" : "pass",
    details: {
      description: horizontal ? "Document scrolls horizontally" : "No horizontal overflow",
      expected: `<= ${window.innerWidth}`,
      actual: String(document.documentElement.scrollWidth),
    },
  });

  const offenders: string[] = [];
  document.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he)) return;
    if (he.scrollWidth > he.clientWidth + 1) {
      const cs = getComputedStyle(he);
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
function auditFonts(results: QaResult[]) {
  const banned = ["inter", "roboto", "arial", "system-ui", "-apple-system"];
  const violations: { kind: string; element: string; font: string }[] = [];

  document.querySelectorAll("h1, h2, h3").forEach((el) => {
    if (!isVisible(el)) return;
    const f = getComputedStyle(el).fontFamily.toLowerCase();
    if (!f.includes("cormorant")) violations.push({ kind: "heading", element: describe(el), font: f });
  });
  document.querySelectorAll("p, span, div").forEach((el) => {
    if (!isVisible(el)) return;
    const text = (el as HTMLElement).innerText?.trim();
    if (!text || text.length < 10) return;
    if ((el as HTMLElement).children.length > 0) return;
    const f = getComputedStyle(el).fontFamily.toLowerCase();
    if (banned.some((b) => f.startsWith(b) || f.split(",")[0].trim().includes(b))) {
      if (!f.includes("dm sans") && !f.includes("cormorant") && !f.includes("jetbrains")) {
        violations.push({ kind: "body", element: describe(el), font: f });
      }
    } else if (!f.includes("dm sans") && !f.includes("cormorant") && !f.includes("jetbrains")) {
      violations.push({ kind: "body", element: describe(el), font: f });
    }
  });
  document.querySelectorAll("[class*='score'], [class*='metric'], [class*='number'], [class*='mono']").forEach((el) => {
    if (!isVisible(el)) return;
    const f = getComputedStyle(el).fontFamily.toLowerCase();
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
function auditColors(results: QaResult[]) {
  const allowedClassRe = /signal|alert|fading|dormant|urgent|warning|time-sensitive|status/i;
  const violations: string[] = [];

  document.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he)) return;
    const cs = getComputedStyle(he);
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
function auditImages(results: QaResult[]) {
  const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
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
function auditAnimations(results: QaResult[]) {
  const loaderRe = /spin|load|skeleton|pulse|shimmer/i;
  const offenders: string[] = [];
  document.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    if (!isVisible(he)) return;
    const cs = getComputedStyle(he);
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
export async function runDomAudit(): Promise<QaResult[]> {
  const results: QaResult[] = [];

  await safeRun(results, () => auditTooltips(results), { testId: "tooltips.error", testName: "Tooltip group", category: "tooltips" });
  await safeRun(results, () => auditModals(results), { testId: "modals.error", testName: "Modal group", category: "modals" });
  await safeRun(results, () => auditButtons(results), { testId: "buttons.error", testName: "Buttons group", category: "buttons" });
  await safeRun(results, () => auditLinks(results), { testId: "links.error", testName: "Links group", category: "links" });
  await safeRun(results, () => auditForms(results), { testId: "forms.error", testName: "Forms group", category: "forms" });
  await safeRun(results, () => auditOverflow(results), { testId: "overflow.error", testName: "Overflow group", category: "overflow" });
  await safeRun(results, () => auditFonts(results), { testId: "fonts.error", testName: "Fonts group", category: "fonts" });
  await safeRun(results, () => auditColors(results), { testId: "colors.error", testName: "Colors group", category: "colors" });
  await safeRun(results, () => auditImages(results), { testId: "images.error", testName: "Images group", category: "images" });
  await safeRun(results, () => auditAnimations(results), { testId: "animations.error", testName: "Animations group", category: "animations" });
  await safeRun(results, () => auditTooltipDeep(results), { testId: "tooltips_deep.error", testName: "Tooltip deep group", category: "tooltips_deep" });
  await safeRun(results, () => auditLoadingStates(results), { testId: "loading.error", testName: "Loading states group", category: "loading" });
  await safeRun(results, () => auditEmptyStates(results), { testId: "empty.error", testName: "Empty states group", category: "empty" });
  await safeRun(results, () => auditAccessibility(results), { testId: "a11y.error", testName: "Accessibility group", category: "accessibility" });

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
async function auditTooltipDeep(results: QaResult[]) {
  const triggers = new Set<Element>();
  document.querySelectorAll("svg.lucide-help-circle, svg.lucide-info").forEach((s) => {
    const t = s.closest("button, [role='button'], span, div");
    if (t) triggers.add(t);
  });
  document.querySelectorAll("button, span").forEach((el) => {
    const txt = (el as HTMLElement).innerText?.trim();
    if (txt === "?" || txt === "ⓘ") triggers.add(el);
  });
  const visible = Array.from(triggers).filter(isVisible);
  const behaviors: string[] = [];
  let i = 0;
  for (const el of visible.slice(0, 30)) {
    const before = new Set(document.querySelectorAll("[role='tooltip'], [data-radix-popper-content-wrapper]"));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(250);
    const onHover = Array.from(document.querySelectorAll("[role='tooltip'], [data-radix-popper-content-wrapper]")).filter(n => !before.has(n));
    const opensOnHover = onHover.length > 0;
    let opensOnClick = false;
    if (!opensOnHover) {
      (el as HTMLElement).click();
      await sleep(250);
      opensOnClick = Array.from(document.querySelectorAll("[role='tooltip'], [role='dialog'], [data-radix-popper-content-wrapper]")).filter(n => !before.has(n)).length > 0;
    }
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);
    const trigger = opensOnHover ? "hover" : opensOnClick ? "click" : "none";
    behaviors.push(trigger);
    results.push({
      testId: `tooltip_deep.${i++}`,
      testName: "Tooltip trigger behavior",
      category: "tooltips_deep",
      status: trigger === "none" ? "warn" : "pass",
      details: {
        description: `Trigger: ${trigger}`,
        element: describe(el),
        expected: "Consistent hover-to-open across the app",
        actual: trigger,
        severity: trigger === "none" ? "medium" : "low",
      },
    });
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
function auditLoadingStates(results: QaResult[]) {
  const skeletons = document.querySelectorAll("[class*='skeleton' i], [data-skeleton], [class*='shimmer' i]");
  const spinners = document.querySelectorAll("[class*='spinner' i], svg.lucide-loader-2, [class*='loading' i]");
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
    if (!isVisible(s)) return;
    const cs = getComputedStyle(s);
    const color = cs.color.toLowerCase();
    const rgb = parseRgb(color);
    if (rgb) {
      // bronze ~ #C5A55A => rgb(197,165,90)
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
function auditEmptyStates(results: QaResult[]) {
  const empties = document.querySelectorAll("[class*='empty' i], [data-empty]");
  let generic = 0;
  empties.forEach((el, idx) => {
    if (!isVisible(el)) return;
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
function auditAccessibility(results: QaResult[]) {
  // alt text
  const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt"));
  noAlt.forEach((i, idx) => results.push({
    testId: `a11y.alt.${idx}`,
    testName: "Image missing alt text",
    category: "accessibility",
    status: "fail",
    details: { description: "Image has no alt attribute", element: describe(i), expected: "alt attribute (empty allowed for decorative)", actual: "(missing)", severity: "high" },
  }));

  // contrast
  const samples = Array.from(document.querySelectorAll("p, span, h1, h2, h3, button, a, label")).filter(isVisible).slice(0, 80);
  const contrastFails: any[] = [];
  samples.forEach((el, idx) => {
    const he = el as HTMLElement;
    const text = he.innerText?.trim();
    if (!text || text.length < 2) return;
    const cs = getComputedStyle(he);
    // walk up to find non-transparent bg
    let bg = cs.backgroundColor;
    let p: HTMLElement | null = he;
    while (p && (!bg || /rgba\([^)]*,\s*0(?:\.0+)?\)/.test(bg) || bg === "transparent")) {
      p = p.parentElement;
      if (!p) break;
      bg = getComputedStyle(p).backgroundColor;
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

  // focus visibility — check :focus-visible style on buttons
  const buttons = Array.from(document.querySelectorAll("button, a, [role='button']")).filter(isVisible).slice(0, 30);
  let unfocusable = 0;
  buttons.forEach((b, idx) => {
    const he = b as HTMLElement;
    he.focus({ preventScroll: true } as any);
    const cs = getComputedStyle(he);
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