import { useEffect } from "react";

/**
 * Sprint F2 — Part B
 * Observes elements with [data-aura-anim="enter"] inside `root` and toggles
 * [data-aura-visible="true"] when they intersect the viewport. Each element
 * animates exactly once. Stagger is applied via --aura-anim-delay (80ms).
 *
 * Gated globally by [data-fx-card-entry="true"] in CSS, so this hook can run
 * unconditionally — disabling the token simply removes the animation styles.
 */
export function useCardEntryAnimation(root?: HTMLElement | null, deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const scope: ParentNode = root ?? document;

    // Tag any candidate cards that aren't already opted in.
    const candidates = scope.querySelectorAll<HTMLElement>(
      ".card, .glass-card, [data-aura-card='true'], .aura-card"
    );
    candidates.forEach((el) => {
      if (!el.hasAttribute("data-aura-anim")) {
        el.setAttribute("data-aura-anim", "enter");
      }
    });

    const targets = Array.from(
      scope.querySelectorAll<HTMLElement>("[data-aura-anim='enter']")
    ).filter((el) => el.getAttribute("data-aura-visible") !== "true");

    // Assign stagger order based on document position (per parent).
    const orderByParent = new Map<Element, number>();
    targets.forEach((el) => {
      const parent = el.parentElement || document.body;
      const i = orderByParent.get(parent) ?? 0;
      el.style.setProperty("--aura-anim-delay", `${Math.min(i, 8) * 80}ms`);
      orderByParent.set(parent, i + 1);
    });

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      targets.forEach((el) => el.setAttribute("data-aura-visible", "true"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.setAttribute("data-aura-visible", "true");
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, ...deps]);
}