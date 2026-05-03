import LegalPage from "./LegalPage";

const Terms = () => (
  <LegalPage
    title="Terms of Service"
    updated="May 2026"
    sections={[
      { title: "About Aura", body: "Aura is a strategic intelligence platform for senior professionals. By using Aura, you agree to these terms." },
      { title: "Your Account", body: "You are responsible for maintaining the confidentiality of your login credentials." },
      { title: "Your Content", body: "You retain ownership of all content you capture, generate, or publish through Aura. We do not claim ownership of your data." },
      { title: "Our Service", body: "We provide the service \"as is\" and will make reasonable efforts to maintain availability and security." },
      { title: "Acceptable Use", body: "You agree not to use Aura for any unlawful purpose." },
      { title: "Termination", body: "Either party may terminate at any time. Upon termination, your data will be retained for 30 days before permanent deletion." },
      { title: "Contact", body: "mohammad@aura-intel.org" },
    ]}
  />
);

export default Terms;