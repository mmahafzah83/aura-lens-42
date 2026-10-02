import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useTranslation, Trans } from "react-i18next";
import {
  AURA_WHATSAPP_NUMBER,
  WHATSAPP_PAIRING_ENABLED,
} from "@/config/whatsapp";

interface WhatsAppLink {
  phone_e164: string | null;
  pair_token: string | null;
  token_expires_at: string | null;
  status: string;
  bound_at: string | null;
}

/** Reveals only the last 2 digits: "+966 5• ••• ••82". */
function maskPhone(raw: string | null, hiddenLabel: string): string {
  if (!raw) return hiddenLabel;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 3) return "••";
  const last2 = digits.slice(-2);
  const head = digits.slice(0, Math.min(3, digits.length - 2));
  const middle = "•".repeat(Math.max(0, digits.length - 2 - head.length));
  const grouped = middle.replace(/(.{3})/g, "$1 ").trim();
  return `+${head} ${grouped}${grouped ? " " : ""}••${last2}`.replace(/\s+/g, " ").trim();
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function waUrl(token: string): string {
  const text = `Link my Aura account · ${token}`;
  return `https://wa.me/${AURA_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export default function WhatsAppPairingCard({ userId }: { userId: string | null }) {
  const { t } = useTranslation();
  const [link, setLink] = useState<WhatsAppLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isActive = link?.status === "active";

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await (supabase.from("whatsapp_links" as any) as any)
      .select("phone_e164,pair_token,token_expires_at,status,bound_at")
      .eq("user_id", userId)
      .maybeSingle();
    setLink((data as WhatsAppLink) || null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Realtime flip from pending → active, no polling.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`whatsapp_links_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_links", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as WhatsAppLink | undefined;
          if (row && (row as any).status) {
            setLink(row);
            if (row.status === "active") { setToken(null); setExpiresAt(null); }
          } else {
            load();
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  // Countdown ticker — only while a token is live.
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // QR of the same wa.me URL.
  useEffect(() => {
    if (!token || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, waUrl(token), {
      width: 148,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [token]);

  const mint = async (openTab: boolean) => {
    setMinting(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await (supabase.rpc as any)("whatsapp_mint_pair_token");
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.pair_token) { await load(); return; }
      setToken(row.pair_token);
      setExpiresAt(new Date(row.token_expires_at).getTime());
      setNow(Date.now());
      if (openTab) window.open(waUrl(row.pair_token), "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.error.whatsappStart"));
    } finally {
      setMinting(false);
    }
  };

  const disconnect = async () => {
    if (!userId) return;
    const { error: delErr } = await (supabase.from("whatsapp_links" as any) as any)
      .delete()
      .eq("user_id", userId);
    if (delErr) { setError(delErr.message); return; }
    setConfirmDisconnect(false);
    setToken(null);
    setExpiresAt(null);
    setLink(null);
  };

  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const expired = Boolean(expiresAt) && remaining <= 0;
  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  const bodyText = { color: "var(--ink)", fontSize: 14 } as const;
  const mutedText = { color: "var(--ink-4)", fontSize: 14 } as const;

  // STATE 1 — not configured
  if (!WHATSAPP_PAIRING_ENABLED) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{t("settings.whatsapp.notAvailable")}</div>
            <span
              style={{
                background: "var(--paper-2)",
                border: "0.5px solid var(--rule)",
                color: "var(--ink-3)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 999,
                padding: "2px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {t("settings.whatsapp.comingSoon")}
            </span>
          </div>
          <div className="mt-1 text-sm" style={mutedText}>
            {t("settings.whatsapp.notLive")}
          </div>
        </div>
        <Button variant="default" size="sm" disabled>{t("settings.whatsapp.connect")}</Button>
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm" style={mutedText}>{t("settings.whatsapp.checking")}</div>;
  }

  // STATE 3 — linked
  if (isActive) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {maskPhone(link?.phone_e164 ?? null, t("settings.whatsapp.numberHidden"))}
          </div>
          <div className="mt-1 text-sm" style={mutedText}>
            {link?.bound_at ? t("settings.whatsapp.connectedOn", { date: formatDate(link.bound_at) }) : t("settings.whatsapp.connected")}
          </div>
          <div
            className="mt-3 text-sm"
            style={{
              color: "var(--ink-2)",
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "10px 12px",
              lineHeight: 1.5,
            }}
          >
            <Trans i18nKey="settings.whatsapp.pin" components={{ 1: <br /> }} />
          </div>
          {error && <div className="mt-2 text-sm" style={{ color: "var(--error)" }}>{error}</div>}
        </div>
        {confirmDisconnect ? (
          <div style={{ maxWidth: 240 }}>
            <div className="text-sm" style={mutedText}>
              {t("settings.whatsapp.stopWarning")}
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="destructive" size="sm" onClick={disconnect}>{t("settings.whatsapp.disconnect")}</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(false)}>{t("settings.whatsapp.keep")}</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>{t("settings.whatsapp.disconnect")}</Button>
        )}
      </div>
    );
  }

  // STATE 2 — not linked
  return (
    <div>
      <div style={bodyText}>
        {t("settings.whatsapp.intro")}
      </div>

      <div className="mt-4">
        {expired ? (
          <div>
            <div className="text-sm" style={mutedText}>{t("settings.whatsapp.expired")}</div>
            <Button
              className="mt-2"
              variant="default"
              size="sm"
              loading={minting}
              disabled={minting}
              onClick={() => mint(true)}
            >
              {t("settings.whatsapp.newCode")}
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="sm"
            loading={minting}
            disabled={minting}
            onClick={() => mint(true)}
          >
            {t("settings.whatsapp.connect")}
          </Button>
        )}
      </div>

      {token && !expired && (
        <div className="mt-3 text-sm" style={mutedText}>
          {t("settings.whatsapp.waiting", { time: ltrIsolate(mmss) })}
        </div>
      )}

      {token && (
        <div className="mt-4" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <canvas
            ref={canvasRef}
            style={{ border: "1px solid var(--rule)", borderRadius: 12, background: "var(--paper)" }}
          />
          <div className="text-sm" style={mutedText}>{t("settings.whatsapp.scan")}</div>
        </div>
      )}

      {error && <div className="mt-2 text-sm" style={{ color: "var(--error)" }}>{error}</div>}
    </div>
  );
}