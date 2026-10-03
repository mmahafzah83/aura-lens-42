import { describe, it, expect } from "vitest";
import "@/i18n";
import { humanDuration, waitCopy } from "@/lib/waitEstimate";
import { causeOf, retryLabel } from "@/lib/failureCause";
import { buildStages } from "@/lib/operationStages";
import { STAGE_LABELS, OPERATION_STAGES } from "../../../supabase/functions/_shared/stageKeys";
import { numberWord } from "@/i18n/numberWord";

/** English must read exactly as it did before extraction. */
describe("extracted English is unchanged", () => {
  it("humanDuration", () => {
    expect(humanDuration(5)).toBe("a few seconds");
    expect(humanDuration(30)).toBe("half a minute");
    expect(humanDuration(60)).toBe("about a minute");
    expect(humanDuration(90)).toBe("a minute and a half");
    expect(humanDuration(150)).toBe("two and a half minutes");
    expect(humanDuration(240)).toBe("four minutes");
    expect(humanDuration(170)).toBe("three minutes");
    expect(humanDuration(660)).toBe("11 minutes");
  });
  it("waitCopy", () => {
    expect(waitCopy({ known: false, stages: [] })).toBe("This takes a few minutes. We are still learning how long — the counter below is real.");
    expect(waitCopy({ known: true, p50: 150, p95: 240, sample: 12, stages: [] }))
      .toBe("This usually takes about two and a half minutes and almost always under four minutes. You can leave this open — the counter below is real.");
  });
  it("causeOf / retryLabel", () => {
    expect(causeOf(new Error("Failed to fetch"), "Reading your posts"))
      .toBe("KnownBy couldn't reach the step that reading your posts. This is on us, not your LinkedIn — it's been logged.");
    expect(causeOf("weird", "")).toBe("KnownBy couldn't finish this step. It's been logged and we can see it.");
    expect(causeOf("weird", "Writing your read")).toBe("KnownBy couldn't finish writing your read. It's been logged and we can see it.");
    expect(causeOf({ status: 429 }, "x")).toBe("LinkedIn is asking us to slow down. This usually clears within the hour.");
    expect(retryLabel("Reading your posts")).toBe("Try reading your posts again");
    expect(retryLabel("")).toBe("Try that step again");
  });
  it("stage labels display by key, identical to the server words", () => {
    for (const op of Object.keys(OPERATION_STAGES) as (keyof typeof OPERATION_STAGES)[]) {
      const labels = buildStages(op, { completed: [] }).map((s) => s.label);
      expect(labels).toEqual(OPERATION_STAGES[op].map((k) => STAGE_LABELS[op][k]));
    }
  });
  it("numberWord gives words in English, digits otherwise", () => {
    expect(numberWord(90)).toBe("ninety");
    expect(numberWord(90, { cases: "cap" })).toBe("Ninety");
    expect(numberWord(1, { cases: "upper" })).toBe("ONE");
    expect(numberWord(15)).toBe("fifteen");
    expect(numberWord(11, { max: 10 })).toBe("11");
    expect(numberWord(90, { lang: "ar" })).toBe("90");
  });
});
