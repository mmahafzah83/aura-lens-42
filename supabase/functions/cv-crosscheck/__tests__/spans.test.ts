import { describe, it, expect } from "vitest";
import { spanIsWrong } from "../spans";

describe("spanIsWrong", () => {
  it("English: right and wrong spans", () => {
    expect(spanIsWrong("You led operations from 2012 to 2020, an 8-year run.")).toBe(false);
    expect(spanIsWrong("You led operations from 2012 to 2020, a 10-year run.")).toBe(true);
  });
  it("Arabic: right and wrong spans", () => {
    expect(spanIsWrong("قدت العمليات من 2012 إلى 2020، أي 8 سنوات.")).toBe(false);
    expect(spanIsWrong("قدت العمليات من 2012 إلى 2020، أي 10 سنوات.")).toBe(true);
    expect(spanIsWrong("بين 2015 و 2022 أمضيت 7 أعوام في الشركة.")).toBe(false);
    expect(spanIsWrong("بين 2015 و 2022 أمضيت 9 عامًا في الشركة.")).toBe(true);
  });
  it("Arabic: one year cited is not judged", () => {
    expect(spanIsWrong("منذ 2015 أمضيت 12 سنة في القطاع.")).toBe(false);
  });
});
