import { describe, it, expect } from "vitest";
import { displayNotificationTitle as d } from "../notificationTitle";
describe("notification titles", () => {
  it("maps the three stored titles", () => {
    expect(d("Your week in Aura", "ar")).toBe("أسبوعك في KnownBy");
    expect(d("Your first signal is live ✦", "ar")).toBe("أول إشارة لك ظهرت");
    expect(d("Strategic Nudge from Aura", "ar")).toBe("تنبيه من KnownBy");
    expect(d("Your week in Aura", "en")).toBe("Your week in KnownBy");
    expect(d("Strategic Nudge from Aura", "en")).toBe("A nudge from KnownBy");
    expect(d("Anything else", "ar")).toBe("Anything else");
  });
});
