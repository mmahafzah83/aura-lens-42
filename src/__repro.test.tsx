// @vitest-environment jsdom
import { test } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import BrandPaperDocument from "@/components/report/BrandPaperDocument";
test("repro", () => {
  const paper: any = { primary_archetype:"The Operator", market_read:"x", positioning_statement:"y", topics:[], invest_next:[], content_pillars:[], growth_areas:[], profile:{} };
  try { renderToString(React.createElement(BrandPaperDocument as any, { paper, showClosing:false })); console.log("NO THROW"); }
  catch (e:any) { console.log("VERBATIM MESSAGE:", e.message); console.log(e.stack.split("\n").slice(0,8).join("\n")); }
});
