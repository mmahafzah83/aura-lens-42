interface LinkedInPostStepsProps {
  withImage?: boolean;
  variant?: "light" | "dark";
  lang?: "en" | "ar";
  shareLabel?: string;
  downloadLabel?: string;
}

export default function LinkedInPostSteps({
  withImage = false,
  variant = "light",
  lang = "en",
  shareLabel,
  downloadLabel,
}: LinkedInPostStepsProps) {
  const isRTL = lang === "ar";
  const isDark = variant === "dark";

  const textMuted = isDark ? "rgba(240,237,232,.55)" : "hsl(var(--muted-foreground))";
  const textSoft = isDark ? "rgba(240,237,232,.7)" : "hsl(var(--muted-foreground))";
  const borderColor = isDark ? "rgba(212,176,86,.25)" : "var(--color-border, rgba(0,0,0,0.1))";
  const numberBg = isDark ? "rgba(212,176,86,.12)" : "hsl(var(--muted-foreground) / 0.1)";
  const numberColor = isDark ? "#D4B056" : "hsl(var(--muted-foreground))";

  const share = shareLabel ?? (isRTL ? "شارك على LinkedIn" : withImage ? "Share on LinkedIn" : "Post on LinkedIn");
  const download = downloadLabel ?? (isRTL ? "PNG" : "Download PNG");

  const steps = withImage
    ? isRTL
      ? [
          `حمّل الصورة (${download}).`,
          `اضغط "${share}" — يُنسخ النص ويفتح LinkedIn.`,
          `في LinkedIn، اضغط "Start a post" والصق (⌘/Ctrl+V).`,
          `أرفق الصورة المحمّلة، ثم انشر.`,
        ]
      : [
          `Download the image (${download}).`,
          `Tap "${share}" — your caption copies and LinkedIn opens.`,
          `In LinkedIn, click "Start a post" and paste (⌘/Ctrl+V).`,
          `Attach the downloaded image, then post.`,
        ]
    : isRTL
      ? [
          `اضغط "${share}" — يُنسخ النص ويفتح LinkedIn.`,
          `اضغط "Start a post" والصق (⌘/Ctrl+V).`,
          `انشر.`,
        ]
      : [
          `Tap "${share}" — your text copies and LinkedIn opens.`,
          `Click "Start a post" and paste (⌘/Ctrl+V).`,
          `Post.`,
        ];

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: isDark ? "rgba(212,176,86,.03)" : "var(--bg-subtle, rgba(0,0,0,0.03))",
      }}
    >
      <ol
        style={{
          margin: 0,
          padding: 0,
          paddingInlineStart: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {steps.map((step, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 11,
              lineHeight: 1.5,
              color: textSoft,
            }}
          >
            <span
              style={{
                flex: "none",
                width: 16,
                height: 16,
                borderRadius: 999,
                background: numberBg,
                color: numberColor,
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <span style={{ color: textMuted }}>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
