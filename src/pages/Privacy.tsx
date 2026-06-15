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
      { title: "Your Data, Your Control", body: "You own your data. Aura processes it to deliver intelligence and content services to you. Specifically:\n· Account data (name, email, professional details): used to personalize your experience\n· Captured content (URLs, text, voice recordings): analyzed by AI to detect strategic signals and generate content in your voice\n· LinkedIn post text (pasted by you): used for voice training and content generation — never shared externally\n· Generated content (posts, carousels, assessments): owned by you, stored for your access\n· Usage patterns: analyzed by Plausible analytics in aggregate — no personal identifiers tracked\n\nWe do not sell your data. We do not share your data with advertisers. We do not use your data to train AI models.\n\nTo request a copy of your data or to delete your account, contact support@aura-intel.org." },
      { title: "Saudi PDPL Compliance", body: "Aura processes personal data in accordance with the Saudi Personal Data Protection Law (نظام حماية البيانات الشخصية). As a user of Aura, you have the following rights under PDPL:\n· Right to be informed about the collection and processing of your personal data\n· Right to access your personal data held by Aura\n· Right to correct inaccurate personal data\n· Right to request destruction of your personal data when it is no longer needed\n· Right to withdraw consent for non-essential data processing\n\nTo exercise any of these rights, contact us at support@aura-intel.org. We will respond within 30 days.\n\nData Processing: Aura uses artificial intelligence services (provided by Anthropic, Google, and OpenAI) to analyze your captured content and generate strategic insights. Your content is processed to deliver the service and is not sold or shared with third parties for marketing purposes.\n\nData Hosting: Your data is stored securely on Supabase infrastructure. Transactional emails are sent via Resend. Analytics are collected via Plausible (privacy-focused, no personal data tracking)." },
      { title: "Third Parties & Subprocessors", body: "Aura shares only the data a feature needs with these third-party processors. All process data outside the GCC (primarily the US and EU); we cannot currently guarantee in-region processing.\n\nLovable — platform, database, auth, hosting, and the AI gateway that routes generation; sees account and content data; Lovable Cloud region (not GCC).\n\nGoogle (Gemini) — generates most content and powers Ask Aura, via the Lovable gateway; sees captures, profile, signals, draft text; US/global.\n\nOpenAI — embeddings (text-embedding-3-small) for search and memory; sees text of captures, documents, evidence, and chat; US.\n\nAnthropic — brand assessment and audit interpretation; sees assessment and audit inputs; US.\n\nPerplexity — industry trends, reading list, article discovery; sees topic and sector search terms; US.\n\nResend — sends transactional and brief emails; sees your name and email; US/EU.\n\nSupabase (via Lovable Cloud) — database and backend storing your account and content; Lovable Cloud region (not GCC)." },
      { title: "How AI providers process your information", body: "To turn what you capture into drafts, signals, and insights, Aura sends the relevant text to the third-party AI providers listed above. They process data outside the GCC, primarily in the US and EU. By using Aura you consent to this cross-border processing, which is necessary to provide the service. We send only what a feature needs, we do not sell your data, and nothing is published in your name without your explicit approval. We cannot currently guarantee that AI processing occurs inside the GCC." },
      { title: "Shared learning across members", body: "Aura improves by learning aggregated, de-identified patterns across members within a professional segment. This shared learning never includes your identity, your captured content, or your drafts, and no individual can be re-identified from it. Participation is opt-in: you choose it during onboarding and can withdraw at any time in Settings." },
      { title: "Data Storage", body: "Your data is stored securely on cloud infrastructure hosted on AWS, with industry-standard encryption at rest and in transit." },
      { title: "Data Sharing", body: "We do not sell your data. We do not share with third parties except as required by law." },
      { title: "AI Processing", body: "Captures processed by Google Gemini AI per-request. We do not train AI models on your data." },
      { title: "Your Rights", body: "Under the Saudi Personal Data Protection Law (PDPL) and applicable data protection regulations, you have the right to:\n- Request a copy of your personal data\n- Request correction of inaccurate data\n- Request deletion of your account and associated data\n- Withdraw consent for AI processing\n\nTo exercise these rights, contact: support@aura-intel.org" },
      { title: "Cookies", body: "Aura uses essential cookies for authentication and storing your theme preference. No advertising or tracking cookies are used." },
      { title: "Contact", body: "support@aura-intel.org" },
    ]}
  />
);
};

export default Privacy;
