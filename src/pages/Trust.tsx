import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";

const Trust = () => {
  usePageMeta({
    title: "Aura — Security & Trust",
    description: "How Aura isolates, encrypts, and protects your data — including the one honest limit we won't hide.",
    path: "/trust",
  });
  return (
  <LegalPage
    title="Security & Trust"
    updated="June 2026"
    sections={[
      { title: "Your space is yours alone", body: "Every record you create is locked to your account and isolated at the database level. Another member cannot reach it. That is enforced in the system, not just promised in a policy." },
      { title: "What we can — and cannot — see", body: "There is no screen, report, or export anywhere in Aura that shows your captures, drafts, or content to us. Running the service means database access exists, as it does for the operator of any tool you use — but Aura is built with no path that surfaces your content to us, and we do not go looking." },
      { title: "Encryption", body: "Your data is encrypted in transit and at rest, and stored on established cloud infrastructure — Supabase, running on AWS, provided through Lovable Cloud." },
      { title: "The one honest limit", body: "Aura is not end-to-end encrypted, and we will not pretend it is. To turn your reading into signals and posts, the system has to read your content. Rather than making it unreadable — which would break the product — we protect it with strict per-account isolation and by exposing it through no feature at all." },
      { title: "The providers behind Aura", body: "A small set of established providers power the intelligence (Anthropic, OpenAI, Google, Perplexity), storage (Supabase), and email (Resend). Each operates under terms that, by default, do not use your data to train their models. The full list is in our Privacy Policy." },
      { title: "What Aura learns", body: "Your patterns — the themes you return to and the way you sound — so your output gets sharper. Aura never uses your private content to train anything for anyone else." },
      { title: "Your control", body: "Export or delete your data at any time; shared, de-identified learning is opt-in and reversible in Settings; and if you delete your account, everything is permanently removed after 30 days. Reach us at support@aura-intel.org." },
    ]}
  />
  );
};

export default Trust;
