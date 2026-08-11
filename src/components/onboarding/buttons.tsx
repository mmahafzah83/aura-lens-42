/**
 * THE BUTTON SYSTEM — four levels, and nothing else.
 *
 * PRIMARY   one per screen. Filled blue, 52px, pill.
 * SECONDARY same shape, bordered, quiet. Never two adjacent.
 * TERTIARY  text only. Back, None of these fit, Use this one.
 * DISABLED  grey, switched off — never a paler blue.
 * LOADING   spinner + verb, same width, not pressable.
 */
import React from "react";
import { Loader2 } from "lucide-react";

export type BtnVariant = "primary" | "secondary" | "tertiary";

export const BUTTON_CSS = `
.ob-btn{font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:9px;
  cursor:pointer;transition:background 180ms cubic-bezier(.22,1,.36,1),transform 120ms cubic-bezier(.22,1,.36,1),color 180ms;}
.ob-btn:focus-visible{outline:1px solid #0670C4;outline-offset:0;box-shadow:0 0 0 3px #E6F2FD;}
.ob-btn-primary{inline-size:100%;min-block-size:52px;border-radius:999px;border:none;background:#0670C4;
  color:#FFFFFF;font-size:var(--ob-btn,15px);font-weight:600;}
.ob-btn-primary:hover:not(:disabled){background:#04477C;}
.ob-btn-primary:active:not(:disabled){transform:scale(.985);}
.ob-btn-secondary{inline-size:100%;min-block-size:52px;border-radius:999px;background:transparent;
  border:1.5px solid #E2E7EE;color:#5B6673;font-weight:600;font-size:var(--ob-btn,15px);}
.ob-btn-secondary:hover:not(:disabled){background:#F2F5F9;}
.ob-btn-secondary.on-night{border-color:#2C3A44;color:#C8D4DC;}
.ob-btn-secondary.on-night:hover:not(:disabled){background:#18222A;}
.ob-btn-secondary:active:not(:disabled){transform:scale(.985);}
.ob-btn-tertiary{inline-size:auto;background:none;border:none;padding:8px 2px;font-size:14px;font-weight:500;color:#5B6673;}
.ob-btn-tertiary.on-night{color:#9BA9B4;}
.ob-btn-tertiary:hover:not(:disabled){text-decoration:underline;}
.ob-btn-primary:disabled,.ob-btn-secondary:disabled{background:#E2E7EE;color:#98A2AE;border-color:#E2E7EE;cursor:not-allowed;}
.ob-btn-tertiary:disabled{color:#98A2AE;cursor:not-allowed;}
.ob-actions{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-block-start:20px;}
.ob-actions .ob-btn-tertiary{align-self:center;}
@media (min-width:1280px){
  .ob-btn-primary,.ob-btn-secondary{max-inline-size:360px;margin-inline:auto;}
}
`;

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  onNight?: boolean;
  loading?: boolean;
  /** The verb shown while it works — "Reading…", "Saving…". */
  loadingLabel?: string;
}

export const OBButton: React.FC<Props> = ({
  variant = "primary", onNight = false, loading = false, loadingLabel,
  disabled, className, children, ...rest
}) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={[`ob-btn ob-btn-${variant}`, onNight ? "on-night" : "", className || ""].filter(Boolean).join(" ")}
    {...rest}
  >
    {loading ? <><Loader2 size={16} className="animate-spin" />{loadingLabel ?? "Working…"}</> : children}
  </button>
);

/** Stack actions with the primary first and 12px between them. */
export const Actions: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="ob-actions" style={style}>{children}</div>
);

export default OBButton;
