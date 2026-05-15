import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";

const Privacy = () => {
  usePageMeta({
    title: "Privacy Policy — Aura",
    description: "How Aura collects, stores, and protects your data. We never sell your data and never train AI models on your content.",
    path: "/privacy",
  });
  return (
  <LegalPage
    title="Privacy Policy"
    updated="May 2026"
    sections={[
      { title: "What We Collect", body: "Account information, content you capture and generate, usage analytics." },
      { title: "How We Use Your Data", body: "To provide the Aura service, detect signals, generate content, calculate your authority score." },
      { title: "Data Storage", body: "Stored securely on Supabase (hosted on AWS). Industry-standard encryption." },
      { title: "Data Sharing", body: "We do not sell your data. We do not share with third parties except as required by law." },
      { title: "AI Processing", body: "Captures processed by Google Gemini AI per-request. We do not train AI models on your data." },
      { title: "Your Rights", body: "Request a copy of your data, request deletion, or opt out of AI processing by contacting us." },
      { title: "Contact", body: "mohammad.mahafdhah@aura-intel.org" },
    ]}
  />
);
};

export default Privacy;