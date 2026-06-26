import LegalPage from "./LegalPage";
import usePageMeta from "@/hooks/usePageMeta";

const Terms = () => {
  usePageMeta({
    title: "Aura — Terms",
    description: "Aura terms of service: how we license the platform, what you own, acceptable use, AI-generated content disclaimers, and account termination.",
    path: "/terms",
  });
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 2026"
      sections={[
        { title: "Who operates Aura", body: "Aura is a strategic intelligence service for senior professionals, operated by Mohammad Mahafdhah, an individual based in Riyadh, Saudi Arabia. It is currently in private, invitation-only beta. By using Aura, you agree to these terms." },
        { title: "Who can use it", body: "Aura is available to invited users who are at least 18 years old. Access is personal to you; please don't share your account or invitation without our agreement." },
        { title: "A beta service, provided as is", body: "Aura is in active development. Features may change, pause, or be withdrawn, and we don't yet offer an uptime or availability guarantee. We provide the service \"as is,\" while making reasonable efforts to keep it secure and reliable." },
        { title: "Your account", body: "You're responsible for keeping your login credentials confidential and for activity under your account. Tell us promptly at support@aura-intel.org if you suspect unauthorized use." },
        { title: "Your content, and the licence you give us", body: "You own everything you capture, teach, and create in Aura. We don't claim ownership of it.\n\nTo run the service for you, you grant Aura a limited licence to store and process that content — for example, to detect signals, learn your voice, and prepare drafts. This licence exists only to deliver the service to you, and nothing is published in your name without your explicit approval." },
        { title: "Acceptable use", body: "Please use Aura lawfully and in good faith. Don't use it to break the law, infringe others' rights, attempt to access other members' data, scrape or resell the service, or interfere with how it runs." },
        { title: "AI-assisted output, and no professional advice", body: "Aura's drafts, signals, and insights are AI-assisted and built from what you capture. They can be incomplete or wrong, so review everything before you publish or act on it. Aura does not provide legal, financial, or other professional advice, and you are responsible for what you choose to publish." },
        { title: "Our intellectual property", body: "The Aura software, name, design, and the methodology behind the Imprint score and signal engine belong to us. These terms grant only the right to use the service while they are in effect; they transfer none of that to you." },
        { title: "Privacy", body: "How we handle your data is described in our Privacy Policy, which forms part of these terms." },
        { title: "Ending your use, and your data", body: "You may stop using Aura at any time, and either side may end your access. After your account ends, we keep your data for up to 30 days and then delete it, unless the law requires otherwise." },
        { title: "Limitation of liability", body: "To the maximum extent permitted by law, Aura is provided without warranties of any kind, and Aura and its operator are not liable for any indirect, incidental, special, or consequential damages arising from your use of the service." },
        { title: "Changes to these terms", body: "We may update these terms as Aura develops. When we make a material change, we'll update the date above and, where appropriate, notify you in the app." },
        { title: "Governing law", body: "These terms are governed by the laws of the Kingdom of Saudi Arabia, and any dispute will be subject to the jurisdiction of the Saudi courts." },
        { title: "Contact", body: "Mohammad Mahafdhah\nAura · Riyadh, Saudi Arabia\nsupport@aura-intel.org" },
      ]}
    />
  );
};

export default Terms;