import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";

const Privacy = () => {
  usePageMeta({
    title: "Aura — Privacy Policy",
    description: "How Aura collects, stores, and protects your data. We never sell your data and never train AI models on your content.",
    path: "/privacy",
  });
  return (
  <LegalPage
    title="Privacy Policy"
    updated="May 2026"
    sections={[
      { title: "What We Collect", body: "Account information, content you capture and generate, usage analytics." },
      { title: "How We Use Your Data", body: "Your captures, signals, and profile are processed by AI to provide intelligence and content:\n- Anthropic (Claude) — content generation, brand assessment, strategic analysis\n- Google (Gemini) — signal detection, trend analysis, daily briefings\n- OpenAI (GPT-4o) — content quality verification\n- Perplexity — market perspective research\n- Exa — article discovery for your reading list\n\nWe do not train AI models on your data. Content is processed per-request and not retained by providers beyond standard processing." },
      { title: "Data Storage", body: "Your data is stored securely on cloud infrastructure hosted on AWS, with industry-standard encryption at rest and in transit." },
      { title: "Data Sharing", body: "We do not sell your data. We do not share with third parties except as required by law." },
      { title: "AI Processing", body: "Captures processed by Google Gemini AI per-request. We do not train AI models on your data." },
      { title: "Your Rights", body: "Under the Saudi Personal Data Protection Law (PDPL) and applicable data protection regulations, you have the right to:\n- Request a copy of your personal data\n- Request correction of inaccurate data\n- Request deletion of your account and associated data\n- Withdraw consent for AI processing\n\nTo exercise these rights, contact: mohammad.mahafdhah@aura-intel.org" },
      { title: "Cookies", body: "Aura uses essential cookies for authentication and storing your theme preference. No advertising or tracking cookies are used." },
      { title: "Contact", body: "mohammad.mahafdhah@aura-intel.org" },
    ]}
  />
);
};

export default Privacy;