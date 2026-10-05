import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageMeta } from "@/hooks/usePageMeta";
import PublicMasthead from "@/components/PublicMasthead";
import PublicFooter from "@/components/PublicFooter";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePublicText } from "@/hooks/usePublicText";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* value = what the server receives (English, unchanged); key = the visible label. */
const TOPICS: { value: string; key: string }[] = [
  { value: "Getting access", key: "contact.topic.access" },
  { value: "Something is broken", key: "contact.topic.broken" },
  { value: "Billing", key: "contact.topic.billing" },
  { value: "Partnership", key: "contact.topic.partner" },
  { value: "Something else", key: "contact.topic.else" },
];

type Status = "idle" | "sending" | "sent" | "error";

const Contact = () => {
  const { t } = useLanguage();
  const { ar, T } = usePublicText();
  usePageMeta({
    title: t("contact.metaTitle"),
    description: t("contact.metaDesc"),
    path: "/contact",
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(TOPICS[0].value);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("idle");

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "contact.err.nameReq";
    else if (name.trim().length > 120) next.name = "contact.err.nameLong";
    if (!email.trim()) next.email = "contact.err.emailReq";
    else if (!EMAIL_RE.test(email.trim())) next.email = "contact.err.emailBad";
    if (!message.trim()) next.message = "contact.err.msgReq";
    else if (message.trim().length < 10) next.message = "contact.err.msgShort";
    else if (message.trim().length > 5000) next.message = "contact.err.msgLong";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!validate()) return;
    setStatus("sending");
    try {
      const { error } = await supabase.functions.invoke("contact-message", {
        body: {
          name: name.trim(),
          email: email.trim(),
          topic,
          message: message.trim(),
          company,
        },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      console.error("contact-message failed:", err);
      setStatus("error");
    }
  };

  return (
    <div className={ar ? "ct ct-ar" : "ct"}>
      <style>{CT_CSS}</style>
      <PublicMasthead />

      <main className="ct-main">
        <div className="ct-wrap">
          <span className="ct-eyebrow">{T("contact.eyebrow")}</span>
          <h1 className="ct-h1">{T("contact.h1")}</h1>
          <p className="ct-intro">
            {T("contact.intro")}
          </p>

          <div className="ct-card">
            {status === "sent" ? (
              <div className="ct-done">
                <p className="ct-done-t">{T("contact.sent")}</p>
                <Link className="ct-back" to="/">{T("pubpg.backHomePage")}</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="ct-field">
                  <label className="ct-label" htmlFor="ct-name">{T("contact.name")}</label>
                  <input
                    id="ct-name"
                    className="ct-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    dir={ar ? "auto" : undefined}
                  />
                  {errors.name && <p className="ct-err">{T(errors.name)}</p>}
                </div>

                <div className="ct-field">
                  <label className="ct-label" htmlFor="ct-email">{T("contact.email")}</label>
                  <input
                    id="ct-email"
                    className="ct-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    dir={ar ? "ltr" : undefined}
                  />
                  {errors.email && <p className="ct-err">{T(errors.email)}</p>}
                </div>

                <div className="ct-field">
                  <label className="ct-label" htmlFor="ct-topic">{T("contact.topic")}</label>
                  <select
                    id="ct-topic"
                    className="ct-input"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  >
                    {TOPICS.map((o) => <option key={o.value} value={o.value}>{T(o.key)}</option>)}
                  </select>
                </div>

                <div className="ct-field">
                  <label className="ct-label" htmlFor="ct-message">{T("contact.message")}</label>
                  <textarea
                    id="ct-message"
                    className="ct-input ct-area"
                    rows={6}
                    dir={ar ? "auto" : undefined}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  {errors.message && <p className="ct-err">{T(errors.message)}</p>}
                </div>

                {/* honeypot — hidden from people, visible to bots */}
                <div className="ct-hp" aria-hidden="true">
                  <label htmlFor="ct-company">Company</label>
                  <input
                    id="ct-company"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                <button className="ct-pill" type="submit" disabled={status === "sending"}>
                  {status === "sending" ? T("contact.sending") : T("contact.send")}
                </button>

                {status === "error" && (
                  <p className="ct-err ct-err-block">
                    {T("contact.failPre")}
                    <a href="mailto:support@aura-intel.org"><bdi dir="ltr">support@aura-intel.org</bdi></a>{T("contact.failPost")}
                  </p>
                )}
              </form>
            )}
          </div>

          <p className="ct-alt">
            {T("contact.prefer")} <a href="mailto:support@aura-intel.org"><bdi dir="ltr">support@aura-intel.org</bdi></a>{" "}
            <bdi dir="ltr" className="ct-plain">support@aura-intel.org</bdi>
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default Contact;

const CT_CSS = `
.ct{
  --page:#F2F5F9; --card:#FFFFFF; --rule:#E2E7EE;
  --ink:#0F1519; --soft:#5B6673; --faint:#98A2AE; --act:#0670C4; --bad:#C0392B;
  --disp:'Inter',ui-sans-serif,system-ui,sans-serif;
  --body:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  min-height:100vh; display:flex; flex-direction:column;
  background:var(--page); color:var(--ink); font-family:var(--body);
}
.ct *,.ct *::before,.ct *::after{box-sizing:border-box;}
.ct :focus-visible{outline:2px solid var(--act);outline-offset:2px;border-radius:6px;}
.ct-main{flex:1;padding:clamp(40px,7vw,84px) clamp(20px,4.5vw,56px) 72px;}
.ct-wrap{max-width:620px;margin:0 auto;}
.ct-eyebrow{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--faint);margin-bottom:16px;}
.ct-h1{font-family:var(--disp);font-weight:700;font-size:clamp(34px,6vw,50px);
  line-height:1.08;letter-spacing:-0.02em;color:var(--ink);margin:0 0 16px;}
.ct-intro{font-size:17px;line-height:1.7;color:var(--soft);margin:0 0 32px;}
.ct-card{background:var(--card);border:1px solid var(--rule);border-radius:16px;
  padding:clamp(20px,4vw,32px);}
.ct-field{margin-bottom:18px;}
.ct-label{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--soft);margin-bottom:8px;}
.ct-input{width:100%;max-width:100%;background:#FFFFFF;border:1px solid var(--rule);
  border-radius:10px;padding:12px 14px;font-family:var(--body);font-size:15px;
  line-height:1.5;color:var(--ink);}
.ct-input:focus{border-color:var(--act);outline:none;}
.ct-area{resize:vertical;min-height:132px;}
.ct-err{color:var(--bad);font-size:12.5px;line-height:1.5;margin:7px 0 0;}
.ct-err-block{margin-top:14px;}
.ct-err-block a{color:var(--bad);text-decoration:underline;}
.ct-hp{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);
  clip-path:inset(50%);white-space:nowrap;}
.ct-pill{width:100%;height:48px;border:0;border-radius:999px;background:var(--ink);
  color:#FFFFFF;font-family:var(--body);font-size:15px;font-weight:600;cursor:pointer;
  margin-top:6px;transition:opacity .2s ease;}
.ct-pill:hover{opacity:.88;}
.ct-pill:disabled{opacity:.5;cursor:default;}
.ct-done{padding:8px 0;}
.ct-done-t{font-family:var(--disp);font-weight:700;font-size:26px;line-height:1.25;color:var(--ink);margin:0 0 16px;}
.ct-back{font-size:14px;color:var(--act);text-decoration:none;}
.ct-back:hover{text-decoration:underline;}
.ct-alt{font-size:12px;line-height:1.6;color:var(--faint);margin:16px 0 0;word-break:break-word;}
.ct-alt a{color:var(--faint);text-decoration:underline;}
.ct-plain{user-select:all;}
@media (prefers-reduced-motion:reduce){ .ct *{transition:none !important;} }
.ct-ar{font-family:var(--font-arabic);}
.ct-ar .ct-eyebrow,.ct-ar .ct-label{font-family:var(--font-arabic);letter-spacing:0;text-transform:none;font-size:13px;line-height:1.7;}
.ct-ar .ct-h1,.ct-ar .ct-done-t{font-family:var(--font-arabic);letter-spacing:0;line-height:1.7;}
.ct-ar .ct-intro{line-height:1.9;}
.ct-ar .ct-input,.ct-ar .ct-pill{font-family:var(--font-arabic);}
.ct-ar input[type=email]{font-family:var(--body);text-align:left;}
.ct-ar .ct-err,.ct-ar .ct-alt,.ct-ar .ct-back{line-height:1.9;}
`;
