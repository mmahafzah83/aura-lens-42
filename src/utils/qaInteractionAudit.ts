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

  return results;
}

export default runDomAudit;