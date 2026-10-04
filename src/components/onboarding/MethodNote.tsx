import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OB } from "@/components/onboarding/tokens";

/**
 * The foot of the result. One tappable line — the methodology lecture lives
 * behind it, where the people who want it can find it and nobody else is
 * slowed down.
 */
const MethodNote = ({ onNight = false, inline = false }: { onNight?: boolean; inline?: boolean }) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const colour = onNight ? "rgba(255,255,255,0.86)" : OB.muted;
  if (inline) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "inherit", fontSize: "inherit", color: "inherit", textDecoration: "underline",
          }}
        >
          {t("method.toggle")}
        </button>
        {open ? (
          <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.6, color: colour }}>{t("method.body")}</p>
        ) : null}
      </>
    );
  }
  return (
    <div style={{ marginBlockStart: 18 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none", border: "none", padding: "6px 0", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: colour, textDecoration: "underline",
        }}
      >
        {t("method.toggle")}
      </button>
      {open ? (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.6, color: colour }}>{t("method.body")}</p>
      ) : null}
    </div>
  );
};

export default MethodNote;
