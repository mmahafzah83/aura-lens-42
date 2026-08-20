import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WorkingPanel } from "@/components/ui/WorkingPanel";
import { buildStages } from "@/lib/operationStages";

/**
 * The one place a member adds a CV.
 *
 * SIGNED IN — the file is stored. Every stored path here sets
 * document_type='cv' and cv_label='latest'. A CV without that label is
 * invisible to cv-crosscheck, so the two values are written inline, in one
 * insert, and nowhere else.
 *
 * ANONYMOUS — nothing is stored. The bytes go straight to cv-crosscheck,
 * which extracts the text in memory, compares, and returns. No storage
 * object, no `documents` row, no `document_chunks` row. There is no wall:
 * an anonymous visitor gets the whole comparison with no account.
 */

export const CV_PURPOSES = [
  { value: "next_role", label: "A next role" },
  { value: "board_seat", label: "A board seat" },
  { value: "partner_track", label: "Partner track" },
  { value: "client_credibility", label: "Client credibility" },
  { value: "unknown", label: "Not sure yet" },
] as const;

const PURPOSE_KEY = "aura_cv_purpose";

export const readCvPurpose = (): string => {
  try {
    const v = localStorage.getItem(PURPOSE_KEY);
    return CV_PURPOSES.some((p) => p.value === v) ? (v as string) : "unknown";
  } catch { return "unknown"; }
};

const ACCEPTED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const INK = "#0F1519";
const MUTED = "#5B6673";
const RULE = "#E2E7EE";
const BLUE = "#0670C4";

const primaryStyle: React.CSSProperties = {
  inlineSize: "100%", minBlockSize: 48, background: BLUE, color: "#FFFFFF",
  border: 0, borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-body)", paddingInline: 18,
};

const ghostStyle: React.CSSProperties = {
  minBlockSize: 44, background: "transparent", color: BLUE, border: 0,
  fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0,
};

const helpStyle: React.CSSProperties = { fontSize: 12.5, color: MUTED, marginBlockStart: 8, lineHeight: 1.55 };

type Failure =
  | { kind: "no_cv" }
  | { kind: "no_snapshot" }
  | { kind: "unparseable" }
  | { kind: "server" };

const FAILURE_TEXT: Record<Failure["kind"], string> = {
  no_cv: "Aura hasn't got a CV to read yet.",
  no_snapshot: "Aura needs to read your profile first. Nothing you've added is lost.",
  unparseable: "Aura couldn't finish the comparison this time. Your CV is saved — try again.",
  server: "Something went wrong on our side. Your CV is saved.",
};

interface Props {
  userId: string | null;
  /** Anonymous run: the token the transient comparison is attributed to. */
  anonToken?: string | null;
  onUploaded?: (documentId: string) => void;
  onCrosscheck?: (crosscheck: unknown) => void;
  /** Anything the CV gave us that can pre-fill the account form. */
  onCvContact?: (contact: { email?: string; name?: string }) => void;
  /** Hide the purpose question where it does not belong (Settings shows it too). */
  showPurpose?: boolean;
}

