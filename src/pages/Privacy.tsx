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
    updated="June 2026"
    sections={[
      { title: "In plain terms", body: "The short version, before the detail below.\n\n· Your captures, notes, and drafts are private to you. No other member can see them.\n· We don't sell your data, and we don't use your content to train AI models.\n· Nothing is ever published in your name without your explicit approval.\n· To run the service, Aura sends the text you capture to a small set of established AI providers, listed in full below.\n· You can export or delete your data at any time by writing to support@aura-intel.org." },
      { title: "Who we are", body: "Aura is operated by Mohammad Mahafdhah, an individual based in Riyadh, Saudi Arabia, who acts as the data controller for the service. Aura is currently in private beta and is not yet incorporated; we intend to register a company in Saudi Arabia as the product matures. You can reach us any time at support@aura-intel.org." },
      { title: "What we collect", body: "We collect only what the service needs.\n\n· When you request access: your name, email, professional role, and industry.\n· During onboarding: details about your firm, your focus, and your goals — from a short \"about me\" step or, if you choose, from your LinkedIn profile.\n· As you use Aura: the articles, links, and notes you capture; LinkedIn post text you paste in for voice training; the content Aura generates for you; and your settings.\n· Analytics: aggregate, cookieless usage data through Plausible — no personal identifiers and no cross-site tracking." },
      { title: "How we use your data", body: "We use your data only to deliver the service to you: to detect strategic signals from what you capture, to learn your writing voice, and to prepare drafts you can review.\n\nWe do not sell your data. We do not share it with advertisers. We do not use your content to train AI models for other users. And nothing reaches your audience unless you write it, approve it, and publish it yourself." },
      { title: "AI providers and subprocessors", body: "To provide the service, Aura shares only the data a given feature needs with a small set of established providers. All of them process data outside the GCC — primarily in the United States and the European Union — under business terms that, by default, do not use your data to train their models. By using Aura, you consent to this cross-border processing, which is necessary to run the service.\n\n· Lovable — platform, database, authentication, hosting, and the gateway that routes AI generation.\n· Supabase (on AWS, via Lovable Cloud) — stores your account and your content.\n· Google (Gemini) — generates most drafts and powers Ask Aura, through the Lovable gateway.\n· OpenAI — text embeddings (text-embedding-3-small) for search and memory.\n· Anthropic — brand assessment and audit interpretation.\n· Perplexity — industry trends, reading lists, and article discovery.\n· Resend — sends transactional and weekly-brief emails.\n· Plausible — privacy-focused, cookieless usage analytics.\n\nWe cannot currently guarantee that processing occurs inside the GCC." },
      { title: "Your content stays yours", body: "You own everything you capture and everything Aura generates for you. Your records are isolated to your account. LinkedIn text you paste is used only to shape your own voice and content, never shared externally — and nothing is published in your name without your explicit approval." },
      { title: "Where your data lives, and how it's protected", body: "Your data is stored in a Supabase (PostgreSQL) database hosted on Amazon Web Services, provisioned through Lovable Cloud. It is encrypted in transit and at rest, and every record is isolated to your account at the database level, so no other member can reach it.\n\nOne honest limit: Aura is not end-to-end encrypted, and we won't pretend it is. For the system to turn your reading into signals and drafts, it has to be able to read your content. We protect that content with strict per-account isolation and by building no feature that exposes it — rather than claiming an encryption we don't have." },
      { title: "How long we keep it", body: "We keep your data while your account is active. If you ask us to delete your account, we remove your data within 30 days; routine backups cycle out shortly after. You can request export or deletion at any time at support@aura-intel.org." },
      { title: "Your rights under the PDPL", body: "Aura processes personal data in line with Saudi Arabia's Personal Data Protection Law (PDPL). You have the right to:\n\n· be informed about how your data is collected and used;\n· access the personal data we hold about you;\n· correct data that is inaccurate;\n· request deletion of your data when it is no longer needed;\n· withdraw consent for non-essential processing.\n\nTo exercise any of these, contact support@aura-intel.org; we respond within 30 days. If you believe your data has been mishandled, you may also raise a complaint with the Saudi Data & AI Authority (SDAIA)." },
      { title: "Cookies", body: "Aura uses only essential cookies — to keep you signed in and to remember your theme preference. Our analytics (Plausible) are cookieless. We use no advertising or cross-site tracking cookies." },
      { title: "Changes to this policy", body: "As Aura grows, we may update this policy. When we make a material change, we'll update the date above and, where appropriate, let you know in the app." },
      { title: "Contact", body: "Mohammad Mahafdhah\nAura · Riyadh, Saudi Arabia\nsupport@aura-intel.org" },
    ]}
  />
);
};

export default Privacy;
