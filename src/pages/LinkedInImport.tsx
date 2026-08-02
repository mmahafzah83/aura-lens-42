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
    throw new Error("That zip has no Shares.csv in it. Make sure you selected Posts when requesting the export.");
  }
  return rowsFromCsv(await entry.async("string"));
}

export default function LinkedInImport() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true); setError(null); setResult(null);
    try {
      setStage("Reading your file");
      const rows = await rowsFromFile(file);
      if (!rows.length) throw new Error("No posts found in that file.");

      setStage(`Matching ${rows.length} posts`);
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error("Sign in again, then upload.");

      const { data, error: fnError } = await supabase.functions.invoke("import-linkedin-export", {
        body: { rows },
      });
      if (fnError) throw new Error(fnError.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as ImportSummary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage("");
    }
  }, []);

  const voiceLine = useMemo(() => {
    const langs = result?.voice?.languages ?? {};
    const parts = Object.entries(langs).map(
      ([lang, v]) => `${lang === "ar" ? "Arabic" : "English"}: ${v.posts} posts read, ${v.examples} examples kept`,
    );
    return parts.length ? parts.join(" · ") : null;
  }, [result]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 96px", display: "grid", gap: 28 }}>
      <Link to="/settings" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Settings
      </Link>

      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ fontSize: 28, lineHeight: 1.2, color: "var(--text-primary)", margin: 0 }}>
          Bring in your LinkedIn writing
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-secondary)", margin: 0 }}>
          LinkedIn gives us your post metrics but never the words. Ask LinkedIn for a copy of your
          data — <a href={EXPORT_URL} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>Settings → Data privacy → Get a copy of your data</a>,
          tick <strong>Posts</strong>, and request the archive. The email usually arrives within about
          ten minutes. Upload the zip here, or just the <code>Shares.csv</code> inside it, and we will
          match every post to what we already track and fill in the missing text.
        </p>
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
        <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
          {busy ? stage : "Choose your export zip or Shares.csv"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Your file is read in this browser. Only the post text and dates are sent.
        </span>
      </label>

      {error && (
        <p style={{ fontSize: 14, color: "var(--error)", margin: 0 }}>{error}</p>
      )}

      {result && (
        <section style={{ display: "grid", gap: 8, borderRadius: 14, padding: 20, background: "var(--surface-card)", border: "1px solid var(--border-default)" }}>
          <h2 style={{ fontSize: 17, margin: 0, color: "var(--text-primary)" }}>{result.summary}</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0 }}>
            {result.rows_in_file} posts in your file. {result.already_had_text} already had their text.
          </p>
          {voiceLine && (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0 }}>
              Your voice profile has been retrained — {voiceLine}. The next deck you generate writes
              from it.
            </p>
          )}
          <Link to="/carousel-studio" style={{ fontSize: 13.5, color: "var(--brand)" }}>
            Generate a deck in your voice
          </Link>
        </section>
      )}
    </main>
  );
}