export default function CvUploadControl({
  userId, anonToken, onUploaded, onCrosscheck, onCvContact, showPurpose = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [purpose, setPurpose] = useState<string>(readCvPurpose);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [comparing, setComparing] = useState(false);
  /* A run boundary is an event. Every comparison gets its own id, so the bar
     and the counter start from nothing rather than from the last run. */
  const [runId, setRunId] = useState(0);

  useEffect(() => { try { localStorage.setItem(PURPOSE_KEY, purpose); } catch { /* ignore */ } }, [purpose]);

  /* Already on file? Show the accepted state rather than an empty control. */
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data } = await (supabase.from("documents") as any)
        .select("filename")
        .eq("user_id", userId)
        .eq("document_type", "cv")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive && data?.filename) setFileName(data.filename as string);
    })();
    return () => { alive = false; };
  }, [userId]);

  const runCrosscheck = useCallback(async () => {
    setFailure(null);
    setRunId((n) => n + 1);
    setComparing(true);
    try {
      const { data, error } = await supabase.functions.invoke("cv-crosscheck", {
        body: { purpose },
      });
      if (error) { setFailure({ kind: "server" }); return; }
      const res = data as { ok?: boolean; crosscheck?: unknown; reason?: string } | null;
      if (res?.crosscheck) { onCrosscheck?.(res.crosscheck); return; }
      const reason = res?.reason;
      if (reason === "no_cv") setFailure({ kind: "no_cv" });
      else if (reason === "no_snapshot") setFailure({ kind: "no_snapshot" });
      else if (reason === "unparseable") setFailure({ kind: "unparseable" });
      else setFailure({ kind: "server" });
    } catch {
      setFailure({ kind: "server" });
    } finally {
      setComparing(false);
    }
  }, [purpose, onCrosscheck]);

  const pick = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  /* ── the anonymous path: read, compare, discard ──────────────────────
     The bytes never touch storage and no `documents` row is created. They
     are base64'd in the tab, posted once to cv-crosscheck, extracted in
     memory there, and dropped when the response returns. */
  const toBase64 = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  };

  const transientCompare = async (file: File) => {
    if (!anonToken) { setUploadError("Aura needs to read your profile first."); return; }
    setUploadError(null);
    setFailure(null);
    /* The accepted-file row must be on screen for the whole wait, not after it. */
    setFileName(file.name);
    setBusy(true);
    setComparing(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = toBase64(buf);
      /* Best-effort contact pull for the account form. Held in this tab only. */
      try {
        const raw = new TextDecoder("latin1").decode(new Uint8Array(buf).subarray(0, 400000));
        const hit = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        if (hit) onCvContact?.({ email: hit[0] });
      } catch { /* nothing lost if the pull fails */ }

      /* `cvText` is sent when the file is already text; otherwise the bytes
         are extracted in memory server-side and never written down. */
      const isPlainText = file.type.startsWith("text/");
      const cvText = isPlainText ? new TextDecoder().decode(buf) : undefined;

      const { data, error } = await supabase.functions.invoke("cv-crosscheck", {
        body: {
          anon_token: anonToken,
          purpose,
          ...(cvText ? { cvText } : { cv_file: { mime: file.type, name: file.name, base64 } }),
        },
      });
      if (error) { setFailure({ kind: "server" }); return; }
      const res = data as { ok?: boolean; crosscheck?: unknown; reason?: string } | null;
      if (res?.crosscheck) {
        onCrosscheck?.(res.crosscheck);
        return;
      }
      const reason = res?.reason;
      if (reason === "no_cv") setFailure({ kind: "no_cv" });
      else if (reason === "no_snapshot") setFailure({ kind: "no_snapshot" });
      else if (reason === "unparseable") setFailure({ kind: "unparseable" });
      else setFailure({ kind: "server" });
    } catch {
      setFailure({ kind: "server" });
    } finally {
      setComparing(false);
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const fileType = ACCEPTED[file.type] || (/\.docx?$/i.test(file.name) ? "docx" : /\.pdf$/i.test(file.name) ? "pdf" : null);
    if (!fileType) { setUploadError("That file type isn't supported. Add a PDF or a Word document."); return; }
    if (file.size > 50 * 1024 * 1024) { setUploadError("That file is over 50MB. Try a smaller one."); return; }
    /* No session: read it, compare it, throw it away. Never a login gate. */
    if (!userId) { await transientCompare(file); return; }
    setUploadError(null);
    setFailure(null);
    setBusy(true);
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) { setUploadError("The upload didn't finish. Nothing is lost — try again."); return; }

      const { data: doc, error: docErr } = await (supabase.from("documents") as any)
        .insert({
          user_id: userId,
          filename: file.name,
          file_url: path,
          file_type: fileType,
          file_size: file.size,
          status: "processing",
          document_type: "cv",
          cv_label: "latest",
        })
        .select("id")
        .single();
      if (docErr || !doc) { setUploadError("The upload didn't finish. Nothing is lost — try again."); return; }

      setFileName(file.name);
      onUploaded?.(doc.id as string);
      await supabase.functions.invoke("ingest-document", { body: { document_id: doc.id } });
      void runCrosscheck();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) await upload(f);
        }}
      />

      {fileName ? (
        <>
        <div style={{
          border: `1px solid ${RULE}`, borderRadius: 12, padding: 16,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ flex: "1 1 200px", minInlineSize: 0 }}>
            <div style={{ fontSize: 14, color: INK, overflowWrap: "anywhere" }}>{fileName}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBlockStart: 2 }}>
              {comparing
                ? "Aura is reading it against your profile."
                : userId
                  ? "On file. Only you can see it."
                  : "Read and discarded. Aura kept the comparison, not the file."}
            </div>
          </div>
          {!busy && !comparing ? (
            <button type="button" onClick={pick} style={{ ...ghostStyle, minInlineSize: 44 }}>Replace</button>
          ) : null}
        </div>
        {comparing ? (
          <div style={{ marginBlockStart: 12 }}>
            <WorkingPanel
              operation="cv_crosscheck"
              runId={runId}
              title="Reading it against your profile"
              stages={buildStages("cv_crosscheck", { completed: [], active: "extract" })}
            />
          </div>
        ) : null}
        </>
      ) : (
        <>
          <button type="button" onClick={pick} disabled={busy} style={{ ...primaryStyle, opacity: busy ? 0.7 : 1 }}>
            {busy ? (userId ? "Adding your CV…" : "Reading your CV…") : "Add your CV"}
          </button>
          <p style={helpStyle}>
            {userId
              ? "PDF or Word. Only you can see it."
              : "Aura reads your CV and discards it. It is never stored unless you save your report."}
          </p>
        </>
      )}

      {uploadError ? (
        <p style={{ ...helpStyle, color: "#C0392B" }}>{uploadError}</p>
      ) : null}

      {failure ? (
        <div style={{ marginBlockStart: 12 }}>
          <p style={{ fontSize: 14, color: INK, margin: 0, lineHeight: 1.55 }}>{FAILURE_TEXT[failure.kind]}</p>
          {failure.kind === "unparseable" || failure.kind === "server" ? (
            <button type="button" onClick={() => void runCrosscheck()} disabled={comparing} style={{ ...ghostStyle, marginBlockStart: 6 }}>
              {comparing ? "Trying again…" : "Try again"}
            </button>
          ) : null}
          {failure.kind === "no_cv" && fileName ? (
            <button type="button" onClick={pick} style={{ ...ghostStyle, marginBlockStart: 6 }}>Add your CV</button>
          ) : null}
        </div>
      ) : null}

      {showPurpose ? (
        <div style={{ marginBlockStart: 18 }}>
          <label htmlFor="cv-purpose" style={{ display: "block", fontSize: 14, fontWeight: 600, color: INK, marginBlockEnd: 6 }}>
            What is this CV for right now?
          </label>
          <select
            id="cv-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            style={{
              inlineSize: "100%", minBlockSize: 44, padding: "10px 12px", fontSize: 15,
              color: INK, background: "#FFFFFF", border: `1px solid ${RULE}`, borderRadius: 10,
              fontFamily: "var(--font-body)",
            }}
          >
            {CV_PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <p style={helpStyle}>Optional. It changes what Aura looks for.</p>
        </div>
      ) : null}
    </div>
  );
}
