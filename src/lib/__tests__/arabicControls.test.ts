import { describe, it, expect, afterEach } from "vitest";
import { stripArabicControlArrows } from "@/lib/arabicControls";

afterEach(() => { document.documentElement.dir = "ltr"; document.body.innerHTML = ""; });
describe("Arabic control arrows", () => {
  it("strips nested button/link arrows but leaves prose and control nodes intact", () => {
    document.documentElement.dir = "rtl";
    document.body.innerHTML = '<button>تابع <span>↖</span></button><a href="#">التالي →</a><p>أ → ب</p>';
    const button = document.querySelector("button");
    stripArabicControlArrows();
    expect(button?.textContent).toBe("تابع ");
    expect(document.querySelector("button")).toBe(button);
    expect(document.querySelector("a")?.textContent).toBe("التالي ");
    expect(document.querySelector("p")?.textContent).toBe("أ → ب");
  });
  it("leaves English controls unchanged", () => {
    document.documentElement.dir = "ltr";
    document.body.innerHTML = '<button>Continue ↗</button>';
    stripArabicControlArrows();
    expect(document.querySelector("button")?.textContent).toBe("Continue ↗");
  });
});