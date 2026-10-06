import ReportDocument from "@/components/ReportDocument";
const long = (ar: boolean, n: number) => (ar ? "هذه جملة طويلة عن عملك وما يظهر منه في ملفك وما لا يظهر. " : "This is a long sentence about your work and what shows of it on your profile and what does not. ").repeat(n);
function cv(ar: boolean) {
  const f = (i: number) => ({ what: (ar ? "سيرتك تقول شيئاً وملفك يقول غيره " : "Your CV says one thing and your profile says another ") + i, what_you_lose: long(ar, 3), rewrite: long(ar, 2), why_it_matters: long(ar, 2), do_this: long(ar, 1), do_first: i === 1, evidence: { cv_line: "x", profile_line: "y" }, aura_can: "suggest_headline" });
  return { lang: ar ? "ar" : "en", headline_finding: long(ar, 2), findings: [1, 2, 3, 4].map(f), cv_is_behind: [long(ar, 1), long(ar, 1)], defensibility: [long(ar, 1)], headline_suggestion: long(ar, 1), reading_the_shape: long(ar, 2), profile_vs_voice: long(ar, 2), the_hard_truth: long(ar, 1), recommendations: [{ action: long(ar, 1), why_now: long(ar, 1), aura_can: "capture_evidence" }], peer_comparison: long(ar, 2) };
}
export default function B10Harness() {
  const ar = new URLSearchParams(location.search).get("lang") === "ar";
  const data: any = { user_id: "h", generated_at: "2026-10-05T12:00:00Z", profile: { first_name: ar ? "سلمان" : "Sam", last_name: "", level: null }, positioning: null, profile_intelligence: null, score: null, brand_position: null, capabilities: null, market_mirror: null, territories: null, footprint: null, content: null, voice: null, cv_crosscheck: cv(ar) };
  return <ReportDocument data={data} lang={ar ? "ar" : "en"} />;
}
