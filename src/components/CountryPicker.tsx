import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

// ISO-3166 alpha-2 → { name, flag emoji }. Curated common list; extend freely.
export const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "YE", name: "Yemen", flag: "🇾🇪" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "SY", name: "Syria", flag: "🇸🇾" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶" },
  { code: "PS", name: "Palestine", flag: "🇵🇸" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "LY", name: "Libya", flag: "🇱🇾" },
  { code: "SD", name: "Sudan", flag: "🇸🇩" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "IR", name: "Iran", flag: "🇮🇷" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "IS", name: "Iceland", flag: "🇮🇸" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "CZ", name: "Czechia", flag: "🇨🇿" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰" },
  { code: "HU", name: "Hungary", flag: "🇭🇺" },
  { code: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬" },
  { code: "HR", name: "Croatia", flag: "🇭🇷" },
  { code: "RS", name: "Serbia", flag: "🇷🇸" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "PE", name: "Peru", flag: "🇵🇪" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹" },
];

export function flagFor(code?: string | null): string {
  if (!code) return "";
  const c = COUNTRIES.find((x) => x.code === code.toUpperCase());
  return c?.flag || "";
}

interface Props {
  value?: string | null;       // country_code
  onChange: (name: string | null, code: string | null) => void;
  label?: string;
  placeholder?: string;
  dir?: "ltr" | "rtl";
}

export default function CountryPicker({
  value,
  onChange,
  label = "Country",
  placeholder = "Search country…",
  dir,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => (value ? COUNTRIES.find((c) => c.code === value.toUpperCase()) || null : null),
    [value],
  );

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s),
    );
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const paper = "var(--paper, #FBF7EF)";
  const ink = "var(--ink, #1B1B1B)";
  const ink3 = "var(--ink-3, rgba(27,27,27,0.55))";
  const rule = "var(--rule, rgba(27,27,27,0.14))";
  const serif = "'Newsreader', Georgia, serif";
  const mono = "'IBM Plex Mono', ui-monospace, monospace";

  return (
    <div ref={wrapRef} dir={dir} style={{ position: "relative", width: "100%" }}>
      {label && (
        <label
          style={{
            display: "block",
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: ink3,
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          background: paper,
          border: `0.5px solid ${rule}`,
          borderRadius: 8,
          color: ink,
          fontFamily: serif,
          fontSize: 15,
          textAlign: dir === "rtl" ? "right" : "left",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {selected ? (
            <>
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{selected.flag}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selected.name}
              </span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
                aria-label="Clear country"
                style={{ marginInlineStart: 4, color: ink3, display: "inline-flex" }}
              >
                <X size={14} />
              </span>
            </>
          ) : (
            <span style={{ color: ink3 }}>Choose your country</span>
          )}
        </span>
        <ChevronDown size={16} style={{ color: ink3 }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 60,
            background: paper,
            border: `0.5px solid ${rule}`,
            borderRadius: 10,
            boxShadow: "0 20px 40px -18px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderBottom: `0.5px solid ${rule}`,
            }}
          >
            <Search size={14} style={{ color: ink3 }} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              dir={dir}
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: 0,
                fontFamily: serif,
                fontSize: 14,
                color: ink,
              }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {results.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: ink3, fontFamily: serif }}>
                No match.
              </div>
            ) : (
              results.map((c) => {
                const active = selected?.code === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      onChange(c.name, c.code);
                      setOpen(false);
                      setQ("");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: dir === "rtl" ? "right" : "left",
                      padding: "9px 12px",
                      background: active ? "rgba(0,0,0,0.04)" : "transparent",
                      border: 0,
                      cursor: "pointer",
                      fontFamily: serif,
                      fontSize: 14,
                      color: ink,
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 17 }}>{c.flag}</span>
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: ink3 }}>{c.code}</span>
                  </button>
                );
              })
            )}
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderTop: `0.5px solid ${rule}`,
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: ink3,
              background: "transparent",
            }}
          >
            {results.length} of {COUNTRIES.length}
          </div>
        </div>
      )}
    </div>
  );
}