/**
 * Recover the member's own post history from their official LinkedIn export.
 *
 * LinkedIn's analytics scope returns metrics and post URLs but never the post
 * text, so the only complete source of a member's own writing is the data
 * export they can request from their own account. The zip is unpacked in the
 * browser; only the parsed rows are sent to the server.
 */
import React, { useCallback, useMemo, useState } from "react";
import JSZip from "jszip";
import Papa from "papaparse";
import { ArrowLeft, FileUp, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { AR_TEXT } from "@/lib/arDisplay";

/** Known failures carry a key so the screen can say them in its own language. */
class ImportError extends Error {
  constructor(public key: string, message: string) { super(message); }
}

const EXPORT_URL = "https://www.linkedin.com/mypreferences/d/download-my-data";

interface ParsedRow { text: string; url: string | null; date: string | null }

interface ImportSummary {
  summary: string;
  rows_in_file: number;
  matched: number;
  filled: number;
  added: number;
  already_had_text: number;
  voice?: { languages?: Record<string, { posts: number; examples: number }> } | null;
}

/** Column names differ slightly between export vintages. */
function pick(row: Record<string, string>, names: string[]): string | null {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n);
    if (key && row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return null;
}

function rowsFromCsv(csv: string): ParsedRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const out: ParsedRow[] = [];
  for (const row of parsed.data ?? []) {
    if (!row || typeof row !== "object") continue;
    const text = pick(row, ["sharecommentary", "commentary", "share commentary"]);
    if (!text) continue;
    out.push({
      text,
      url: pick(row, ["sharelink", "share link", "url", "postlink"]),
      date: pick(row, ["date", "created date", "shared date"]),
    });
  }
  return out;
}

async function rowsFromFile(file: File): Promise<ParsedRow[]> {
  if (/\.csv$/i.test(file.name)) return rowsFromCsv(await file.text());
  const zip = await JSZip.loadAsync(file);
  const entry = Object.values(zip.files).find(
    (f) => !f.dir && /shares?\.csv$/i.test(f.name),
  );
  if (!entry) {
    throw new ImportError("liImp.noShares", "That zip has no Shares.csv in it. Make sure you selected Posts when requesting the export.");
  }
  return rowsFromCsv(await entry.async("string"));
}

export default function LinkedInImport() {
  const { t, lang } = useLanguage();
  const ar = lang === "ar";
  const arT = ar ? AR_TEXT : {};
  /* Latin names keep their order inside Arabic sentences. */
  const iso = (k: string) => (ar ? t(k).replace(/(KnownBy|LinkedIn|Shares\.csv)/g, "\u2066$1\u2069") : t(k));
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true); setError(null); setResult(null);
    try {
      setStage(t("liImp.reading"));
      const rows = await rowsFromFile(file);
      if (!rows.length) throw new ImportError("liImp.noPosts", "No posts found in that file.");

      setStage(t("liImp.matching", { n: rows.length }));
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new ImportError("liImp.signIn", "Sign in again, then upload.");

      const { data, error: fnError } = await supabase.functions.invoke("import-linkedin-export", {
        body: { rows },
      });
      if (fnError) throw new Error(fnError.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as ImportSummary);
    } catch (e) {
      /* English keeps the raw message; Arabic never shows English pass-through text. */
      if (!ar) setError((e as Error).message);
      else setError(e instanceof ImportError ? t(e.key) : t("liImp.failed"));
    } finally {
      setBusy(false);
      setStage("");
    }
  }, [ar, t]);

  const voiceLine = useMemo(() => {
    const langs = result?.voice?.languages ?? {};
    const parts = Object.entries(langs).map(([l, v]) =>
      ar
        ? t(l === "ar" ? "liImp.voiceAr" : "liImp.voiceEn", { posts: v.posts, examples: v.examples })
        : `${l === "ar" ? "Arabic" : "English"}: ${v.posts} posts read, ${v.examples} examples kept`,
    );
    return parts.length ? parts.join(" · ") : null;
  }, [result, ar, t]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 96px", display: "grid", gap: 28 }}>
      <Link to="/settings" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
        <ArrowLeft size={14} style={ar ? { transform: "scaleX(-1)" } : undefined} /> <span style={arT}>{t("liImp.settings")}</span>
      </Link>

      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ fontSize: 28, lineHeight: ar ? 1.4 : 1.2, color: "var(--text-primary)", margin: 0, ...arT, ...(ar ? { lineHeight: 1.4 } : {}) }}>
          {iso("liImp.title")}
        </h1>
        {ar ? (
          <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, ...arT }}>
            {iso("liImp.p1")}<a href={EXPORT_URL} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>{t("liImp.link")}</a>{t("liImp.p2")}<strong>{t("liImp.bold")}</strong>{t("liImp.p3")}<code dir="ltr">Shares.csv</code>{iso("liImp.p4")}
          </p>
        ) : (
        <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-secondary)", margin: 0 }}>
          LinkedIn gives us your post metrics but never the words. Ask LinkedIn for a copy of your
          data — <a href={EXPORT_URL} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>Settings → Data privacy → Get a copy of your data</a>,
          tick <strong>Posts</strong>, and request the archive. The email usually arrives within a few
          minutes. Upload the zip here, or just the <code>Shares.csv</code> inside it, and we will
          match every post to what we already track and fill in the missing text.
        </p>
        )}
      </header>

      <label
        style={{
          border: "1px dashed var(--border-default)", borderRadius: 14, padding: "36px 20px",
          display: "grid", justifyItems: "center", gap: 10, cursor: busy ? "wait" : "pointer",
          background: "var(--surface-card)",
        }}
      >
        <input
          type="file"
          accept=".zip,.csv"
          disabled={busy}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleFile(f);
          }}
        />
        {busy
          ? <Loader2 size={22} className="animate-spin" color="var(--brand)" />
          : <FileUp size={22} color="var(--text-muted)" />}
        <span style={{ fontSize: 14, color: "var(--text-primary)", ...arT }}>
          {busy ? stage : t("liImp.choose")}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", ...arT }}>
          {t("liImp.privacy")}
        </span>
      </label>

      {error && (
        <p style={{ fontSize: 14, color: "var(--error)", margin: 0, ...arT }}>{error}</p>
      )}

      {result && (
        <section style={{ display: "grid", gap: 8, borderRadius: 14, padding: 20, background: "var(--surface-card)", border: "1px solid var(--border-default)" }}>
          <h2 style={{ fontSize: 17, margin: 0, color: "var(--text-primary)", ...arT }}>
            {ar ? t("liImp.summary", { matched: result.matched, filled: result.filled, added: result.added }) : result.summary}
          </h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0, ...arT }}>
            {t("liImp.counts", { a: result.rows_in_file, b: result.already_had_text })}
          </p>
          {voiceLine && (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0, ...arT }}>
              {ar ? t("liImp.voice", { voiceLine }) : <>Your voice profile has been retrained — {voiceLine}. The next deck you generate writes
              from it.</>}
            </p>
          )}
          <Link to="/carousel-studio" style={{ fontSize: 13.5, color: "var(--brand)", ...arT }}>
            {t("liImp.deck")}
          </Link>
        </section>
      )}
    </main>
  );
}