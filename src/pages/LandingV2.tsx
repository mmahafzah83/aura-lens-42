import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ltrIsolate as I, type UiLang } from "@/i18n";
import LanguageToggle from "@/components/LanguageToggle";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { signOutAndLand } from "@/lib/signOut";
import { SEAT_PRICE, SEAT_CTA, SEAT_PATH, SEAT_CAP, SEAT_WAVE_SIZE, SEAT_NO_CARD, SEAT_SOLD_OUT_NOTE, waveFrom } from "@/lib/seatCopy";
import { PRODUCT_DESCRIPTOR, ASSESSMENT_MINUTES_LINE, ASSESSMENT_QUESTIONS_PHRASE, FREE_CTA, FREE_CTA_SHORT_LABEL, FREE_CTA_ARIA } from "@/lib/brand";
import { BRAND } from "@/constants/language";

/* D126 — the headline is single-sourced from BRAND.headline. The hero splits it
   at a known pivot so the second half can carry the gradient treatment. */
const HEAD_PIVOT = "than your profile shows.";
const HEAD_LEAD = BRAND.headline.endsWith(HEAD_PIVOT)
  ? BRAND.headline.slice(0, -HEAD_PIVOT.length).trim()
  : BRAND.headline;
const HEAD_TAIL = BRAND.headline.endsWith(HEAD_PIVOT) ? HEAD_PIVOT : "";

/* ────────────────────────────────────────────────────────────────
   LandingV2 — six tabbed pages, one at a time.
   The file is two template strings (CSS + HTML) plus DOM effects
   scoped to rootRef. Everything is scoped under .aura-v2.
   ──────────────────────────────────────────────────────────────── */

const LANDING_V2_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
.aura-v2{--ink:#0F1519;--ink2:#37424F;--ink3:#66707D;--ink4:#9AA4B0;--line:#E2E7EE;--line2:#D2D8E0;--white:#FFF;--canvas:#F2F5F9;--tint:#EFF4FA;--blue:#0670C4;--blue2:#04477C;--bluetint:#E7F1FB;--cyan:#00CEC9;--cyanT:#00807B;--cyantint:#E0F7F6;--amber:#E0A82E;--amberT:#9A6F12;--ambertint:#FDF3DF;--red:#C0392B;--green:#12805C;--greentint:#E4F6EC;--ui:"Inter",system-ui,sans-serif;--mono:"IBM Plex Mono",monospace;--sp:cubic-bezier(.16,1,.3,1);font-family:var(--ui);background:var(--canvas);color:var(--ink);-webkit-font-smoothing:antialiased;overflow-x:clip;min-height:100vh}
.aura-v2 .navshell{position:sticky;top:0;z-index:60;padding:16px 20px;display:flex;justify-content:center;pointer-events:none;background:linear-gradient(var(--canvas) 55%,rgba(242,245,249,0))}
.aura-v2 .nav{pointer-events:auto;display:flex;align-items:center;gap:2px;background:var(--ink);border-radius:999px;padding:7px 7px 7px 18px;box-shadow:0 20px 46px -20px rgba(15,21,25,.55);max-width:calc(100vw - 40px);transition:padding .18s ease, box-shadow .18s ease}
.aura-v2 .nav.shrink{padding:5px 5px 5px 16px;box-shadow:0 12px 28px -16px rgba(15,21,25,.5)}
.aura-v2 .brand{display:flex;align-items:center;gap:9px;margin-right:16px;text-decoration:none;cursor:pointer}
.aura-v2 .mark{width:24px;height:24px;flex:0 0 24px;color:#fff}
.aura-v2 .bn{font-family:var(--ui);font-weight:700;color:#fff;font-size:19px;letter-spacing:-.02em;line-height:1}
.aura-v2 .links{display:flex;align-items:center;gap:1px}
.aura-v2 .links button{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.58);background:none;border:0;cursor:pointer;padding:11px 12px;border-radius:999px;transition:.2s;white-space:nowrap}
.aura-v2 .links button:hover{color:#fff;background:rgba(255,255,255,.08)}
.aura-v2 .links button.on{color:#fff;background:rgba(255,255,255,.12)}
.aura-v2 .navalt{margin-left:8px;display:inline-flex;align-items:center;background:rgba(255,255,255,.12);color:#fff;border:0;cursor:pointer;font-family:var(--ui);border-radius:999px;padding:11px 14px;font-size:13.5px;font-weight:600;white-space:nowrap;text-decoration:none;transition:.2s}
.aura-v2 .navalt:hover{background:rgba(255,255,255,.2)}
.aura-v2 .navcta{margin-left:8px;display:flex;align-items:center;gap:9px;background:#fff;color:var(--ink);border-radius:999px;padding:11px 16px;font-size:14px;font-weight:600;white-space:nowrap;text-decoration:none;transition:.2s}
.aura-v2 .navcta:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(0,0,0,.45)}
.aura-v2 .navcta .a{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--tint);font-size:10px}
@media(max-width:1100px){
 .aura-v2 .nav{padding:5px 5px 5px 12px;flex-wrap:wrap;border-radius:22px;justify-content:center}
 .aura-v2 .brand{margin-right:8px}
 .aura-v2 .links{order:3;width:100%;justify-content:center;flex-wrap:wrap;padding-top:4px}
 .aura-v2 .navalt,.aura-v2 .navcta{margin-left:5px;padding:9px 11px;font-size:12px}
 .aura-v2 .navcta .a{display:none}
}
.aura-v2 .stage{max-width:1240px;margin:0 auto;padding:26px 34px 76px}
.aura-v2 .pg{display:none}
.aura-v2 .pg.on{display:block;animation:auraIn .45s var(--sp)}
@keyframes auraIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.aura-v2 .tag{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);background:var(--bluetint);padding:6px 12px;border-radius:999px}
.aura-v2 h1{font-size:clamp(38px,5.4vw,62px);font-weight:700;letter-spacing:-.035em;line-height:1.03;margin-top:20px}
.aura-v2 h2{font-size:clamp(30px,4vw,48px);font-weight:700;letter-spacing:-.034em;line-height:1.06;margin-top:16px}
.aura-v2 .grad{background:linear-gradient(96deg,var(--blue),var(--cyanT));-webkit-background-clip:text;background-clip:text;color:transparent}
.aura-v2 .sub{font-size:clamp(16px,1.75vw,19px);color:var(--ink3);line-height:1.6;margin-top:18px;max-width:520px}
.aura-v2 .sub b{color:var(--ink);font-weight:600}
.aura-v2 .hdr{text-align:center;max-width:700px;margin:0 auto 44px}
.aura-v2 .hdr .sub{margin-left:auto;margin-right:auto;max-width:560px}
.aura-v2 .eyebrow{font-family:var(--mono);font-size:12.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink4);display:flex;align-items:center;gap:12px;margin-bottom:24px}
.aura-v2 .eyebrow::after{content:"";flex:1;height:1px;background:var(--line)}
.aura-v2 .btn{font-family:var(--ui);font-weight:600;font-size:14.5px;padding:14px 26px;border:none;border-radius:9px;cursor:pointer;transition:200ms var(--sp);text-decoration:none;display:inline-block}
.aura-v2 .bp{background:var(--blue);color:#fff}
.aura-v2 .bp:hover{background:var(--blue2);transform:translateY(-2px);box-shadow:0 10px 26px rgba(6,112,196,.26)}
.aura-v2 .acts{display:flex;gap:11px;margin-top:30px;align-items:center;flex-wrap:wrap}
.aura-v2 .mi{font-family:var(--mono);font-size:10.5px;color:var(--ink4);letter-spacing:.07em}
.aura-v2 .big{font-size:clamp(34px,3.8vw,46px);font-weight:700;letter-spacing:-.038em;line-height:.98}
.aura-v2 .big.b{color:var(--blue)}.aura-v2 .big.c{color:var(--cyanT)}.aura-v2 .big.k{color:var(--ink)}
.aura-v2 .rest{font-size:17px;font-weight:500;color:var(--ink2);line-height:1.38;margin-top:9px;letter-spacing:-.012em}
.aura-v2 .det{font-size:14px;color:var(--ink3);line-height:1.6;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.aura-v2 .det b{color:var(--ink2);font-weight:600}
.aura-v2 .viz{height:96px;margin-bottom:22px;display:flex;align-items:center}
.aura-v2 .viz svg{overflow:visible}
.aura-v2 .pulse{animation:auraPu 2.6s ease-in-out infinite}
@keyframes auraPu{0%,100%{opacity:1}50%{opacity:.35}}
.aura-v2 .dash{stroke-dasharray:4 6;animation:auraMarch 22s linear infinite}
@keyframes auraMarch{to{stroke-dashoffset:-200}}
.aura-v2 .hero{display:grid;grid-template-columns:1.02fr 1fr;gap:52px;align-items:center}
.aura-v2 .loopwrap{display:flex;align-items:center;justify-content:center}
.aura-v2 .loopwrap svg{width:100%;max-width:470px;height:auto;overflow:visible}
.aura-v2 .orb{animation:auraSpin 44s linear infinite;transform-origin:280px 280px}
@keyframes auraSpin{to{transform:rotate(360deg)}}
.aura-v2 .nodeL{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.11em;fill:var(--ink2)}
.aura-v2 .nodeS{font-family:var(--ui);font-size:11px;fill:var(--ink4)}
.aura-v2 .trio{display:grid;grid-template-columns:repeat(3,1fr);background:var(--white);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.aura-v2 .quad{display:grid;grid-template-columns:repeat(4,1fr);background:var(--white);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.aura-v2 .bene{padding:32px 28px;border-right:1px solid var(--line);position:relative;transition:280ms var(--sp)}
.aura-v2 .bene:last-child{border-right:none}
.aura-v2 .bene:hover{background:linear-gradient(180deg,var(--white),var(--canvas))}
.aura-v2 .bene .step{position:absolute;top:20px;right:24px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--ink4)}
.aura-v2 .who{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;padding:4px 9px;border-radius:999px;display:inline-block;margin-bottom:14px}
.aura-v2 .who.u{background:var(--bluetint);color:var(--blue)}
.aura-v2 .who.a{background:var(--ink);color:var(--cyan)}
.aura-v2 .panel{background:var(--white);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.aura-v2 .ph{padding:15px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px}
.aura-v2 .ph .t{font-size:13.5px;font-weight:650}
.aura-v2 .ph .m{font-family:var(--mono);font-size:9.5px;letter-spacing:.11em;color:var(--ink4)}
.aura-v2 .pb{padding:22px}
.aura-v2 .g2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.aura-v2 .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.aura-v2 .wide{background:var(--white);border:1px solid var(--line);border-radius:20px;padding:32px 30px}
.aura-v2 .wide svg{width:100%;height:auto;display:block;overflow:visible}
.aura-v2 .dark{background:var(--ink);border-radius:20px;padding:38px 36px;position:relative;overflow:hidden;margin-top:22px}
.aura-v2 .dark::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 88% 8%,rgba(0,206,201,.15),transparent 46%),radial-gradient(circle at 6% 96%,rgba(6,112,196,.2),transparent 44%)}
.aura-v2 .dark-in{position:relative;display:grid;grid-template-columns:auto 1fr;gap:44px;align-items:center}
.aura-v2 .dark h3{font-size:clamp(22px,2.5vw,30px);font-weight:700;letter-spacing:-.03em;color:#fff;line-height:1.15;max-width:250px}
.aura-v2 .dark h3 em{font-style:normal;color:var(--cyan)}
.aura-v2 .dark p{font-size:14px;color:#8E99A6;line-height:1.6;margin-top:12px;max-width:280px}
.aura-v2 .savegrid{display:grid;grid-template-columns:repeat(3,1fr)}
.aura-v2 .sv{padding:0 26px;border-right:1px solid rgba(255,255,255,.11)}
.aura-v2 .sv:first-child{padding-left:0}
.aura-v2 .sv:last-child{border-right:none;padding-right:0}
.aura-v2 .sv .ico{margin-bottom:14px}
.aura-v2 .sv .n{font-family:var(--mono);font-size:clamp(26px,3vw,36px);font-weight:600;letter-spacing:-.04em;line-height:1}
.aura-v2 .sv.h .n{color:#fff}.aura-v2 .sv.m .n{color:var(--cyan)}.aura-v2 .sv.d .n{color:var(--amber)}
.aura-v2 .sv .n.word{font-family:var(--ui);font-weight:700;letter-spacing:-.02em}
.aura-v2 .sv .l{font-size:13.5px;color:#A7B0BC;line-height:1.5;margin-top:9px}
.aura-v2 .sv .l b{color:#fff;font-weight:600}
.aura-v2 .savefoot{border-top:1px solid rgba(255,255,255,.08);padding-top:26px;margin-top:0}
.aura-v2 .savechip{display:inline-block;max-width:100%;font-size:11.5px;line-height:1.5;padding:6px 12px;border-radius:6px;background:rgba(0,206,201,.08);color:var(--cyan)}
.aura-v2 .savechip b{font-weight:600}
.aura-v2 .savechip-rest{opacity:.72}
.aura-v2 .strike{position:relative;display:inline-block;color:#5D6874}
.aura-v2 .strike + .strike{margin-left:10px}
.aura-v2 .strike::after{content:"";position:absolute;left:-2px;right:-2px;top:52%;height:1.5px;background:var(--red)}
.aura-v2 .pill{font-size:12.5px;font-weight:500;padding:8px 13px;border-radius:999px;background:var(--bluetint);color:var(--blue2)}
.aura-v2 .quote{border-left:3px solid var(--blue);padding:4px 0 4px 16px;font-size:15px;color:var(--ink2);line-height:1.6}
.aura-v2 .mrow{display:flex;gap:13px;align-items:flex-start;padding:13px 0;border-bottom:1px solid var(--line)}
.aura-v2 .mrow:last-child{border-bottom:none;padding-bottom:0}
.aura-v2 .mrow:first-child{padding-top:0}
.aura-v2 .mi2{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex-shrink:0}
.aura-v2 .mi2.b{background:var(--bluetint);color:var(--blue)}
.aura-v2 .mi2.c{background:var(--cyantint);color:var(--cyanT)}
.aura-v2 .mi2.a{background:var(--ambertint);color:var(--amberT)}
.aura-v2 .mrow .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.11em;color:var(--ink4);display:block}
.aura-v2 .mrow .v{font-size:14px;color:var(--ink2);line-height:1.5;margin-top:4px;display:block}
.aura-v2 .mrow .v b{color:var(--ink);font-weight:600}
.aura-v2 .lens{padding:14px 0;border-bottom:1px solid var(--line)}
.aura-v2 .lens:last-child{border-bottom:none;padding-bottom:0}
.aura-v2 .lens .lh{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;color:var(--blue)}
.aura-v2 .lens p{font-size:14px;color:var(--ink2);line-height:1.55;margin-top:8px}
.aura-v2 .post{border:1px solid var(--line);border-radius:14px;padding:18px;background:var(--white)}
.aura-v2 .pph{display:flex;gap:10px;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--line)}
.aura-v2 .av{width:36px;height:36px;border-radius:999px;background:linear-gradient(135deg,var(--line2),var(--tint))}
.aura-v2 .pn{font-size:13px;font-weight:650}
.aura-v2 .pr{font-size:11px;color:var(--ink4)}
.aura-v2 .pbody{font-size:13.5px;color:var(--ink2);line-height:1.68;margin-top:12px}
.aura-v2 .srcline{margin-top:12px;display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;color:var(--cyanT);background:var(--cyantint);padding:9px 11px;border-radius:8px;letter-spacing:.04em}
.aura-v2 .slides{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px}
.aura-v2 .sl{aspect-ratio:4/5;border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;transition:240ms var(--sp);position:relative;overflow:hidden}
.aura-v2 .sl:hover{transform:translateY(-5px)}
.aura-v2 .sl .n{font-family:var(--mono);font-size:8px;opacity:.72;position:relative}
.aura-v2 .sl .t{font-size:11.5px;font-weight:700;line-height:1.32;position:relative}
.aura-v2 .sl .shape{position:absolute;pointer-events:none;z-index:0;opacity:.30}
.aura-v2 .sl .n,.aura-v2 .sl .t{position:relative;z-index:1}
.aura-v2 .chipg{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.aura-v2 .chipg span{font-family:var(--mono);font-size:10px;padding:7px 11px;border-radius:999px;background:var(--greentint);color:var(--green)}
.aura-v2 .cmp{background:var(--white);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.aura-v2 .cmp table{width:100%;border-collapse:collapse}
.aura-v2 .cmp th{padding:15px 12px;text-align:center;font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);border-bottom:1px solid var(--line);font-weight:500;line-height:1.5}
.aura-v2 .cmp th.us{background:var(--ink);color:#fff;font-weight:600;font-size:11.5px}
.aura-v2 .cmp th:first-child{text-align:left;width:30%}
.aura-v2 .cmp td{padding:15px 12px;text-align:center;border-bottom:1px solid var(--line);font-size:13.5px}
.aura-v2 .cmp td:first-child{text-align:left;color:var(--ink2);font-weight:500}
.aura-v2 .cmp tr:last-child td{border-bottom:none}
.aura-v2 .cmp td.us{background:var(--tint)}
.aura-v2 .dY{width:20px;height:20px;border-radius:999px;background:var(--blue);display:inline-grid;place-items:center}
.aura-v2 .dN{width:20px;height:20px;border-radius:999px;border:1.6px solid var(--line2);display:inline-block}
.aura-v2 .dP{width:20px;height:20px;border-radius:999px;background:var(--line2);display:inline-block}
.aura-v2 details{background:var(--white);border:1px solid var(--line);border-radius:13px;padding:17px 21px;margin-bottom:10px;transition:180ms var(--sp)}
.aura-v2 details[open]{border-color:var(--line2);box-shadow:0 8px 26px rgba(11,18,32,.05)}
.aura-v2 summary{font-size:15.5px;font-weight:600;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px}
.aura-v2 summary::-webkit-details-marker{display:none}
.aura-v2 summary::after{content:"";width:11px;height:11px;border-right:2px solid var(--blue);border-bottom:2px solid var(--blue);transform:rotate(45deg);transition:220ms var(--sp);flex-shrink:0;margin-top:-4px}
.aura-v2 details[open] summary::after{transform:rotate(-135deg);margin-top:2px}
.aura-v2 details p{font-size:14.5px;color:var(--ink3);line-height:1.65;margin-top:12px}
.aura-v2 .calc{margin-top:18px;padding:20px 24px;border-radius:16px;background:var(--tint);border:1px dashed var(--line2)}
.aura-v2 .calc .ct{font-size:13.5px;color:var(--ink3);margin-bottom:14px}
.aura-v2 .curr{display:inline-flex;gap:4px;margin-bottom:14px;background:var(--white);padding:3px;border-radius:999px;border:1px solid var(--line)}
.aura-v2 .curr button{font-family:var(--mono);font-size:11px;padding:6px 13px;border:none;background:none;border-radius:999px;cursor:pointer;color:var(--ink3)}
.aura-v2 .curr button[aria-pressed=true]{background:var(--blue);color:#fff}
.aura-v2 .srow{display:flex;justify-content:space-between;font-size:13px;color:var(--ink3);margin-bottom:6px}
.aura-v2 .srow output{font-family:var(--mono);color:var(--ink);font-weight:600}
.aura-v2 .calc input[type=range]{width:100%;margin-bottom:16px;accent-color:var(--blue)}
.aura-v2 .join{background:var(--ink);border-radius:24px;padding:56px 40px;position:relative;overflow:hidden}
.aura-v2 .join::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 82% 12%,rgba(0,206,201,.16),transparent 48%),radial-gradient(circle at 12% 88%,rgba(6,112,196,.2),transparent 46%)}
.aura-v2 .join-in{position:relative;max-width:470px;margin:0 auto;text-align:center}
.aura-v2 .join h2{color:#fff;margin-top:16px}
.aura-v2 .join p{color:#A7B0BC;font-size:15.5px;line-height:1.6;margin-top:14px}
.aura-v2 .dark .jf{display:block;width:100%;max-width:none;margin-left:auto;margin-right:auto;text-align:center}
.aura-v2 .jf{font-family:var(--mono);font-size:10px;color:#65707E;letter-spacing:.09em;margin-top:16px;line-height:1.8}
.aura-v2 .founder{display:flex;gap:15px;align-items:center;background:var(--white);border:1px solid var(--line);border-radius:16px;padding:19px;margin:18px auto 0;max-width:640px}
.aura-v2 .support{font-size:13px;color:var(--ink3);line-height:1.6;margin-top:14px;max-width:52ch}
.aura-v2 .subxs{font-size:14px;color:var(--ink3);line-height:1.6;margin-top:12px;max-width:540px}
.aura-v2 .rungs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:stretch}
.aura-v2 .rung{position:relative;background:var(--white);border:1px solid var(--line);border-radius:20px;padding:26px 22px;display:flex;flex-direction:column}
.aura-v2 .rung.night{background:var(--ink);border-color:#28313A;color:#fff}
.aura-v2 .rung .kick{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;color:var(--ink4);display:flex;align-items:center;gap:7px}
.aura-v2 .rung.night .kick{color:#A7B0BC}
.aura-v2 .rung .cdot{width:6px;height:6px;border-radius:999px;background:var(--cyan);display:inline-block}
.aura-v2 .rung .chip{position:absolute;top:18px;right:18px;font-family:var(--mono);font-size:9px;letter-spacing:.12em;padding:5px 9px;border-radius:999px;background:var(--cyantint);color:var(--cyanT)}
.aura-v2 .rung.night .chip{background:rgba(0,206,201,.16);color:var(--cyan)}
.aura-v2 .rung h3{font-size:20px;font-weight:700;letter-spacing:-.024em;line-height:1.2;margin-top:14px;max-width:15ch}
.aura-v2 .rung .one{font-size:13.5px;color:var(--ink3);line-height:1.6;margin-top:10px}
.aura-v2 .rung.night .one{color:#A7B0BC}
.aura-v2 .rung .prc{display:flex;align-items:baseline;gap:9px;margin-top:18px;flex-wrap:wrap}
.aura-v2 .rung.night .prc .p{font-size:24px}
.aura-v2 .rung .prc .p{font-family:var(--mono);font-size:30px;font-weight:600;letter-spacing:-.03em}
.aura-v2 .rung .prc .u{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;color:var(--ink4)}
.aura-v2 .rung .pn{font-size:12.5px;color:var(--ink3);line-height:1.55;margin-top:7px}
.aura-v2 .rung.night .pn{color:#8E99A6}
.aura-v2 .rung .blk{margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}
.aura-v2 .rung.night .blk{border-top-color:rgba(255,255,255,.14)}
.aura-v2 .rung .bl{font-family:var(--mono);font-size:9px;letter-spacing:.14em;margin-bottom:9px;display:block}
.aura-v2 .rung .bl.do{color:var(--blue)}
.aura-v2 .rung .bl.get{color:var(--cyanT)}
.aura-v2 .rung.night .bl.do{color:#6FB7EE}
.aura-v2 .rung.night .bl.get{color:var(--cyan)}
.aura-v2 .rung ul{list-style:none;display:grid;gap:8px}
.aura-v2 .rung li{font-size:13px;line-height:1.55;color:var(--ink2);padding-left:15px;position:relative}
.aura-v2 .rung.night li{color:#C7CFD8}
.aura-v2 .rung li::before{content:"";position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:999px;background:var(--line2)}
.aura-v2 .rung.night li::before{background:#4A5563}
.aura-v2 .rung li b{color:var(--ink);font-weight:650}
.aura-v2 .rung.night li b{color:#fff}
.aura-v2 .rung .cta{margin-top:auto;padding-top:20px}
.aura-v2 .rung .cta .btn{display:block;text-align:center;width:100%}
.aura-v2 .bout{background:var(--white);color:var(--ink);border:1px solid var(--line2)}
.aura-v2 .bwhite{background:#fff;color:var(--ink)}
.aura-v2 .rung .time{font-family:var(--mono);font-size:9.5px;letter-spacing:.11em;color:var(--ink4);margin-top:10px;text-align:center}
.aura-v2 .pricegrid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:24px;align-items:start}
.aura-v2 .pnight{background:var(--ink);border-radius:24px;padding:32px 28px;position:relative;overflow:hidden;color:#fff}
.aura-v2 .pnight::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 88% 6%,rgba(0,206,201,.18),transparent 48%)}
.aura-v2 .pnight > *{position:relative}
.aura-v2 .pnight .kick{font-family:var(--mono);font-size:9.5px;letter-spacing:.15em;color:#8E99A6}
.aura-v2 .pnight .amt{display:flex;align-items:baseline;gap:12px;margin-top:14px}
.aura-v2 .pnight .amt .n{font-family:var(--mono);font-size:clamp(44px,6vw,62px);font-weight:600;letter-spacing:-.045em;line-height:1;color:#fff}
.aura-v2 .pnight .amt .u{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--ink4)}
.aura-v2 .cypill{display:inline-block;margin-top:16px;font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;padding:7px 12px;border-radius:999px;background:rgba(0,206,201,.14);color:var(--cyan)}
.aura-v2 .tl{margin-top:26px;display:grid;gap:20px;position:relative}
.aura-v2 .tl .tli{display:grid;grid-template-columns:18px 1fr;gap:14px;position:relative}
.aura-v2 .tl .tli::after{content:"";position:absolute;left:8px;top:20px;bottom:-20px;width:2px;background:#28313A}
.aura-v2 .tl .tli:last-child::after{display:none}
.aura-v2 .bead{width:18px;height:18px;border-radius:999px;background:var(--cyan);margin-top:2px}
.aura-v2 .bead.hollow{background:transparent;border:2px solid #4A5563}
.aura-v2 .tl .tt{font-size:14px;font-weight:650;color:#fff}
.aura-v2 .tl .tb{font-size:13px;color:#A7B0BC;line-height:1.6;margin-top:5px}
.aura-v2 .terms{display:grid;gap:12px}
.aura-v2 .terms li{display:grid;grid-template-columns:20px 1fr;gap:11px;font-size:13.5px;color:var(--ink2);line-height:1.6;list-style:none}
.aura-v2 .tick{width:18px;height:18px;border-radius:999px;background:var(--greentint);display:grid;place-items:center;margin-top:2px}
.aura-v2 .wavecard{margin-top:18px;background:var(--white);border:1px solid var(--line);border-radius:16px;padding:20px}
.aura-v2 .wavecard h4{font-size:15px;font-weight:650;letter-spacing:-.015em}
.aura-v2 .wavechip{display:inline-flex;align-items:center;gap:7px;margin-top:10px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--amberT);background:var(--ambertint);padding:6px 11px;border-radius:999px}
.aura-v2 .pips{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.aura-v2 .pips i{width:20px;height:20px;border-radius:6px;background:var(--canvas);border:1px solid var(--line);display:block}
.aura-v2 .pips i.taken{background:linear-gradient(135deg,#0670C4,#04477C);border-color:transparent}
.aura-v2 .pips i.next{background:transparent;border:1.6px dashed var(--amber)}
.aura-v2 .promise{font-size:14.5px;color:var(--ink3);line-height:1.65;margin-top:12px;max-width:56ch}
.aura-v2 .wavenote{font-size:12.5px;color:var(--ink3);line-height:1.6;margin-top:12px}
.aura-v2 .bnight{background:var(--ink);color:#fff;display:block;text-align:center;width:100%;margin-top:18px}
.aura-v2 .bnight:hover{background:#000}
@media(max-width:900px){.aura-v2 .rungs{grid-template-columns:1fr}}
.aura-v2 .ptwo{display:grid;grid-template-columns:1.08fr .92fr;gap:20px;margin-top:24px;align-items:stretch}
@media(max-width:900px){.aura-v2 .ptwo{grid-template-columns:1fr}}
.aura-v2 .pcard{background:var(--white);border:1px solid var(--line);border-radius:22px;padding:28px 24px;display:flex;flex-direction:column}
.aura-v2 .pcard.night{background:var(--ink);border-color:#28313A;color:#fff}
.aura-v2 .pcard .ptop{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.aura-v2 .pcard .plab{font-family:var(--mono);font-size:12.5px;letter-spacing:.11em;color:var(--ink4)}
.aura-v2 .pcard.night .plab{color:var(--cyan)}
.aura-v2 .pcard .pchip{font-family:var(--mono);font-size:12.5px;letter-spacing:.09em;padding:6px 10px;border-radius:999px;background:var(--cyantint);color:var(--cyanT)}
.aura-v2 .pcard.night .pchip{background:rgba(0,206,201,.16);color:var(--cyan)}
.aura-v2 .pcard h3{font-size:22px;font-weight:700;letter-spacing:-.024em;line-height:1.25;margin-top:16px;max-width:20ch}
.aura-v2 .pcard .who{font-family:var(--ui);font-size:13.5px;color:#A7B0BC;line-height:1.6;margin-top:10px}
.aura-v2 .pcard .prc{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.aura-v2 .pcard.night .prc{border-top-color:rgba(255,255,255,.14)}
.aura-v2 .pcard .prc .p{font-family:var(--mono);font-size:28px;font-weight:600;letter-spacing:-.03em;color:var(--ink)}
.aura-v2 .pcard.night .prc .p{color:#fff;font-size:44px}
.aura-v2 .pcard .prc .u{font-size:12.5px;color:var(--ink4);line-height:1.5}
.aura-v2 .road .stops{margin-top:22px;display:grid;gap:18px}
.aura-v2 .road .stop{display:grid;grid-template-columns:16px 1fr;gap:14px;position:relative}
.aura-v2 .road .stop::after{content:"";position:absolute;left:7px;top:20px;bottom:-18px;width:2px;background:var(--line)}
.aura-v2 .road .stop:last-child::after{display:none}
.aura-v2 .road .pin{width:16px;height:16px;border-radius:999px;border:2px solid var(--cyan);background:var(--white);margin-top:3px}
.aura-v2 .road .stop.last .pin{background:var(--ink);border-color:var(--ink)}
.aura-v2 .road .st{font-family:var(--mono);font-size:12.5px;letter-spacing:.09em;color:var(--cyanT)}
.aura-v2 .road .stop.last .st{color:var(--ink)}
.aura-v2 .road .sh{font-size:14.5px;font-weight:650;color:var(--ink);margin-top:5px;line-height:1.35}
.aura-v2 .road .sb{font-size:13px;color:var(--ink3);line-height:1.6;margin-top:5px}
.aura-v2 .pcard .pcta{margin-top:auto;padding-top:22px}
.aura-v2 .pcard .pcta .btn{display:block;text-align:center;width:100%}
.aura-v2 .pcard .undr{font-size:12.5px;color:var(--ink3);text-align:center;line-height:1.55;margin-top:10px}
.aura-v2 .pcard.night .undr{color:#8E99A6}
.aura-v2 .seat .ticks{display:grid;gap:11px;margin-top:20px;list-style:none}
.aura-v2 .seat .ticks li{display:grid;grid-template-columns:20px 1fr;gap:11px;font-size:13.5px;color:#C7CFD8;line-height:1.55}
.aura-v2 .seat .tk{width:18px;height:18px;border-radius:999px;border:1.5px solid var(--cyan);display:grid;place-items:center;margin-top:1px}
.aura-v2 .seat .lock{margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.14);font-size:12.5px;color:#8E99A6;line-height:1.7}
.aura-v2 .seat .lock b{color:#fff;font-weight:650}
.aura-v2 .bridge{max-width:600px;margin:22px auto 0;text-align:center;background:var(--white);border:1px solid var(--line);border-radius:999px;padding:14px 24px;font-size:13px;color:var(--ink3);line-height:1.6}
@media(max-width:860px){.aura-v2 .pricegrid{grid-template-columns:1fr}}
.aura-v2 .founder img{width:48px;height:48px;border-radius:999px;object-fit:cover;flex-shrink:0}
.aura-v2 .founder .t{font-size:14px;color:var(--ink3);line-height:1.55}
.aura-v2 .founder .t b{color:var(--ink)}
.aura-v2 .foot{border-top:1px solid var(--line);margin-top:56px;padding:20px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.aura-v2 .foot span,.aura-v2 .foot a{font-family:var(--mono);font-size:10px;color:var(--ink4);letter-spacing:.09em;text-decoration:none}
.aura-v2 .foot a{display:inline-flex;align-items:center;min-height:44px;padding:0 2px}
.aura-v2 .foot a:hover{color:var(--blue)}
.aura-v2 .closing-note{font-size:14px;color:#8E99A6;margin-top:14px}
.aura-v2 #price .dark.rv{margin-top:clamp(560px,72vh,760px)}
.aura-v2 .rv{opacity:0;transform:translateY(16px);transition:750ms var(--sp)}
.aura-v2 .rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.aura-v2 .rv{opacity:1;transform:none;transition:none}.aura-v2 .orb,.aura-v2 .pulse,.aura-v2 .dash{animation:none}.aura-v2 .pg.on{animation:none}}
@media(max-width:1000px){
.aura-v2 .hero,.aura-v2 .trio,.aura-v2 .quad,.aura-v2 .g2,.aura-v2 .g3,.aura-v2 .dark-in,.aura-v2 .savegrid{grid-template-columns:1fr}
.aura-v2 .bene{border-right:none;border-bottom:1px solid var(--line)}
.aura-v2 .bene:last-child{border-bottom:none}
.aura-v2 .sv{padding:0 0 20px;border-right:none;border-bottom:1px solid rgba(255,255,255,.11)}
.aura-v2 .sv:last-child{border-bottom:none;padding-bottom:0}
.aura-v2 .stage{padding:18px 18px 50px}
.aura-v2 .slides{grid-template-columns:repeat(2,1fr)}
.aura-v2 .cmp{overflow-x:auto}
.aura-v2 .cmp table{min-width:640px}
.aura-v2 .wide{padding:20px 16px;overflow-x:auto}}
.aura-v2 .jrail{display:none}
.aura-v2 .jring{display:block;width:100%}
.aura-v2 .jring svg{width:100%;max-width:560px;height:auto;display:block;margin:0 auto;overflow:visible}
@media(max-width:900px){
 .aura-v2 .jring{display:none}
 .aura-v2 .jrail{display:block;width:100%;margin-top:8px}
 .aura-v2 .jrail .rkick{font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:#9AA4B0;text-transform:uppercase;margin:16px 0 8px}
 .aura-v2 .jrail .rstart{font-family:var(--mono);font-size:9.5px;letter-spacing:.17em;color:#00807B;text-transform:uppercase;margin-bottom:12px}
 .aura-v2 .jrail .rrow{display:grid;grid-template-columns:16px 1fr;gap:12px;align-items:start}
 .aura-v2 .jrail .rbead{display:flex;flex-direction:column;align-items:center;height:100%}
 .aura-v2 .jrail .rbead i{width:11px;height:11px;border-radius:999px;background:#0670C4;display:block;flex:0 0 11px}
 .aura-v2 .jrail .rbead u{width:2px;flex:1;min-height:26px;background:#C3D8EC;display:block;margin-top:4px}
 .aura-v2 .jrail .rrow.first .rbead i{background:#00CEC9;box-shadow:0 0 0 4px rgba(0,206,201,.18)}
 .aura-v2 .jrail .rrow.first .rbead u{background:#00CEC9}
 .aura-v2 .jrail .rrow.ra .rbead i{background:#00CEC9}
 .aura-v2 .jrail .rrow.ra .rbead u{background:#00CEC9}
 .aura-v2 .jrail .rrow.rb .rbead i{background:#0984E3}
 .aura-v2 .jrail .rrow.rb .rbead u{background:#BBD9F2}
 .aura-v2 .jrail .rrow.rc .rbead i{background:#0670C4}
 .aura-v2 .jrail .rrow.rc .rbead u{background:#9FC3E4}
 .aura-v2 .jrail .rrow.rd .rbead i{background:#04477C}
 .aura-v2 .jrail .rrow.rd .rbead u{background:#8AA6C2}
 .aura-v2 .jrail .rkick.ka{color:#00807B}
 .aura-v2 .jrail .rkick.kb{color:#0984E3}
 .aura-v2 .jrail .rkick.kc{color:#0670C4}
 .aura-v2 .jrail .rkick.kd{color:#04477C}
 .aura-v2 .jrail .rt{font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.3}
 .aura-v2 .jrail .rs{font-size:12px;color:#66707D;line-height:1.45;margin:3px 0 16px}
 .aura-v2 .jrail .rdial{background:#0F1519;border-radius:16px;padding:22px;text-align:center;margin-top:8px}
 .aura-v2 .jrail .rdial .n{font-family:var(--mono);font-size:40px;font-weight:600;color:#fff;line-height:1}
 .aura-v2 .jrail .rdial .p{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;color:#00CEC9;margin-top:8px}
 .aura-v2 .jrail .rdial .c{font-size:10.5px;color:#8E99A6;margin-top:6px}
.aura-v2 .jrail .rbtn{display:block;width:100%;text-align:center;margin-top:14px}
}
.aura-v2 .ledger{margin-top:18px;background:var(--white);border:1px solid var(--line);border-radius:20px;padding:32px 28px}
.aura-v2 .ledger-lead{font-size:16px;color:var(--ink3);line-height:1.6;max-width:560px;margin:0 auto 18px;text-align:center}
.aura-v2 .ledger .head{display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink4);padding-bottom:14px;border-bottom:1px solid var(--line)}
.aura-v2 .ledger .row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}
.aura-v2 .ledger .row:last-of-type{border-bottom:none}
.aura-v2 .ledger .row .main{font-size:15px;font-weight:650;color:var(--ink);line-height:1.35}
.aura-v2 .ledger .row .sub{font-size:13px;color:var(--ink3);line-height:1.5;margin-top:3px;display:block}
.aura-v2 .ledger .row .status{font-family:var(--mono);font-size:12.5px;font-weight:600;letter-spacing:.06em;color:var(--red);text-align:right;white-space:nowrap;flex-shrink:0;margin-top:2px}
.aura-v2 .ledger .total{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:6px;padding:16px 20px;background:#FBF1EF;border-radius:12px}
.aura-v2 .ledger .total .q{font-size:15px;font-weight:700;color:var(--red);line-height:1.35}
.aura-v2 .ledger .total .a{font-family:var(--mono);font-size:12.5px;font-weight:700;letter-spacing:.06em;color:var(--red);text-align:right;white-space:nowrap}
.aura-v2 .turn{background:#0F1519;border-radius:20px;padding:32px 28px;margin-top:22px;position:relative;overflow:hidden}
.aura-v2 .turn h3{font-size:clamp(22px,2.5vw,30px);font-weight:700;letter-spacing:-.03em;color:#fff;line-height:1.15}
.aura-v2 .turn p{font-size:15px;line-height:1.65;color:#9AA5B1;margin-top:12px;max-width:620px}
.aura-v2 .turn .mono{margin-top:18px;font-family:var(--mono);font-size:12.5px;letter-spacing:.12em;color:var(--cyan)}
@media(max-width:700px){
 .aura-v2 .ledger{padding:24px 18px}
 .aura-v2 .ledger .row{flex-direction:column;gap:8px}
 .aura-v2 .ledger .row .status{text-align:left}
 .aura-v2 .ledger .total{flex-direction:column;align-items:flex-start;gap:6px}
 .aura-v2 .turn{padding:24px 18px}
}

/* ── Arabic (dir=rtl). Only matches when the page renders Arabic. ── */
.aura-v2[dir=rtl]{--ui:'CairoAR','Cairo',"Inter",system-ui,sans-serif;--mono:'CairoAR','Cairo',"IBM Plex Mono",monospace}
.aura-v2[dir=rtl] *{letter-spacing:0!important;text-transform:none!important;font-style:normal!important;line-height:1.7!important}
.aura-v2[dir=rtl] h1,.aura-v2[dir=rtl] h2,.aura-v2[dir=rtl] h3,.aura-v2[dir=rtl] h4,.aura-v2[dir=rtl] .big,.aura-v2[dir=rtl] .bn,.aura-v2[dir=rtl] .n,.aura-v2[dir=rtl] .p,.aura-v2[dir=rtl] .sl .t{line-height:1.3!important}
.aura-v2[dir=rtl] svg text{font-style:normal}
.aura-v2[dir=rtl] .bn{font-family:"Inter",system-ui,sans-serif}
.aura-v2[dir=rtl] .links button{font-size:13px}
.aura-v2[dir=rtl] .who,.aura-v2[dir=rtl] .ph .m,.aura-v2[dir=rtl] .lens .lh,.aura-v2[dir=rtl] .mrow .k,.aura-v2[dir=rtl] .srcline,.aura-v2[dir=rtl] .chipg span,.aura-v2[dir=rtl] .mi,.aura-v2[dir=rtl] .foot span,.aura-v2[dir=rtl] .foot a,.aura-v2[dir=rtl] .rkick,.aura-v2[dir=rtl] .rstart,.aura-v2[dir=rtl] .rdial .p,.aura-v2[dir=rtl] .cmp th,.aura-v2[dir=rtl] .plab,.aura-v2[dir=rtl] .pchip,.aura-v2[dir=rtl] .st,.aura-v2[dir=rtl] .eyebrow,.aura-v2[dir=rtl] .ledger .head span,.aura-v2[dir=rtl] .ledger .status,.aura-v2[dir=rtl] .tag{font-size:12.5px}
.aura-v2[dir=rtl] .nav{padding:7px 18px 7px 7px}
.aura-v2[dir=rtl] .nav.shrink{padding:5px 16px 5px 5px}
.aura-v2[dir=rtl] .brand{margin-right:0;margin-left:16px}
.aura-v2[dir=rtl] .navalt,.aura-v2[dir=rtl] .navcta{margin-left:0;margin-right:8px}
@media(max-width:1100px){
 .aura-v2[dir=rtl] .nav{padding:5px 12px 5px 5px}
 .aura-v2[dir=rtl] .brand{margin-left:8px}
 .aura-v2[dir=rtl] .navalt,.aura-v2[dir=rtl] .navcta{margin-right:5px}
}
.aura-v2[dir=rtl] .bene{border-right:none;border-left:1px solid var(--line)}
.aura-v2[dir=rtl] .bene:last-child{border-left:none}
.aura-v2[dir=rtl] .bene .step{right:auto;left:24px}
.aura-v2[dir=rtl] .sv{border-right:none;border-left:1px solid rgba(255,255,255,.11)}
.aura-v2[dir=rtl] .sv:first-child{padding-left:26px;padding-right:0}
.aura-v2[dir=rtl] .sv:last-child{border-left:none;padding-left:0;padding-right:26px}
@media(max-width:1000px){
 .aura-v2[dir=rtl] .bene{border-left:none}
 .aura-v2[dir=rtl] .sv,.aura-v2[dir=rtl] .sv:first-child,.aura-v2[dir=rtl] .sv:last-child{border-left:none;padding-left:0;padding-right:0}
}
.aura-v2[dir=rtl] .strike + .strike{margin-left:0;margin-right:10px}
.aura-v2[dir=rtl] .quote{border-left:none;border-right:3px solid var(--blue);padding-left:0;padding-right:16px}
.aura-v2[dir=rtl] .cmp th:first-child,.aura-v2[dir=rtl] .cmp td:first-child{text-align:right}
.aura-v2[dir=rtl] .road .stop::after{left:auto;right:7px}
.aura-v2[dir=rtl] .ledger .row .status,.aura-v2[dir=rtl] .ledger .total .a{text-align:left}
.aura-v2[dir=rtl] .wide .mi{text-align:left!important}
@media(max-width:700px){ .aura-v2[dir=rtl] .ledger .row .status{text-align:right} }
`;

/* GENERATED copy map — English text kept exactly; Arabic from the founder's deck. */
export const LANDING_COPY = {
  navHome: ["Home", "الرئيسية"],
  navHow: ["How it works", "طريقة العمل"],
  navGet: ["What you get", "ما تحصل عليه"],
  navWhy: ["Why now", "لماذا الآن"],
  navCmp: ["Compare", "المقارنة"],
  navPrice: ["Pricing", "الأسعار"],
  signIn: ["Sign in", "تسجيل الدخول"],
  navCtaInner: [`${FREE_CTA_SHORT_LABEL} <span class="a">↗</span>`, "ابدأ مجاناً"],
  headLead: [`${HEAD_LEAD}`, "خبرتك أكبر"],
  headTail: [`${HEAD_TAIL}`, "مما تُظهره صفحتك."],
  heroSub: ["KnownBy reads what you already know and turns it into weekly presence — without turning you into a content creator.", "KnownBy يقرأ ما تعرفه أصلاً، ويكتبه بصوتك ليراه سوقك كل أسبوع. ولن تصير صانع محتوى."],
  freeCta: [`${FREE_CTA}`, "ابدأ مجاناً"],
  heroSupport: [`We'll read your LinkedIn, compare it with your CV, and ask ${ASSESSMENT_QUESTIONS_PHRASE} — then send you a free, honest read on where you stand. ${ASSESSMENT_MINUTES_LINE}.`, "يقرأ KnownBy صفحتك على LinkedIn، ويقارنها بسيرتك الذاتية، ويسألك تسعة أسئلة، ثم يرسل إليك ملف هويتك المهنية، مجاناً وبصراحة، ليبيّن أين تقف. نحو خمس عشرة دقيقة."],
  rStart: ["▼ You start here · free", "▼ تبدأ من هنا · مجاناً"],
  rk1: ["SEE YOURSELF · YOUR UNDERSTANDING · FREE", "اعرف نفسك · فهمك لنفسك · مجاناً"],
  rk2: ["NOTHING LOST · YOUR KNOWLEDGE, KEPT", "لا يضيع شيء · معرفتك محفوظة"],
  rk3: ["IT COMPOSES · YOUR CONTENT, WRITTEN", "يكتب عنك · محتواك مكتوب"],
  rk4: ["YOU ARE SEEN · YOUR STANDING, MEASURED", "يراك سوقك · مكانتك بالأرقام"],
  s1t: ["Your assessment", "تقييمك"],
  s1s: ["free, yours to keep", "مجاني ويبقى لك"],
  s2t: ["Capture what you read", "احفظ ما تقرأ"],
  s2s: ["one tap", "بلمسة واحدة"],
  s3t: ["Organise it", "يرتّبه لك"],
  s3s: ["nothing lost", "ولا يضيع شيء"],
  s4t: ["Evidence, in fragments", "أدلة جاهزة"],
  s4s: ["usable in November", "تنفعك بعد شهور"],
  s5t: ["Your field's trends", "جديد مجالك"],
  s5s: ["matched to you", "على مقاسك"],
  s6t: ["Tuned to your voice", "بصوتك أنت"],
  s6s: ["learned, not guessed", "تعلّمه ولم يخمّنه"],
  s7t: ["The draft", "المسودة"],
  s7s: ["by dawn", "جاهزة عند الفجر"],
  s8t: ["You publish", "تنشر"],
  s8s: ["one click", "بضغطة واحدة"],
  s9t: ["The outcome", "النتيجة"],
  s9s: ["your standing moves", "مكانتك تتحرّك"],
  dialP: ["YOUR STANDING", "مكانتك"],
  dialC: ["step 9 feeds this", "تغذّيها الخطوة 9"],
  ebDoes: ["What KnownBy does for you", "ماذا يفعل KnownBy لك"],
  know: ["Know", "اعرف"],
  knowRest: ["your strengths, your skills,<br>and what you stand for.", "نقاط قوتك ومهاراتك، وما تُعرف به."],
  knowDet: [`${ASSESSMENT_QUESTIONS_PHRASE.replace(/^./, (c) => c.toUpperCase())} and your profile become a real report: the subjects you truly own, the space nobody else holds, and the two things to improve next. <b>Most people have never seen this about themselves.</b>`, "تسعة أسئلة وصفحتك تصير ملفاً حقيقياً: المواضيع التي تميّزك فعلاً، والمساحة التي لا يشغلها غيرك، وأمران تحسّنهما بعد ذلك. <b>أغلب الناس لم يروا هذا عن أنفسهم قط.</b>"],
  lost: ["Nothing lost", "لا يضيع شيء"],
  lostRest: ["from your experience<br>and everything you read.", "من خبرتك ومن كل ما تقرأ."],
  lostDet: ["Every article you save is broken into pieces and kept. An idea you read in March is still there, ready to use, in November. <b>Your reading stops disappearing.</b>", "كل مقال تحفظه يُقسَّم إلى أجزاء ويبقى عندك. فكرة قرأتها في مارس تجدها جاهزة في نوفمبر. <b>قراءتك لن تتبخّر بعد اليوم.</b>"],
  pub: ["Publish", "انشر"],
  pubRest: ["in your own voice —<br>while you were asleep.", "بصوتك أنت، وقد كُتب وأنت نائم."],
  pubDet: ["Agents work from 02:00 to dawn and leave you a finished post <b>and a designed carousel</b>. Read it, change a word, click once. It is live on LinkedIn.", `يعمل KnownBy من ${I("02:00")} حتى الفجر، ويترك لك منشوراً مكتملاً <b>وكاروسيل مصمَّماً</b>. تقرؤه، تغيّر كلمة، تضغط مرة واحدة، فيظهر على LinkedIn.`],
  saveH3: ["And what that<br><em>saves you.</em>", "وهذا ما<br><em>يوفّره لك.</em>"],
  saveP: ["Every year, without adding a single hour to your week.", "كل سنة، دون ساعة إضافية واحدة في أسبوعك."],
  sv1n: ["260<span style=\"font-size:.5em\"> hrs</span>", `${I("260")}<span style="font-size:.5em"> ساعة</span>`],
  sv1l: ["of reading a year that <b>stops vanishing</b> — six working weeks of your own thinking.", "من القراءة كل سنة <b>تتوقف عن الضياع</b>. ما يعادل 6 من أسابيع العمل، من تفكيرك أنت."],
  sv2n: ["$150<span style=\"font-size:.5em\">–1,000</span>", "<bdi dir=\"ltr\">$150<span style=\"font-size:.5em\">–1,000</span></bdi>"],
  sv2l: ["a month people pay for <b>a writer, a designer, a consultant and two tools.</b>", "في الشهر يدفعها الناس <b>لكاتب ومصمّم ومستشار وأداتين.</b>"],
  sv3l: ["hours added to your week. <span class=\"strike\">design tools</span> <span class=\"strike\">designers</span> <span class=\"strike\">blank pages</span>", "ساعة إضافية في أسبوعك. <span class=\"strike\">أدوات تصميم</span> <span class=\"strike\">مصمّمون</span> <span class=\"strike\">صفحات فارغة</span>"],
  saveChip: ["<span style=\"margin-right:6px\">ⓘ</span><b>Illustrative</b><span class=\"savechip-rest\"> — figures reflect typical market rates, not a guarantee for every user.</span>", "<span style=\"margin-left:6px\">ⓘ</span><b>أرقام توضيحية</b><span class=\"savechip-rest\"> تعكس أسعار السوق المعتادة، وليست ضماناً لكل مستخدم.</span>"],
  howTag: ["It refuses to write first", "لا يكتب قبل أن يعرفك"],
  howH2a: ["Four stages.", "أربع مراحل."],
  howH2b: ["You are only in two of them.", "أنت في اثنتين منها فقط."],
  howSub: ["Every other tool writes on day one. KnownBy will not write until it knows you.", "كل الأدوات الأخرى تكتب من اليوم الأول. KnownBy لا يكتب حتى يعرفك."],
  howEb: ["The pipeline, end to end", "الرحلة من أولها إلى آخرها"],
  q1who: ["YOU · 1 SECOND", "أنت · ثانية واحدة"],
  q1big: ["Tap", "المس"],
  q1rest: ["anything worth keeping.", "كل ما يستحق الحفظ."],
  q1det: ["A button on any article. The argument, the figures and the source are all kept — you never copy or paste.", "زرّ على أي مقال. الفكرة والأرقام والمصدر تُحفظ كلها، ولا تنسخ ولا تلصق شيئاً."],
  q2who: ["KNOWNBY", "KnownBy"],
  q2big: ["Keep", "يحفظه"],
  q2rest: ["it in usable pieces.", "أجزاءً جاهزة للاستعمال."],
  q2det: ["Each save is broken into roughly nine pieces, so one article can feed a post now and another one in November.", "كل مقال تحفظه يُقسَّم إلى نحو تسعة أجزاء، فيغذّي منشوراً اليوم وآخر في نوفمبر."],
  q3who: ["KNOWNBY · OVERNIGHT", "KnownBy · في الليل"],
  q3big: ["Write", "يكتب"],
  q3rest: ["while you are asleep.", "وأنت نائم."],
  q3det: ["Agents read what you saved, find the idea that repeats, and draft it in your voice — source attached, carousel designed.", "يقرأ ما حفظته، ويلتقط الفكرة التي تتكرّر، ويكتبها بصوتك، ومعها مصدرها وكاروسيل مصمَّم."],
  q4who: ["YOU · 2 MINUTES", "أنت · دقيقتان"],
  q4big: ["Approve", "وافق"],
  q4rest: ["or change a word.", "أو غيّر كلمة."],
  q4det: ["The draft is waiting when you wake. Nothing is ever published without you pressing the button.", "المسودة تنتظرك حين تستيقظ. ولا يُنشر شيء قبل أن تضغط الزر بنفسك."],
  orderH3: ["Why the order<br><em>matters.</em>", "لماذا الترتيب<br><em>مهم.</em>"],
  orderP: ["KnownBy will not write a word until it has read you.", "KnownBy لا يكتب كلمة قبل أن يقرأك."],
  o1n: ["Learns first", "يتعلّم أولاً"],
  o1l: ["A tool that writes before it knows you hands everyone <b>the same paragraph.</b>", "الأداة التي تكتب قبل أن تعرفك تعطي الجميع <b>الفقرة نفسها.</b>"],
  o2n: ["Then writes", "ثم يكتب"],
  o2l: ["Your subjects, your evidence, <b>the way you open and close an idea.</b>", "مواضيعك، وأدلتك، <b>وطريقتك في فتح الفكرة وإغلاقها.</b>"],
  o3n: ["Then grows", "ثم يتطوّر"],
  o3l: ["Month six sounds far more like you <b>than month one did.</b>", "في الشهر السادس يشبهك <b>أكثر بكثير من الشهر الأول.</b>"],
  getTag: ["Free first, paid after", "المجاني أولاً، ثم المدفوع"],
  getH2a: ["See yourself.", "اعرف نفسك."],
  getH2b: ["Then be seen.", "ثم ليعرفك سوقك."],
  getSub: ["Two things. First you understand yourself — then the market understands you.", "أمران. تفهم نفسك أولاً، ثم يفهمك السوق."],
  getEb1: ["One · Your report", "أولاً · ملفك"],
  p1t: ["What you are good at", "ما تتقنه"],
  p1m: ["8 SKILLS RATED", "8 مهارات مقيَّمة"],
  p2t: ["The space that is yours", "المساحة التي لك"],
  p2m: ["NOBODY ELSE HOLDS IT", "لا يشغلها غيرك"],
  gapQuote: ["Others write the strategy, or install the system. Almost nobody changes how decisions and ownership work so it actually lands. <b>That gap is yours.</b>", "غيرك يكتب الاستراتيجية أو يركّب النظام. وقليل جداً من يغيّر طريقة اتخاذ القرار وتحديد المسؤولية حتى ينجح التغيير فعلاً. <b>هذه الفجوة لك.</b>"],
  subjects: ["Your three subjects — stop writing about ten", "مواضيعك الثلاثة، وكفى كتابةً عن عشرة"],
  pill1: ["Readiness as real capability", "جاهزية تتحوّل إلى قدرة"],
  pill2: ["Governance that lasts", "حوكمة تدوم"],
  pill3: ["Gaps to funded plans", "من الفجوات إلى خطط مموَّلة"],
  p3t: ["How others read you today", "كيف يراك غيرك اليوم"],
  p3m: ["TWO LENSES", "بعيون غيرك"],
  l1: ["THE HEADHUNTER", "مستشار التوظيف"],
  l1p: ["Strong on paper. But almost nothing published on the one story senior roles now ask for.", "قوي على الورق. لكنه لم ينشر شيئاً يُذكر عن القصة الوحيدة التي تسأل عنها المناصب العليا اليوم."],
  l2: ["THE CLIENT", "العميل"],
  l2p: ["Real depth. Yet only two posts on it — thin for someone who calls himself a specialist.", "عمق حقيقي. لكن عنده منشوران فقط عنه، وهذا قليل على من يقدّم نفسه متخصصاً."],
  l3: ["THE PEER", "الزميل"],
  l3p: ["I know he is good. I could not tell you what he is <em>known</em> for.", "أعرف أنه متمكّن. لكني لا أستطيع أن أقول لك بماذا <em>يُعرف</em>."],
  p4t: ["A few lines from a real report", "سطور من ملف حقيقي"],
  p4m: ["NAME REMOVED", "حُذف الاسم"],
  m1k: ["HOW THE MARKET SEES YOU", "كيف يراك السوق"],
  m1v: ["<b>The Strategic Architect</b> — the person who builds the machinery that makes change actually work.", "<b>المهندس الاستراتيجي</b>: من يبني الآلية التي تجعل التغيير ينجح فعلاً."],
  m2k: ["HOW YOU SOUND", "صوتك"],
  m2v: ["Direct about what breaks organisations. Written like someone who has sat through 200 meetings.", "مباشر في تسمية ما يعطّل المؤسسات. كتابة من حضر 200 اجتماع."],
  m3k: ["THE HONEST TRUTH", "بصراحة"],
  m3v: ["The barrier is not time or ideas. You have been treating your experience as knowledge instead of a position in the market.", "العائق ليس الوقت ولا الأفكار. أنت تعامل خبرتك على أنها معرفة، لا موقعاً في السوق."],
  getEb2: ["Two · Your posts and carousels", "ثانياً · منشوراتك والكاروسيل"],
  postName: ["Your name", "اسمك"],
  postTitle: ["Your title · 2h", "مسمّاك الوظيفي · قبل ساعتين"],
  postBody: ["Most utilities treat the digital twin as an IT project.<br><br>Then they find the real asset was never the twin — it was trust in the data.<br><br>One national utility spent 85 million on the full stack. Eighteen months later the operations team still makes every call from the old system.", "أغلب شركات المرافق تعامل التوأم الرقمي على أنه مشروع تقنية.<br><br>ثم تكتشف أن الأصل الحقيقي لم يكن التوأم، بل الثقة في البيانات.<br><br>شركة مرافق وطنية أنفقت 85 مليوناً على المنظومة كاملة. وبعد ثمانية عشر شهراً ما زال فريق التشغيل يتخذ كل قرار من النظام القديم."],
  srcline: ["MADE FROM AN ARTICLE YOU SAVED ON 14 JULY", "من مقال حفظته في 14 يوليو"],
  p5t: ["The carousel, designed for you", "الكاروسيل، مصمَّم لك"],
  p5m: ["NO DESIGNER NEEDED", "بلا مصمّم"],
  sl1: ["The twin was<br><span style=\"color:#00CEC9\">never the asset</span>", "التوأم لم يكن<br><span style=\"color:#00CEC9\">هو الأصل</span>"],
  sl2: ["85m spent<br><span style=\"font-size:10px;font-weight:500;opacity:.85\">over 18 months</span>", "85 مليوناً<br><span style=\"font-size:10px;font-weight:500;opacity:.85\">في 18 شهراً</span>"],
  sl3: ["Operations still<br>use the old system", "التشغيل ما زال<br>على النظام القديم"],
  sl4: ["Trust in the data<br>is the real asset", "الثقة في البيانات<br>هي الأصل الحقيقي"],
  chip1: ["No designer fee", "بلا أتعاب مصمّم"],
  chip2: ["No design tool", "بلا أداة تصميم"],
  chip3: ["No hours lost", "بلا ساعات ضائعة"],
  t1big: ["As often<br>as you like", "بالعدد<br>الذي تريد"],
  t1det: ["No weekly quota. Save two articles and publish two. Save ten and publish ten. It follows your reading, not a calendar.", "لا حصة أسبوعية. احفظ مقالين وانشر منشورين. احفظ عشرة وانشر عشرة. يتبع قراءتك، لا التقويم."],
  t2big: ["With the<br>source shown", "والمصدر<br>ظاهر"],
  t2det: ["Every post carries the article it came from. When someone asks “where did you get this?”, you have the answer ready.", "كل منشور يحمل المقال الذي جاء منه. وحين يسألك أحد: «من أين لك هذا؟» فجوابك جاهز."],
  t3big: ["In English<br>or Arabic", "بالعربية<br>أو الإنجليزية"],
  t3det: ["Each written properly in its own language. One is never a translation of the other.", "كل لغة مكتوبة بأصولها. لا واحدة منهما ترجمة للأخرى."],
  whyTag: ["The cost of one more quiet year", "ثمن سنة صامتة أخرى"],
  whyH2a: ["You read a lot.", "تقرأ كثيراً."],
  whyH2b: ["Nobody ever sees it.", "ولا أحد يرى ذلك."],
  whySub: ["Five hours a week of reading, and none of it reaches the people who decide about you.", "خمس ساعات قراءة كل أسبوع، ولا شيء منها يصل إلى من يقرّرون في شأنك."],
  ledHead: ["YOUR WEEK, AS A LEDGER", "أسبوعك في دفتر حساب"],
  ledDays: ["MON – FRI", "من الأحد إلى الخميس"],
  lr1m: ["The report you read at 6am", "التقرير الذي قرأته في السادسة صباحاً"],
  lr1s: ["Two sharp numbers you quoted all day", "رقمان دقيقان ردّدتهما طوال اليوم"],
  lr1x: ["GONE BY FRIDAY", "ضاع قبل نهاية الأسبوع"],
  lr2m: ["The argument you won in a meeting", "النقاش الذي كسبته في اجتماع"],
  lr2s: ["A position it took you years to be able to take", "موقف احتجت سنوات حتى تقدر على اتخاذه"],
  lr2x: ["NEVER WRITTEN", "لم يُكتب"],
  lr3m: ["The article you sent to a colleague", "المقال الذي أرسلته إلى زميل"],
  lr3s: ["With one line of your own on top — your best line that week", "وفوقه سطر منك، أفضل ما كتبته ذلك الأسبوع"],
  lr3x: ["LOST IN CHAT", "ضاع في المحادثات"],
  lr4m: ["The pattern you noticed before others", "النمط الذي لاحظته قبل غيرك"],
  lr4s: ["The thing that makes you worth calling", "وهو ما يجعل الناس يتصلون بك"],
  lr4x: ["IN YOUR HEAD ONLY", "في رأسك فقط"],
  totQ: ["What your market saw of all this", "ما رآه سوقك من هذا كله"],
  totA: ["NOTHING", "لا شيء"],
  turnH3: ["Same week. One tap different.", "الأسبوع نفسه. والفرق لمسة واحدة."],
  turnP: ["Everything above, kept the moment you touched it — with its source attached. By dawn the best of it is a draft in your voice: a post, a carousel, in English or Arabic. You read it over coffee and decide.", "كل ما سبق يُحفظ لحظة تلمسه، ومعه مصدره. وعند الفجر يصير أفضله مسودة بصوتك: منشور وكاروسيل، بالعربية أو الإنجليزية. تقرؤها مع قهوتك وتقرّر."],
  turnMono: ["SAME READING · SAME HOURS · NOTHING EXTRA TO DO", "القراءة نفسها · الساعات نفسها · ولا جهد إضافي"],
  whyEb: ["A year of your reading", "سنة من قراءتك"],
  calcCt: ["Change these to your own hours and rate.", "غيّر الأرقام إلى ساعاتك وقيمة ساعتك."],
  hrsLabel: ["Hours you read each week", "ساعات قراءتك في الأسبوع"],
  hrsAria: ["Hours you read each week", "ساعات قراءتك في الأسبوع"],
  rtLabel: ["An hour of your time is worth", "قيمة ساعة من وقتك"],
  rtAria: ["Value of an hour of your time", "قيمة ساعة من وقتك"],
  ownLine: ["<span id=\"own\">260 hrs</span> a year · <span id=\"cost\">SAR 78,000</span> of your own time", `<span id="own">${I("260")}</span> ساعة في السنة · <span id="cost">${I("SAR 78,000")}</span> من وقتك`],
  ghost: ["A ghostwriter charges SAR 1,000–3,000 a month — and writes from a briefing call, not from your actual reading.", "كاتب الظل يتقاضى من 1000 إلى 3000 ريال في الشهر، ويكتب من مكالمة تعريفية، لا من قراءتك الفعلية."],
  cmpTag: ["Against every other option", "مقارنةً بكل البدائل"],
  cmpH2a: ["They hand out templates.", "غيره يوزّع قوالب."],
  cmpH2b: ["We start with you.", "KnownBy يبدأ بك."],
  cmpSub: ["Every other tool gives all its customers the same shapes. KnownBy learns you first.", "كل الأدوات الأخرى تعطي عملاءها القوالب نفسها. KnownBy يتعرّف إليك أولاً."],
  cmpEb: ["Side by side", "وجهاً لوجه"],
  th1: ["AI chat<br>tools", "أدوات المحادثة الذكية"],
  th2: ["Content writing<br>tools", "أدوات كتابة المحتوى"],
  th3: ["Design<br>tools", "أدوات التصميم"],
  th4: ["Ghostwriters &amp;<br>content writers", "كتّاب الظل وكتّاب المحتوى"],
  r1: ["Learns what you are good at first", "يعرف أولاً ما تتقنه"],
  r2: ["Built on your own experience and reading", "مبني على خبرتك وقراءتك أنت"],
  r3: ["Not a template used by everyone", "ليس قالباً يستعمله الجميع"],
  r4: ["Writes in your own voice", "يكتب بصوتك"],
  r5: ["Shows the source behind each claim", "يُظهر المصدر وراء كل معلومة"],
  r6: ["Designs the carousel too", "يصمّم الكاروسيل أيضاً"],
  r7: ["Works while you sleep", "يعمل وأنت نائم"],
  r8: ["All of it in one place", "كل ذلك في مكان واحد"],
  legend: ["● FULLY &nbsp; ◐ PARTLY &nbsp; ○ NOT AT ALL", "● كاملاً &nbsp; ◐ جزئياً &nbsp; ○ لا"],
  c1big: ["Ready-made<br>templates", "قوالب<br>جاهزة"],
  c1det: ["A template is a shape someone else designed, handed to thousands of people. Your name goes on top, but the thinking inside is not yours — and it looks exactly like everyone else's.", "القالب شكل صمّمه غيرك ووُزّع على الآلاف. اسمك في أعلاه، لكن الفكر الذي فيه ليس فكرك، ويشبه ما عند الجميع تماماً."],
  c2big: ["They wait<br>for your words", "تنتظر<br>كلماتك"],
  c2det: ["A tool that starts empty needs you to know what to say, and to type it. If you already knew and had the time, you would have posted last week.", "الأداة التي تبدأ فارغة تحتاج أن تعرف أنت ما تقول، ثم تكتبه. ولو كنت تعرف وعندك الوقت، لنشرت الأسبوع الماضي."],
  c3big: ["We learn<br>you first", "KnownBy<br>يعرفك أولاً"],
  c3det: ["KnownBy respects what you already know. It reads your experience and your reading, works out what only you can say — and only then writes. <b>Nobody else gets your version.</b>", "KnownBy يحترم ما تعرفه. يقرأ خبرتك وقراءتك، ويستخرج ما لا يقوله غيرك، وبعدها فقط يكتب. <b>ونسختك لا يحصل عليها أحد غيرك.</b>"],
  payEb: ["What people pay for the pieces, every month", "ما يدفعه الناس لكل جزء، كل شهر"],
  pay1: ["A ghostwriter", "كاتب ظل"],
  pay2: ["A positioning consultant", "مستشار تموضع"],
  pay3: ["A designer", "مصمّم"],
  pay4: ["A posting tool", "أداة نشر"],
  pay5: ["An AI writing tool", "أداة كتابة بالذكاء الاصطناعي"],
  pay6: ["KnownBy, all of it", "KnownBy، كل ما سبق"],
  payP: [`Your report is free and stays free. The part that runs every night is ${SEAT_PRICE} — and a founding seat locks that price for as long as you keep it.`, `ملفك مجاني ويبقى مجانياً. والجزء الذي يعمل كل ليلة سعره ${I(SEAT_PRICE)}، والمقعد التأسيسي يثبّت لك هذا السعر ما دمت محتفظاً به.`],
  payNote: ["EXAMPLE FIGURES, ADJUSTABLE TO YOUR OWN HOURS AND RATE. WE DO NOT PROMISE FOLLOWERS OR LIKES.", "أرقام توضيحية يمكنك تعديلها بساعاتك وقيمة ساعتك. لا وعد بمتابعين ولا بإعجابات."],
  prTag: ["One road, one seat", "طريق واحد، ومقعد واحد"],
  prH2a: ["Seeing yourself is free.", "أن تعرف نفسك: مجاناً."],
  prH2b: ["Being seen is not.", "أن يعرفك سوقك: باشتراك."],
  prSub: ["One free road, walked in one sitting. One seat, if what you saw is worth keeping true.", "طريق مجاني تقطعه في جلسة واحدة. ومقعد واحد، إن رأيت ما يستحق أن تحافظ عليه."],
  roadLab: ["THE ROAD · FREE", "الطريق · مجاناً"],
  roadChip: ["STARTS WITHOUT AN ACCOUNT", "يبدأ دون حساب"],
  roadH3: ["See yourself the way the market does.", "شاهد نفسك بعين السوق."],
  roadFree: ["Free", "مجاناً"],
  roadFreeU: ["all of it, forever — not a trial", "كله، ودائماً. ليست فترة تجربة."],
  st1: ["MINUTE 1", "الدقيقة 1"],
  sh1: ["Paste your LinkedIn address", "الصق رابط صفحتك على LinkedIn"],
  sb1: ["That&rsquo;s all it asks to begin. No account, no card, no email.", "هذا كل ما يُطلب للبداية. لا حساب، ولا بطاقة، ولا بريد."],
  st2: ["MINUTE 3 · THE QUICK READ", "الدقيقة 3 · النظرة السريعة"],
  sh2: ["How you come across, in plain words", "كيف تبدو لغيرك، بكلام واضح"],
  sb2: ["Most people stop here and just look for a while.", "أغلب الناس يتوقفون هنا ويتأملون قليلاً."],
  st3: ["MINUTE 8 · IF YOU KEEP GOING", "الدقيقة 8 · إن أكملت"],
  sh3: ["Your CV against what&rsquo;s public", "سيرتك الذاتية مقارنةً بما هو منشور عنك"],
  sb3: ["Where the two disagree — and what each one is hiding.", "أين يختلفان، وما الذي يخفيه كل منهما."],
  st4: ["MINUTE 15 · THE FULL PICTURE", "الدقيقة 15 · الصورة كاملة"],
  sh4: ["Your capability map, your position, your three subjects", "خريطة قدراتك، وموقعك، ومواضيعك الثلاثة"],
  sb4: ["How a headhunter, a client and a peer each read you.", "وكيف يراك مستشار التوظيف والعميل والزميل."],
  st5: ["AT THE END — THE ONLY THING WE ASK", "في النهاية · الطلب الوحيد"],
  sh5: ["Your email, so the report is kept", "بريدك، حتى يُحفظ ملفك"],
  sb5: ["Asked once, at the end, when there&rsquo;s something worth keeping. The full report arrives as a PDF, and it&rsquo;s yours for good.", "يُطلب مرة واحدة، في النهاية، حين يصير عندك ما يستحق الحفظ. يصلك الملف كاملاً بصيغة PDF، ويبقى لك."],
  roadUndr: ["Stop anywhere. Everything to that point still happens.", "توقف متى شئت. وكل ما أنجزته حتى تلك اللحظة يبقى."],
  seatLab: ["THE SEAT · THE LOOP", "المقعد · الدورة المستمرة"],
  seatChip: ["FOUNDING · WAVES OF TEN", "التأسيسية · دفعات من عشرة"],
  seatH3: ["Then make sure people find out. Every week.", "ثم اجعل الناس يعرفون. كل أسبوع."],
  seatWho: ["The road tells you who you are. The seat is who you become, week after week — without adding work to your week.", "الطريق يعرّفك بنفسك. والمقعد يصنع ما تصير إليه، أسبوعاً بعد أسبوع، دون عمل إضافي في أسبوعك."],
  seatU: ["a month · locked while you keep the seat", "في الشهر · ثابت ما دمت محتفظاً بالمقعد"],
  tick1: ["Everything you read, kept and searchable for good", "كل ما تقرؤه محفوظ وقابل للبحث دائماً"],
  tick2: ["Posts and carousels written by dawn, in your voice", "منشورات وكاروسيل تُكتب قبل الفجر، بصوتك"],
  tick3: ["The source shown behind every claim", "المصدر ظاهر وراء كل معلومة"],
  tick4: ["English or Arabic — written, not translated", "بالعربية أو الإنجليزية، كتابةً لا ترجمة"],
  tick5: ["Your identity rewritten every quarter, as you move", "هويتك المهنية تُعاد كتابتها كل ثلاثة أشهر، مع تقدّمك"],
  seatLock: ["<b>Fifty founding seats, ten at a time</b> — because one founder sets each person up himself, properly. <b>The price belongs to your seat, not to a date.</b> Wave two opens when wave one members are publishing.", "<b>خمسون مقعداً تأسيسياً، عشرة في كل دفعة</b>، لأن المؤسس يجهّز حساب كل عضو بنفسه، كما ينبغي. <b>السعر مرتبط بمقعدك، لا بتاريخ.</b> والدفعة الثانية تُفتح حين يبدأ أعضاء الأولى بالنشر."],
  bridge: ["Walk the road first. The seat will still be here — and you&rsquo;ll know exactly what you&rsquo;re paying to keep alive.", "اقطع الطريق أولاً. المقعد سيبقى في مكانه، وستعرف بالضبط ما الذي تدفع لتحافظ عليه."],
  founderAlt: ["Mohammad Mahafdhah", "محمد محافظة"],
  founderT: ["<b>Mohammad Mahafdhah</b> — I built KnownBy from my own reading, because I had the same problem. Write to me directly and I will answer.", "<b>محمد محافظة</b>: بنيت KnownBy من قراءتي أنا، لأني عانيت المشكلة نفسها. اكتب لي مباشرة وسأردّ عليك."],
  faqTag: ["Answered straight", "أجوبة مباشرة"],
  faqH2a: ["What people ask", "ما يسأله الناس"],
  faqH2b: ["before joining.", "قبل الانضمام."],
  faqSub: ["No hedging and no small print. Where the answer is no, it says no.", "بلا مواربة ولا شروط مخفية. وحين يكون الجواب لا، أقول لا."],
  fq1: ["What does &ldquo;free&rdquo; mean exactly?", "ماذا تعني «مجاناً» بالضبط؟"],
  fa1: [`Your report is free permanently — not a trial. The part that runs every night, writing and designing while you sleep, is ${SEAT_PRICE}. A founding seat locks that price for as long as you keep it, and I onboard you personally. ${SEAT_NO_CARD}`, `ملفك مجاني دائماً، وليس فترة تجربة. والجزء الذي يعمل كل ليلة، فيكتب ويصمّم وأنت نائم، سعره ${I(SEAT_PRICE)}. المقعد التأسيسي يثبّت لك هذا السعر ما دمت محتفظاً به، وأجهّز حسابك بنفسي. ${I(SEAT_NO_CARD)}`],
  fq2: ["Can I stop?", "هل أستطيع التوقف؟"],
  fa2: ["Any month. Everything you kept and everything you wrote stays yours.", "في أي شهر. وكل ما حفظته وكتبته يبقى لك."],
  fq3: ["Will it sound like AI?", "هل سيبدو مكتوباً بالذكاء الاصطناعي؟"],
  fa3: ["It learns from what you have already written — how you open, how long your sentences run, how you land a point. And it deletes its own drafts that do not pass as you, before you ever see them. If one still gets through, you say so, and it learns.", "يتعلّم مما كتبته أنت: كيف تبدأ، وكم تطول جملك، وكيف تختم فكرتك. ويحذف من مسوداته ما لا يشبهك قبل أن تراه. وإن وصلتك مسودة لا تشبهك، قل ذلك، فيتعلّم."],
  fq4: ["How much of my time does this take?", "كم يأخذ من وقتي؟"],
  fa4: [`${ASSESSMENT_QUESTIONS_PHRASE.replace(/^./, (c) => c.toUpperCase())} once at the start. After that, one tap when you read something good, and about two minutes to approve a post. Nothing more.`, "تسعة أسئلة مرة واحدة في البداية. بعدها لمسة واحدة حين تقرأ شيئاً جيداً، ونحو دقيقتين لتوافق على منشور. لا أكثر."],
  fq5: ["How many posts will I get?", "كم منشوراً سأحصل عليه؟"],
  fa5: ["As many as you want. There is no weekly quota. Save two articles and you can publish two posts; save ten and you can publish ten. It follows your reading, not a calendar.", "بالعدد الذي تريد. لا حصة أسبوعية. احفظ مقالين فتنشر منشورين، واحفظ عشرة فتنشر عشرة. يتبع قراءتك، لا التقويم."],
  fq6: ["Do I need a designer for the carousels?", "هل أحتاج مصمّماً للكاروسيل؟"],
  fa6: ["No. KnownBy designs them for you, ready to post — no design tool, no design skill, no fee.", "لا. KnownBy يصمّمه لك جاهزاً للنشر. بلا أداة تصميم، ولا مهارة تصميم، ولا أتعاب."],
  fq7: ["Does it work in Arabic?", "هل يعمل بالعربية؟"],
  fa7: ["Yes. Arabic is written as Arabic and English as English. One is never a translation of the other.", "نعم. العربية تُكتب عربيةً والإنجليزية إنجليزيةً. لا واحدة منهما ترجمة للأخرى."],
  fq8: ["Who owns what I save?", "من يملك ما أحفظه؟"],
  fa8: ["You do. Your articles, your notes, your posts. We never use your work to help anyone else.", "أنت. مقالاتك وملاحظاتك ومنشوراتك. ولا يُستعمل عملك أبداً لمساعدة غيرك."],
  stillH3: ["Still deciding?<br><em style=\"font-style:italic;color:var(--ink4)\">Then just take the free report.</em>", "ما زلت تفكّر؟<br><em style=\"color:var(--ink4)\">خذ ملفك المجاني وحسب.</em>"],
  stillP: ["It is yours whether you ever pay us or not. If it shows you something you did not know about yourself, the seat will still be here.", "هو لك، دفعت يوماً أم لم تدفع. وإن أراك شيئاً لم تكن تعرفه عن نفسك، فالمقعد باقٍ في مكانه."],
  closing: ["Ninety seconds, free, and yours to keep.", "تسعون ثانية، مجاناً، ويبقى لك."],
  footLeft: ["KNOWNBY · AURA-INTEL.ORG · BUILT IN RIYADH", `${I("KNOWNBY")} · ${I("AURA-INTEL.ORG")} · بُني في الرياض`],
  fl1: ["Our story", "قصتنا"],
  fl2: ["Guide", "الدليل"],
  fl3: ["Security and trust", "الأمان والثقة"],
  fl4: ["Contact", "تواصل معنا"],
  fl5: ["Privacy", "الخصوصية"],
  fl6: ["Terms", "الشروط"],
  ringAria: ["", "رحلة KnownBy في تسع خطوات. الخطوة الأولى، تقييمك، مجانية. بعدها: تحفظ ما تقرأ، يرتّبه لك، أدلة جاهزة، جديد مجالك، بصوتك أنت، المسودة عند الفجر، تنشر، ثم النتيجة: مكانتك تتحرّك."],
  freeAria: [`${FREE_CTA_ARIA}`, "ابدأ تقييمك المجاني"],
  signOut: ["Sign out", "تسجيل الخروج"],
  openApp: ["Open KnownBy", "افتح KnownBy"],
  metaTitle: [`${\`KnownBy — ${BRAND.headline.replace(/\\.$/, "")}\`}`, "KnownBy: خبرتك أكبر مما تُظهره صفحتك"],
  metaDesc: ["KnownBy finds what makes you credible, organises the evidence behind it, and turns it into positioning, content and proof. The assessment is free and yours to keep.", "KnownBy يجد ما يجعلك موثوقاً، ويرتّب الأدلة عليه، ويحوّله إلى تموضع ومحتوى وإثبات. التقييم مجاني ويبقى لك."],
  bx1a: ["SEE YOURSELF", "اعرف نفسك"],
  bx1b: ["Your understanding", "فهمك لنفسك"],
  bx2a: ["NOTHING LOST", "لا يضيع شيء"],
  bx2b: ["Your knowledge, kept", "معرفتك محفوظة"],
  bx3a: ["IT COMPOSES", "يكتب عنك"],
  bx3b: ["Your content, written", "محتواك مكتوب"],
  bx4a: ["YOU ARE SEEN", "يراك سوقك"],
  bx4b: ["Your standing, measured", "مكانتك بالأرقام"],
  ringStart: ["▼ YOU START HERE · FREE", "▼ تبدأ من هنا · مجاناً"],
  dawn: ["02:00 → DAWN", `من ${I("02:00")} حتى الفجر`],
  pHead: ["02:00 → DAWN · YOU ARE ASLEEP", `من ${I("02:00")} حتى الفجر · وأنت نائم`],
  pk1: ["STAGE 1 · YOU", "المرحلة 1 · أنت"],
  pt1: ["You read", "تقرأ"],
  pd1a: ["One tap on an article", "لمسة واحدة على مقال"],
  pd1b: ["worth keeping.", "يستحق الحفظ."],
  pk2: ["STAGE 2 · KNOWNBY", "المرحلة 2 · KnownBy"],
  pt2: ["It keeps it", "يحفظه"],
  pd2a: ["Broken into pieces you", "أجزاء تستعملها بعد شهور."],
  pd2b: ["can use months later.", ""],
  pk3: ["STAGE 3 · KNOWNBY", "المرحلة 3 · KnownBy"],
  pt3: ["It writes", "يكتب"],
  pd3a: ["Finds the pattern and", "يلتقط الفكرة المتكرّرة"],
  pd3b: ["drafts in your style.", "ويكتبها بأسلوبك."],
  pk4: ["STAGE 4 · YOU", "المرحلة 4 · أنت"],
  pt4: ["You approve", "توافق"],
  pd4a: ["One click and it is live", "ضغطة واحدة ويظهر"],
  pd4b: ["on LinkedIn.", "على LinkedIn."],
  pEff: ["YOUR EFFORT", "جهدك"],
  pTot: ["≈ 2 minutes a day", "نحو دقيقتين في اليوم"],
  rd1: ["STRATEGY", "الاستراتيجية"],
  rd2: ["FORESIGHT", "الاستشراف"],
  rd3: ["DIGITAL", "الرقمي"],
  rd4: ["LEADERSHIP", "القيادة"],
  rd5: ["DELIVERY", "التنفيذ"],
  rd6: ["COMMERCIAL", "التجاري"],
  rd7: ["FINANCE", "المالية"],
  rd8: ["C-SUITE", "الإدارة العليا"],
  vn1: ["BIG PLANS", "الخطط الكبرى"],
  vn2: ["strategy people", "أهل الاستراتيجية"],
  vn3: ["REAL DELIVERY", "التنفيذ الفعلي"],
  vn4: ["systems people", "أهل الأنظمة"],
  vnYou: ["YOU", "أنت"],
  vnGap: ["THE GAP", "الفجوة"],
  yrToday: ["TODAY, WITHOUT KNOWNBY", "اليوم، دون KnownBy"],
  yrHours: ["260 hours of reading", `${I("260")} ساعة قراءة`],
  yrWritten: ["posts written", "منشورات مكتوبة"],
  yrCost: ["= SAR 78,000 OF YOUR OWN TIME, AND NOTHING TO SHOW", `= ${I("SAR 78,000")} من وقتك، ولا أثر لها`],
  yrWith: ["WITH KNOWNBY", "مع KnownBy"],
  yrSame: ["the same 260 hours", `الساعات نفسها: ${I("260")}`],
  yrP1: ["posts, in", "منشورات"],
  yrP2: ["your voice", "بصوتك"],
  empty: ["empty", "فارغ"],
} as const satisfies Record<string, readonly [string, string]>;

const RING_EN = `<svg viewBox="-120 -24 840 664" fill="none" role="img" aria-label="The nine-step KnownBy journey, running clockwise from step one. Step one, your assessment, is free. Then: capture what you read, organise it, evidence in fragments, your field's trends, tuned to your voice, the draft by dawn, you publish, and the outcome — your standing moves.">
        <circle cx="300" cy="300" r="200" stroke="#E2E7EE" stroke-width="1" stroke-dasharray="2 5" fill="none"/>

        <path d="M248.24 106.82 A200 200 0 0 1 351.76 106.82" stroke="#00CEC9" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M384.52 118.74 A200 200 0 0 1 441.42 441.42" stroke="#0984E3" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M414.72 463.83 A200 200 0 0 1 106.82 351.76" stroke="#0670C4" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M100.76 317.43 A200 200 0 0 1 248.24 106.82" stroke="#04477C" stroke-width="7" stroke-linecap="round" fill="none"/>

        <rect x="238" y="137" width="124" height="36" rx="10" fill="#E3F7F6"/>
        <text x="300" y="152" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" letter-spacing="1.3" fill="#00807B">SEE YOURSELF</text>
        <text x="300" y="166" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" font-weight="600" fill="#0A5F5C">Your understanding</text>

        <rect x="378.9" y="259.3" width="100" height="36" rx="10" fill="#E7F1FB"/>
        <text x="428.9" y="274.3" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" letter-spacing="1.3" fill="#0984E3">NOTHING LOST</text>
        <text x="428.9" y="288.3" text-anchor="middle" font-family="Inter, sans-serif" font-size="8.5" font-weight="600" fill="#04477C">Your knowledge, kept</text>

        <rect x="197.2" y="394.2" width="124" height="36" rx="10" fill="#E7F1FB"/>
        <text x="259.2" y="409.2" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" letter-spacing="1.3" fill="#0670C4">IT COMPOSES</text>
        <text x="259.2" y="423.2" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" font-weight="600" fill="#04477C">Your content, written</text>

        <rect x="143.2" y="207.2" width="100" height="36" rx="10" fill="#DCE6F0"/>
        <text x="193.2" y="222.2" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" letter-spacing="1.3" fill="#04477C">YOU ARE SEEN</text>
        <text x="193.2" y="236.2" text-anchor="middle" font-family="Inter, sans-serif" font-size="8" font-weight="600" fill="#0F1519">Your standing, measured</text>

        <circle cx="300" cy="300" r="72" fill="#0F1519"/>
        <text x="300" y="292" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="40" font-weight="600" fill="#FFFFFF">85</text>
        <text x="300" y="314" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9.5" letter-spacing="1.6" fill="#00CEC9">YOUR STANDING</text>
        <text x="300" y="332" text-anchor="middle" font-family="Inter, sans-serif" font-size="10.5" fill="#8E99A6">step 9 feeds this</text>

        <text x="300" y="24" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9.5" letter-spacing="1.7" fill="#00807B">▼ YOU START HERE · FREE</text>

        <a href="/assessment" aria-label="${FREE_CTA_ARIA}">
          <circle cx="300" cy="100" r="15" fill="#FFFFFF" stroke="#00CEC9" stroke-width="2.5"/>
          <text x="300" y="104.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="600" fill="#00807B">1</text>
          <text x="300" y="52" text-anchor="middle" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">Your assessment</text>
        </a>

        <circle cx="428.56" cy="146.8" r="13" fill="#FFFFFF" stroke="#9FCBEC"/>
        <text x="428.56" y="151" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0984E3">2</text>
        <text x="454.28" y="116.16" text-anchor="start" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">Capture what you read</text>
        <text x="454.28" y="132.16" text-anchor="start" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">one tap</text>

        <circle cx="496.96" cy="265.28" r="13" fill="#FFFFFF" stroke="#9FCBEC"/>
        <text x="496.96" y="269.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0984E3">3</text>
        <text x="536.35" y="258.34" text-anchor="start" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">Organise it</text>
        <text x="536.35" y="274.34" text-anchor="start" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">nothing lost</text>

        <circle cx="473.21" cy="400" r="13" fill="#FFFFFF" stroke="#9FCBEC"/>
        <text x="473.21" y="404.2" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0984E3">4</text>
        <text x="507.85" y="420" text-anchor="start" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">Evidence, in fragments</text>
        <text x="507.85" y="436" text-anchor="start" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">usable in November</text>

        <circle cx="368.4" cy="487.94" r="13" fill="#FFFFFF" stroke="#7FB2DC"/>
        <text x="368.4" y="492.14" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0670C4">5</text>
        <text x="382.08" y="525.53" text-anchor="start" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">Your field's trends</text>
        <text x="382.08" y="541.53" text-anchor="start" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">matched to you</text>

        <circle cx="231.6" cy="487.94" r="13" fill="#FFFFFF" stroke="#7FB2DC"/>
        <text x="231.6" y="492.14" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0670C4">6</text>
        <text x="217.92" y="525.53" text-anchor="end" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">Tuned to your voice</text>
        <text x="217.92" y="541.53" text-anchor="end" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">learned, not guessed</text>

        <circle cx="126.79" cy="400" r="13" fill="#FFFFFF" stroke="#7FB2DC"/>
        <text x="126.79" y="404.2" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0670C4">7</text>
        <text x="92.15" y="420" text-anchor="end" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">The draft</text>
        <text x="92.15" y="436" text-anchor="end" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">by dawn</text>

        <circle cx="103.04" cy="265.28" r="13" fill="#FFFFFF" stroke="#5C87AF"/>
        <text x="103.04" y="269.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#04477C">8</text>
        <text x="63.65" y="258.34" text-anchor="end" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">You publish</text>
        <text x="63.65" y="274.34" text-anchor="end" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">one click</text>

        <circle cx="171.44" cy="146.8" r="13" fill="#FFFFFF" stroke="#5C87AF"/>
        <text x="171.44" y="151" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#04477C">9</text>
        <text x="145.72" y="116.16" text-anchor="end" font-family="Inter, sans-serif" font-size="12.5" font-weight="600" fill="#0F1519">The outcome</text>
        <text x="145.72" y="132.16" text-anchor="end" font-family="Inter, sans-serif" font-size="10.5" fill="#66707D">your standing moves</text>
      </svg>`;
const RING_AR = (t: LandingStrings) => `<svg viewBox="-120 -24 840 664" fill="none" role="img" aria-label="${t.ringAria}">
        <circle cx="300" cy="300" r="200" stroke="#E2E7EE" stroke-width="1" stroke-dasharray="2 5" fill="none"/>

        <path d="M248.24 106.82 A200 200 0 0 1 351.76 106.82" stroke="#00CEC9" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M384.52 118.74 A200 200 0 0 1 441.42 441.42" stroke="#0984E3" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M414.72 463.83 A200 200 0 0 1 106.82 351.76" stroke="#0670C4" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M100.76 317.43 A200 200 0 0 1 248.24 106.82" stroke="#04477C" stroke-width="7" stroke-linecap="round" fill="none"/>

        <rect x="224" y="135" width="152" height="40" rx="10" fill="#E3F7F6"/>
        <text x="300" y="152" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#00807B" text-anchor="middle" direction="rtl">${t.bx1a}</text>
        <text x="300" y="166" font-family="CairoAR, Cairo, sans-serif" font-size="10.6" font-weight="600" fill="#0A5F5C" text-anchor="middle" direction="rtl">${t.bx1b}</text>

        <rect x="364.9" y="257.3" width="128" height="40" rx="10" fill="#E7F1FB"/>
        <text x="428.9" y="274.3" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#0984E3" text-anchor="middle" direction="rtl">${t.bx2a}</text>
        <text x="428.9" y="288.3" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" font-weight="600" fill="#04477C" text-anchor="middle" direction="rtl">${t.bx2b}</text>

        <rect x="183.2" y="392.2" width="152" height="40" rx="10" fill="#E7F1FB"/>
        <text x="259.2" y="409.2" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#0670C4" text-anchor="middle" direction="rtl">${t.bx3a}</text>
        <text x="259.2" y="423.2" font-family="CairoAR, Cairo, sans-serif" font-size="10.6" font-weight="600" fill="#04477C" text-anchor="middle" direction="rtl">${t.bx3b}</text>

        <rect x="129.2" y="205.2" width="128" height="40" rx="10" fill="#DCE6F0"/>
        <text x="193.2" y="222.2" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#04477C" text-anchor="middle" direction="rtl">${t.bx4a}</text>
        <text x="193.2" y="236.2" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" font-weight="600" fill="#0F1519" text-anchor="middle" direction="rtl">${t.bx4b}</text>

        <circle cx="300" cy="300" r="72" fill="#0F1519"/>
        <text x="300" y="292" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="40" font-weight="600" fill="#FFFFFF" direction="ltr">85</text>
        <text x="300" y="314" font-family="CairoAR, Cairo, sans-serif" font-size="10.6" fill="#00CEC9" text-anchor="middle" direction="rtl">${t.dialP}</text>
        <text x="300" y="332" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#8E99A6" text-anchor="middle" direction="rtl">${t.dialC}</text>

        <text x="300" y="24" font-family="CairoAR, Cairo, sans-serif" font-size="10.6" fill="#00807B" text-anchor="middle" direction="rtl">${t.ringStart}</text>

        <a href="/assessment" aria-label="${t.freeAria}">
          <circle cx="300" cy="100" r="15" fill="#FFFFFF" stroke="#00CEC9" stroke-width="2.5"/>
          <text x="300" y="104.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="600" fill="#00807B" direction="ltr">1</text>
          <text x="300" y="52" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="middle" direction="rtl">${t.s1t}</text>
        </a>

        <circle cx="428.56" cy="146.8" r="13" fill="#FFFFFF" stroke="#9FCBEC"/>
        <text x="428.56" y="151" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0984E3" direction="ltr">2</text>
        <text x="454.28" y="116.16" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="end" direction="rtl">${t.s2t}</text>
        <text x="454.28" y="132.16" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="end" direction="rtl">${t.s2s}</text>

        <circle cx="496.96" cy="265.28" r="13" fill="#FFFFFF" stroke="#9FCBEC"/>
        <text x="496.96" y="269.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0984E3" direction="ltr">3</text>
        <text x="536.35" y="258.34" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="end" direction="rtl">${t.s3t}</text>
        <text x="536.35" y="274.34" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="end" direction="rtl">${t.s3s}</text>

        <circle cx="473.21" cy="400" r="13" fill="#FFFFFF" stroke="#9FCBEC"/>
        <text x="473.21" y="404.2" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0984E3" direction="ltr">4</text>
        <text x="507.85" y="420" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="end" direction="rtl">${t.s4t}</text>
        <text x="507.85" y="436" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="end" direction="rtl">${t.s4s}</text>

        <circle cx="368.4" cy="487.94" r="13" fill="#FFFFFF" stroke="#7FB2DC"/>
        <text x="368.4" y="492.14" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0670C4" direction="ltr">5</text>
        <text x="382.08" y="525.53" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="end" direction="rtl">${t.s5t}</text>
        <text x="382.08" y="541.53" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="end" direction="rtl">${t.s5s}</text>

        <circle cx="231.6" cy="487.94" r="13" fill="#FFFFFF" stroke="#7FB2DC"/>
        <text x="231.6" y="492.14" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0670C4" direction="ltr">6</text>
        <text x="217.92" y="525.53" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="start" direction="rtl">${t.s6t}</text>
        <text x="217.92" y="541.53" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="start" direction="rtl">${t.s6s}</text>

        <circle cx="126.79" cy="400" r="13" fill="#FFFFFF" stroke="#7FB2DC"/>
        <text x="126.79" y="404.2" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#0670C4" direction="ltr">7</text>
        <text x="92.15" y="420" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="start" direction="rtl">${t.s7t}</text>
        <text x="92.15" y="436" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="start" direction="rtl">${t.s7s}</text>

        <circle cx="103.04" cy="265.28" r="13" fill="#FFFFFF" stroke="#5C87AF"/>
        <text x="103.04" y="269.5" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#04477C" direction="ltr">8</text>
        <text x="63.65" y="258.34" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="start" direction="rtl">${t.s8t}</text>
        <text x="63.65" y="274.34" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="start" direction="rtl">${t.s8s}</text>

        <circle cx="171.44" cy="146.8" r="13" fill="#FFFFFF" stroke="#5C87AF"/>
        <text x="171.44" y="151" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#04477C" direction="ltr">9</text>
        <text x="145.72" y="116.16" font-family="CairoAR, Cairo, sans-serif" font-size="14.0" font-weight="600" fill="#0F1519" text-anchor="start" direction="rtl">${t.s9t}</text>
        <text x="145.72" y="132.16" font-family="CairoAR, Cairo, sans-serif" font-size="11.8" fill="#66707D" text-anchor="start" direction="rtl">${t.s9s}</text>
      </svg>`;
const PIPE_EN = `<svg viewBox="0 0 900 300" fill="none">
      <rect x="222" y="18" width="440" height="176" rx="16" fill="#0F1519"/>
      <text x="442" y="46" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="1.6" fill="#00CEC9">02:00 → DAWN · YOU ARE ASLEEP</text>

      <rect x="10" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#0670C4" stroke-width="1.4"/>
      <text x="30" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#0670C4">STAGE 1 · YOU</text>
      <text x="30" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F1519">You read</text>
      <text x="30" y="134" font-family="Inter, sans-serif" font-size="12" fill="#66707D">One tap on an article</text>
      <text x="30" y="150" font-family="Inter, sans-serif" font-size="12" fill="#66707D">worth keeping.</text>

      <path d="M212 111h22" stroke="#D2D8E0" stroke-width="1.4"/><path d="M230 106l7 5-7 5" fill="#D2D8E0"/>

      <rect x="240" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#E2E7EE"/>
      <text x="260" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#9AA4B0">STAGE 2 · KNOWNBY</text>
      <text x="260" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F1519">It keeps it</text>
      <text x="260" y="134" font-family="Inter, sans-serif" font-size="12" fill="#66707D">Broken into pieces you</text>
      <text x="260" y="150" font-family="Inter, sans-serif" font-size="12" fill="#66707D">can use months later.</text>

      <path d="M442 111h22" stroke="#37424F" stroke-width="1.4"/><path d="M460 106l7 5-7 5" fill="#37424F"/>

      <rect x="470" y="58" width="180" height="106" rx="12" fill="#141D2C" stroke="#2A3648"/>
      <circle class="pulse" cx="628" cy="80" r="4" fill="#00CEC9"/>
      <text x="490" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#00CEC9">STAGE 3 · KNOWNBY</text>
      <text x="490" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#FFFFFF">It writes</text>
      <text x="490" y="134" font-family="Inter, sans-serif" font-size="12" fill="#8E99A6">Finds the pattern and</text>
      <text x="490" y="150" font-family="Inter, sans-serif" font-size="12" fill="#8E99A6">drafts in your style.</text>

      <path d="M666 111h22" stroke="#D2D8E0" stroke-width="1.4"/><path d="M684 106l7 5-7 5" fill="#D2D8E0"/>

      <rect x="694" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#0670C4" stroke-width="1.4"/>
      <text x="714" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#0670C4">STAGE 4 · YOU</text>
      <text x="714" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F1519">You approve</text>
      <text x="714" y="134" font-family="Inter, sans-serif" font-size="12" fill="#66707D">One click and it is live</text>
      <text x="714" y="150" font-family="Inter, sans-serif" font-size="12" fill="#66707D">on LinkedIn.</text>

      <text x="10" y="238" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.6" fill="#9AA4B0">YOUR EFFORT</text>
      <rect x="10" y="252" width="196" height="10" rx="5" fill="#0670C4"/>
      <rect x="240" y="252" width="410" height="10" rx="5" fill="#EFF4FA"/>
      <rect x="694" y="252" width="196" height="10" rx="5" fill="#0670C4"/>
      <text x="890" y="238" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="1" fill="#66707D">≈ 2 minutes a day</text>
    </svg>`;
const PIPE_AR = (t: LandingStrings) => `<svg viewBox="0 0 900 300" fill="none">
      <g transform="translate(900 0) scale(-1 1)">
      <rect x="222" y="18" width="440" height="176" rx="16" fill="#0F1519"/>
      <rect x="10" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#0670C4" stroke-width="1.4"/>
      <path d="M212 111h22" stroke="#D2D8E0" stroke-width="1.4"/><path d="M230 106l7 5-7 5" fill="#D2D8E0"/>
      <rect x="240" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#E2E7EE"/>
      <path d="M442 111h22" stroke="#37424F" stroke-width="1.4"/><path d="M460 106l7 5-7 5" fill="#37424F"/>
      <rect x="470" y="58" width="180" height="106" rx="12" fill="#141D2C" stroke="#2A3648"/>
      <circle class="pulse" cx="628" cy="80" r="4" fill="#00CEC9"/>
      <path d="M666 111h22" stroke="#D2D8E0" stroke-width="1.4"/><path d="M684 106l7 5-7 5" fill="#D2D8E0"/>
      <rect x="694" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#0670C4" stroke-width="1.4"/>
      <rect x="10" y="252" width="196" height="10" rx="5" fill="#0670C4"/>
      <rect x="240" y="252" width="410" height="10" rx="5" fill="#EFF4FA"/>
      <rect x="694" y="252" width="196" height="10" rx="5" fill="#0670C4"/>
    </g>
      <text x="458" y="46" font-family="CairoAR, Cairo, sans-serif" font-size="11.2" fill="#00CEC9" text-anchor="middle" direction="rtl">${t.pHead}</text>
      <text x="870" y="84" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#0670C4" text-anchor="start" direction="rtl">${t.pk1}</text>
      <text x="870" y="110" font-family="CairoAR, Cairo, sans-serif" font-size="20.2" font-weight="700" fill="#0F1519" text-anchor="start" direction="rtl">${t.pt1}</text>
      <text x="870" y="134" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.pd1a}</text>
      <text x="870" y="150" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.pd1b}</text>
      <text x="640" y="84" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#9AA4B0" text-anchor="start" direction="rtl">${t.pk2}</text>
      <text x="640" y="110" font-family="CairoAR, Cairo, sans-serif" font-size="20.2" font-weight="700" fill="#0F1519" text-anchor="start" direction="rtl">${t.pt2}</text>
      <text x="640" y="134" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.pd2a}</text>
      <text x="640" y="150" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.pd2b}</text>
      <text x="410" y="84" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#00CEC9" text-anchor="start" direction="rtl">${t.pk3}</text>
      <text x="410" y="110" font-family="CairoAR, Cairo, sans-serif" font-size="20.2" font-weight="700" fill="#FFFFFF" text-anchor="start" direction="rtl">${t.pt3}</text>
      <text x="410" y="134" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#8E99A6" text-anchor="start" direction="rtl">${t.pd3a}</text>
      <text x="410" y="150" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#8E99A6" text-anchor="start" direction="rtl">${t.pd3b}</text>
      <text x="186" y="84" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#0670C4" text-anchor="start" direction="rtl">${t.pk4}</text>
      <text x="186" y="110" font-family="CairoAR, Cairo, sans-serif" font-size="20.2" font-weight="700" fill="#0F1519" text-anchor="start" direction="rtl">${t.pt4}</text>
      <text x="186" y="134" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.pd4a}</text>
      <text x="186" y="150" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.pd4b}</text>
      <text x="890" y="238" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#9AA4B0" text-anchor="start" direction="rtl">${t.pEff}</text>
      <text x="10" y="238" font-family="CairoAR, Cairo, sans-serif" font-size="11.2" fill="#66707D" text-anchor="end" direction="rtl">${t.pTot}</text>
    </svg>`;
const RADARG_EN = `<g font-family="IBM Plex Mono, monospace" font-size="7.4" letter-spacing=".9" fill="#9AA4B0">
            <text x="160" y="18" text-anchor="middle">STRATEGY</text>
            <text x="248" y="52" text-anchor="middle">FORESIGHT</text>
            <text x="284" y="118" text-anchor="middle">DIGITAL</text>
            <text x="242" y="188" text-anchor="middle">LEADERSHIP</text>
            <text x="160" y="212" text-anchor="middle">DELIVERY</text>
            <text x="74" y="188" text-anchor="middle">COMMERCIAL</text>
            <text x="34" y="118" text-anchor="middle" fill="#9A6F12">FINANCE</text>
            <text x="70" y="46" text-anchor="middle" fill="#9A6F12">C-SUITE</text>
          </g>`;
const RADARG_AR = (t: LandingStrings) => `<g font-family="CairoAR, Cairo, sans-serif" font-size="8.6" direction="rtl" fill="#9AA4B0">
            <text x="160" y="18" text-anchor="middle" direction="rtl">${t.rd1}</text>
            <text x="248" y="52" text-anchor="middle" direction="rtl">${t.rd2}</text>
            <text x="284" y="118" text-anchor="middle" direction="rtl">${t.rd3}</text>
            <text x="242" y="188" text-anchor="middle" direction="rtl">${t.rd4}</text>
            <text x="160" y="212" text-anchor="middle" direction="rtl">${t.rd5}</text>
            <text x="74" y="188" text-anchor="middle" direction="rtl">${t.rd6}</text>
            <text x="34" y="118" fill="#9A6F12" text-anchor="middle" direction="rtl">${t.rd7}</text>
            <text x="70" y="46" fill="#9A6F12" text-anchor="middle" direction="rtl">${t.rd8}</text>
          </g>`;
const VENN_EN = `<svg viewBox="0 0 300 118" fill="none" style="width:100%;height:auto">
          <circle cx="112" cy="59" r="52" fill="#0670C4" fill-opacity=".1" stroke="#0670C4"/>
          <circle cx="188" cy="59" r="52" fill="#00CEC9" fill-opacity=".12" stroke="#00807B"/>
          <path d="M150 14a52 52 0 0 1 0 90 52 52 0 0 1 0-90Z" fill="#0F1519"/>
          <text x="70" y="54" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" letter-spacing="1" fill="#0670C4">BIG PLANS</text>
          <text x="70" y="68" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="#66707D">strategy people</text>
          <text x="232" y="54" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" letter-spacing="1" fill="#00807B">REAL DELIVERY</text>
          <text x="232" y="68" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="#66707D">systems people</text>
          <text x="150" y="57" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">YOU</text>
          <text x="150" y="71" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="7.5" letter-spacing="1.2" fill="#00CEC9">THE GAP</text>
        </svg>`;
const VENN_AR = (t: LandingStrings) => `<svg viewBox="0 0 300 118" fill="none" style="width:100%;height:auto">
          <circle cx="112" cy="59" r="52" fill="#0670C4" fill-opacity=".1" stroke="#0670C4"/>
          <circle cx="188" cy="59" r="52" fill="#00CEC9" fill-opacity=".12" stroke="#00807B"/>
          <path d="M150 14a52 52 0 0 1 0 90 52 52 0 0 1 0-90Z" fill="#0F1519"/>
          <text x="70" y="54" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#0670C4" text-anchor="middle" direction="rtl">${t.vn1}</text>
          <text x="70" y="68" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#66707D" text-anchor="middle" direction="rtl">${t.vn2}</text>
          <text x="232" y="54" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#00807B" text-anchor="middle" direction="rtl">${t.vn3}</text>
          <text x="232" y="68" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#66707D" text-anchor="middle" direction="rtl">${t.vn4}</text>
          <text x="150" y="57" font-family="CairoAR, Cairo, sans-serif" font-size="14.6" font-weight="700" fill="#FFFFFF" text-anchor="middle" direction="rtl">${t.vnYou}</text>
          <text x="150" y="71" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#00CEC9" text-anchor="middle" direction="rtl">${t.vnGap}</text>
        </svg>`;
const YEAR_EN = `<svg viewBox="0 0 900 250" fill="none">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0670C4"/><stop offset="1" stop-color="#EFF4FA"/></linearGradient>
        <linearGradient id="rise" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E0F7F6"/><stop offset="1" stop-color="#00CEC9"/></linearGradient>
      </defs>
      <text x="10" y="20" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.5" fill="#9AA4B0">TODAY, WITHOUT KNOWNBY</text>
      <rect x="10" y="32" width="600" height="46" rx="10" fill="url(#fade)"/>
      <text x="30" y="61" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" id="dHours">260 hours of reading</text>
      <path class="dash" d="M618 55h100" stroke="#C0392B" stroke-width="1.4"/>
      <circle cx="760" cy="55" r="34" fill="#FDECEA" stroke="#C0392B" stroke-width="1.4"/>
      <text x="760" y="63" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="24" font-weight="600" fill="#C0392B">0</text>
      <text x="822" y="59" font-family="Inter, sans-serif" font-size="12" fill="#66707D">posts written</text>
      <text x="10" y="100" font-family="IBM Plex Mono, monospace" font-size="9.5" letter-spacing="1.3" fill="#C0392B" id="dCost">= SAR 78,000 OF YOUR OWN TIME, AND NOTHING TO SHOW</text>
      <path d="M10 122h880" stroke="#E2E7EE"/>
      <text x="10" y="152" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.5" fill="#00807B">WITH KNOWNBY</text>
      <rect x="10" y="164" width="600" height="46" rx="10" fill="url(#rise)"/>
      <text x="30" y="193" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#0F1519" id="dHours2">the same 260 hours</text>
      <path d="M618 187h100" stroke="#00CEC9" stroke-width="1.8"/>
      <circle cx="760" cy="187" r="34" fill="#0F1519"/>
      <text x="760" y="195" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="#00CEC9">50+</text>
      <text x="822" y="184" font-family="Inter, sans-serif" font-size="12" fill="#66707D">posts, in</text>
      <text x="822" y="200" font-family="Inter, sans-serif" font-size="12" fill="#66707D">your voice</text>
    </svg>`;
const YEAR_AR = (t: LandingStrings) => `<svg viewBox="0 0 900 250" fill="none">
      <g transform="translate(900 0) scale(-1 1)">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0670C4"/><stop offset="1" stop-color="#EFF4FA"/></linearGradient>
        <linearGradient id="rise" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E0F7F6"/><stop offset="1" stop-color="#00CEC9"/></linearGradient>
      </defs>
      <rect x="10" y="32" width="600" height="46" rx="10" fill="url(#fade)"/>
      <path class="dash" d="M618 55h100" stroke="#C0392B" stroke-width="1.4"/>
      <circle cx="760" cy="55" r="34" fill="#FDECEA" stroke="#C0392B" stroke-width="1.4"/>
      <path d="M10 122h880" stroke="#E2E7EE"/>
      <rect x="10" y="164" width="600" height="46" rx="10" fill="url(#rise)"/>
      <path d="M618 187h100" stroke="#00CEC9" stroke-width="1.8"/>
      <circle cx="760" cy="187" r="34" fill="#0F1519"/>
    </g>
      <text x="890" y="20" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#9AA4B0" text-anchor="start" direction="rtl">${t.yrToday}</text>
      <text x="870" y="61" font-family="CairoAR, Cairo, sans-serif" font-size="17.9" font-weight="700" fill="#FFFFFF" id="dHours" text-anchor="start" direction="rtl">${t.yrHours}</text>
      <text x="760" y="63" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="24" font-weight="600" fill="#C0392B" direction="ltr">0</text>
      <text x="98" y="59" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.yrWritten}</text>
      <text x="890" y="100" font-family="CairoAR, Cairo, sans-serif" font-size="10.6" fill="#C0392B" id="dCost" text-anchor="start" direction="rtl">${t.yrCost}</text>
      <text x="890" y="152" font-family="CairoAR, Cairo, sans-serif" font-size="10.1" fill="#00807B" text-anchor="start" direction="rtl">${t.yrWith}</text>
      <text x="870" y="193" font-family="CairoAR, Cairo, sans-serif" font-size="17.9" font-weight="700" fill="#0F1519" id="dHours2" text-anchor="start" direction="rtl">${t.yrSame}</text>
      <text x="760" y="195" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="#00CEC9" direction="ltr">50+</text>
      <text x="98" y="184" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.yrP1}</text>
      <text x="98" y="200" font-family="CairoAR, Cairo, sans-serif" font-size="13.4" fill="#66707D" text-anchor="start" direction="rtl">${t.yrP2}</text>
    </svg>`;
const DAWN_EN = `<text x="12" y="68" font-family="IBM Plex Mono, monospace" font-size="7.5" letter-spacing="1.1" fill="#8E99A6">02:00 → DAWN</text>`;
const DAWN_AR = (t: LandingStrings) => `<text x="43" y="68" font-family="CairoAR, Cairo, sans-serif" font-size="9.5" fill="#8E99A6" text-anchor="middle" direction="rtl">${t.dawn}</text>`;
const EMPTY_EN = `<text x="48" y="45" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#9AA4B0">empty</text>`;
const EMPTY_AR = (t: LandingStrings) => `<text x="48" y="45" font-family="CairoAR, Cairo, sans-serif" font-size="11.2" fill="#9AA4B0" text-anchor="middle" direction="rtl">${t.empty}</text>`;
const DESC_EN = `<span class="tag" style="background:var(--cyantint);color:var(--cyanT)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="3" fill="#00807B"/></svg> AI Professional Identity Platform</span>`;

export const landingHtml = (t: LandingStrings, ar: boolean) => `
<svg style="display:none"><symbol id="m" viewBox="0 0 64 64"><g stroke="currentColor" fill="currentColor" stroke-linecap="round"><circle cx="32" cy="32" r="6.85" stroke="none"/><line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/><line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/><line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/><line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/><line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/><line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/><line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/><line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/><line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/><line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/><line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/></g><g stroke="#00CEC9" fill="#00CEC9" stroke-linecap="round"><line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/><circle cx="49.24" cy="9.94" r="1.61"/></g></symbol></svg>

<div class="navshell">
  <nav class="nav">
    <a class="brand" href="#" data-p="home"><svg class="mark"><use href="#m"/></svg><span class="bn">KnownBy</span></a>
    <div class="links">
      <button data-p="home" class="on">${t.navHome}</button>
      <button data-p="how">${t.navHow}</button>
      <button data-p="get">${t.navGet}</button>
      <button data-p="why">${t.navWhy}</button>
      <button data-p="cmp">${t.navCmp}</button>
      <button data-p="price">${t.navPrice}</button>
    </div>
    <a class="navalt" id="navalt" href="/auth">${t.signIn}</a>
    <a class="navcta" id="navcta" href="/assessment">${t.navCtaInner}</a>
  </nav>
</div>

<div class="stage">

<section class="pg on" id="home">
  <div class="hero">
    <div>
      ${ar ? "" : DESC_EN}
      <h1>${t.headLead}<br><span class="grad">${t.headTail}</span></h1>
      <p class="sub">${t.heroSub}</p>
      <div class="acts">
        <a class="btn bp" id="heropri" href="/assessment">${t.freeCta}</a>
      </div>
      <p class="support">${t.heroSupport}</p>
    </div>
    <div class="loopwrap">
      <div class="jring">
      ${ar ? RING_AR(t) : RING_EN}
      </div>

      <div class="jrail">
        <p class="rstart">${t.rStart}</p>
        <p class="rkick ka">${t.rk1}</p>
        <div class="rrow first ra"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s1t}</span><span class="rs" style="display:block">${t.s1s}</span></span></div>
        <p class="rkick kb">${t.rk2}</p>
        <div class="rrow rb"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s2t}</span><span class="rs" style="display:block">${t.s2s}</span></span></div>
        <div class="rrow rb"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s3t}</span><span class="rs" style="display:block">${t.s3s}</span></span></div>
        <div class="rrow rb"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s4t}</span><span class="rs" style="display:block">${t.s4s}</span></span></div>
        <p class="rkick kc">${t.rk3}</p>
        <div class="rrow rc"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s5t}</span><span class="rs" style="display:block">${t.s5s}</span></span></div>
        <div class="rrow rc"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s6t}</span><span class="rs" style="display:block">${t.s6s}</span></span></div>
        <div class="rrow rc"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s7t}</span><span class="rs" style="display:block">${t.s7s}</span></span></div>
        <p class="rkick kd">${t.rk4}</p>
        <div class="rrow rd"><span class="rbead"><i></i><u></u></span><span><span class="rt">${t.s8t}</span><span class="rs" style="display:block">${t.s8s}</span></span></div>
        <div class="rrow rd"><span class="rbead"><i></i></span><span><span class="rt">${t.s9t}</span><span class="rs" style="display:block">${t.s9s}</span></span></div>
        <div class="rdial"><div class="n">85</div><div class="p">${t.dialP}</div><div class="c">${t.dialC}</div></div>
        <a class="btn bp rbtn" href="/assessment">${t.freeCta}</a>
      </div>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:56px">${t.ebDoes}</div>
  <div class="trio rv">
    <div class="bene">
      <span class="step">01</span>
      <div class="viz"><svg width="120" height="90" viewBox="0 0 120 90" fill="none">
        <circle cx="60" cy="45" r="34" stroke="#E2E7EE"/><circle cx="60" cy="45" r="22" stroke="#EFF4FA"/>
        <circle cx="60" cy="45" r="30" stroke="#E0A82E" stroke-width="1.2" stroke-dasharray="3 4"/>
        <path d="M60 11v68M26 45h68M36 21l48 48M84 21L36 69" stroke="#EFF4FA"/>
        <path d="M60 19 84 34 78 62 60 72 38 60 34 33Z" fill="#0670C4" fill-opacity=".18" stroke="#0670C4" stroke-width="1.4"/>
      </svg></div>
      <div class="big b">${t.know}</div>
      <div class="rest">${t.knowRest}</div>
      <div class="det">${t.knowDet}</div>
    </div>
    <div class="bene">
      <span class="step">02</span>
      <div class="viz"><svg width="150" height="90" viewBox="0 0 150 90" fill="none">
        <rect x="2" y="26" width="34" height="42" rx="5" fill="#FFF" stroke="#E2E7EE"/>
        <rect x="14" y="20" width="34" height="42" rx="5" fill="#FFF" stroke="#D2D8E0"/>
        <rect x="26" y="14" width="34" height="42" rx="5" fill="#FFF" stroke="#0670C4"/>
        <path class="dash" d="M64 40h22" stroke="#00CEC9" stroke-width="1.4"/>
        <rect x="90" y="14" width="56" height="60" rx="10" fill="#0F1519"/>
        <g fill="#00CEC9"><circle cx="104" cy="30" r="3"/><circle cx="118" cy="30" r="3"/><circle cx="132" cy="30" r="3"/><circle class="pulse" cx="104" cy="44" r="3"/><circle cx="118" cy="44" r="3"/><circle cx="132" cy="44" r="3"/><circle cx="104" cy="58" r="3"/><circle cx="118" cy="58" r="3"/><circle cx="132" cy="58" r="3"/></g>
      </svg></div>
      <div class="big k">${t.lost}</div>
      <div class="rest">${t.lostRest}</div>
      <div class="det">${t.lostDet}</div>
    </div>
    <div class="bene">
      <span class="step">03</span>
      <div class="viz"><svg width="180" height="90" viewBox="0 0 180 90" fill="none">
        <rect x="0" y="12" width="86" height="66" rx="10" fill="#0F1519"/>
        <path d="M28 30a13 13 0 1 0 12 19 15 15 0 0 1-12-19Z" fill="#E0A82E"/>
        <g fill="#00CEC9"><circle cx="56" cy="28" r="1.6"/><circle cx="66" cy="38" r="1.2"/><circle cx="50" cy="45" r="1.2"/></g>
        ${ar ? DAWN_AR(t) : DAWN_EN}
        <path class="dash" d="M90 45h16" stroke="#D2D8E0" stroke-width="1.3"/>
        <rect x="110" y="16" width="42" height="34" rx="6" fill="#FFF" stroke="#E2E7EE"/>
        <g stroke="#D2D8E0" stroke-width="1.4" stroke-linecap="round"><path d="M118 26h26M118 32h26M118 38h16"/></g>
        <g fill="#0670C4" fill-opacity=".22"><rect x="110" y="58" width="12" height="18" rx="3"/><rect x="126" y="58" width="12" height="18" rx="3"/><rect x="142" y="58" width="12" height="18" rx="3"/></g>
      </svg></div>
      <div class="big c">${t.pub}</div>
      <div class="rest">${t.pubRest}</div>
      <div class="det">${t.pubDet}</div>
    </div>
  </div>

  <div class="dark rv"><div class="dark-in">
    <div><h3>${t.saveH3}</h3><p>${t.saveP}</p></div>
    <div class="savewrap">
      <div class="savegrid">
        <div class="sv h">
          <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="#FFFFFF" stroke-width="1.4"/><path d="M12 6.6V12l3.6 2.4" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/></svg></div>
          <div class="n">${t.sv1n}</div>
          <div class="l">${t.sv1l}</div>
        </div>
        <div class="sv m">
          <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3.4v17.2" stroke="#00CEC9" stroke-width="1.4" stroke-linecap="round"/><path d="M15.8 7.6c0-1.6-1.7-2.6-3.8-2.6S8.2 6 8.2 7.6s1.6 2.3 3.8 2.9 3.8 1.3 3.8 3-1.7 2.9-3.8 2.9-3.8-1.2-3.8-2.9" stroke="#00CEC9" stroke-width="1.4" stroke-linecap="round"/></svg></div>
          <div class="n">${t.sv2n}</div>
          <div class="l">${t.sv2l}</div>
        </div>
        <div class="sv d">
          <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3.4" y="13" width="4" height="7.6" rx="1.4" fill="#E0A82E"/><rect x="10" y="8.6" width="4" height="12" rx="1.4" fill="#E0A82E" fill-opacity=".7"/><rect x="16.6" y="4.2" width="4" height="16.4" rx="1.4" fill="#E0A82E" fill-opacity=".45"/></svg></div>
          <div class="n">0</div>
          <div class="l">${t.sv3l}</div>
        </div>
      </div>
      <div class="savefoot">
        <span class="savechip">${t.saveChip}</span>
      </div>
    </div>
  </div></div>
</section>

<section class="pg" id="how">
  <div class="hdr">
    <span class="tag">${t.howTag}</span>
    <h2>${t.howH2a}<br><span class="grad">${t.howH2b}</span></h2>
    <p class="sub">${t.howSub}</p>
  </div>

  <div class="eyebrow">${t.howEb}</div>
  <div class="wide rv">
    ${ar ? PIPE_AR(t) : PIPE_EN}
  </div>

  <div class="quad rv" style="margin-top:22px">
    <div class="bene">
      <span class="who u">${t.q1who}</span>
      <div class="big b">${t.q1big}</div>
      <div class="rest">${t.q1rest}</div>
      <div class="det">${t.q1det}</div>
    </div>
    <div class="bene">
      <span class="who a">${t.q2who}</span>
      <div class="big k">${t.q2big}</div>
      <div class="rest">${t.q2rest}</div>
      <div class="det">${t.q2det}</div>
    </div>
    <div class="bene">
      <span class="who a">${t.q3who}</span>
      <div class="big c">${t.q3big}</div>
      <div class="rest">${t.q3rest}</div>
      <div class="det">${t.q3det}</div>
    </div>
    <div class="bene">
      <span class="who u">${t.q4who}</span>
      <div class="big b">${t.q4big}</div>
      <div class="rest">${t.q4rest}</div>
      <div class="det">${t.q4det}</div>
    </div>
  </div>

  <div class="dark rv"><div class="dark-in">
    <div><h3>${t.orderH3}</h3><p>${t.orderP}</p></div>
    <div class="savegrid">
      <div class="sv h"><div class="n word" style="font-size:24px">${t.o1n}</div><div class="l">${t.o1l}</div></div>
      <div class="sv m"><div class="n word" style="font-size:24px">${t.o2n}</div><div class="l">${t.o2l}</div></div>
      <div class="sv d"><div class="n word" style="font-size:24px">${t.o3n}</div><div class="l">${t.o3l}</div></div>
    </div>
  </div></div>
</section>

<section class="pg" id="get">
  <div class="hdr">
    <span class="tag">${t.getTag}</span>
    <h2>${t.getH2a}<br><span class="grad">${t.getH2b}</span></h2>
    <p class="sub">${t.getSub}</p>
  </div>

  <div class="eyebrow">${t.getEb1}</div>
  <div class="g2 rv">
    <div class="panel">
      <div class="ph"><span class="t">${t.p1t}</span><span class="m">${t.p1m}</span></div>
      <div class="pb">
        <svg viewBox="0 0 320 230" fill="none" style="width:100%;height:auto">
          <g stroke="#EFF4FA"><circle cx="160" cy="115" r="88"/><circle cx="160" cy="115" r="66"/><circle cx="160" cy="115" r="44"/><circle cx="160" cy="115" r="22"/></g>
          <g stroke="#E2E7EE"><path d="M160 27v176M72 115h176M98 53l124 124M222 53L98 177"/></g>
          <path d="M160 36 226 66 240 115 214 168 160 186 104 166 84 112 106 62Z" fill="#0670C4" fill-opacity=".16" stroke="#0670C4" stroke-width="1.6"/>
          <g fill="#0670C4"><circle cx="160" cy="36" r="3"/><circle cx="226" cy="66" r="3"/><circle cx="240" cy="115" r="3"/><circle cx="214" cy="168" r="3"/><circle cx="160" cy="186" r="3"/><circle cx="104" cy="166" r="3"/><circle cx="84" cy="112" r="3"/><circle cx="106" cy="62" r="3"/></g>
          <circle cx="84" cy="112" r="7" stroke="#E0A82E" stroke-width="1.8" fill="none"/>
          <circle cx="106" cy="62" r="7" stroke="#E0A82E" stroke-width="1.8" fill="none"/>
          ${ar ? RADARG_AR(t) : RADARG_EN}
        </svg>
        <div style="display:flex;align-items:center;gap:9px;margin-top:12px;font-size:13px;color:#66707D">
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.4" stroke="#E0A82E" stroke-width="1.8" fill="none"/></svg>
          The two rings show what to improve next.
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="ph"><span class="t">${t.p2t}</span><span class="m">${t.p2m}</span></div>
      <div class="pb">
        ${ar ? VENN_AR(t) : VENN_EN}
        <p class="quote" style="margin-top:16px">${t.gapQuote}</p>
        <div class="mi" style="margin-top:16px;text-transform:uppercase">${t.subjects}</div>
        <div class="chipg"><span class="pill">${t.pill1}</span><span class="pill">${t.pill2}</span><span class="pill">${t.pill3}</span></div>
      </div>
    </div>
  </div>

  <div class="g2 rv" style="margin-top:18px">
    <div class="panel">
      <div class="ph"><span class="t">${t.p3t}</span><span class="m">${t.p3m}</span></div>
      <div class="pb">
        <div class="lens"><div class="lh"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.6" cy="5.6" r="4.2" stroke="#0670C4" stroke-width="1.4"/><path d="M8.8 8.8l3 3" stroke="#0670C4" stroke-width="1.4" stroke-linecap="round"/></svg> ${t.l1}</div><p>${t.l1p}</p></div>
        <div class="lens"><div class="lh"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.6" y="2.6" width="9.8" height="9" rx="1.4" stroke="#0670C4" stroke-width="1.3"/><path d="M4.4 5.6h1.4M7.2 5.6h1.4M4.4 8.2h1.4M7.2 8.2h1.4" stroke="#0670C4" stroke-width="1.2" stroke-linecap="round"/></svg> ${t.l2}</div><p>${t.l2p}</p></div>
        <div class="lens"><div class="lh"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.4" r="2.4" stroke="#0670C4" stroke-width="1.3"/><path d="M2.4 11c.6-2.4 2.2-3.6 4.1-3.6S10 8.6 10.6 11" stroke="#0670C4" stroke-width="1.3" stroke-linecap="round"/></svg> ${t.l3}</div><p>${t.l3p}</p></div>
      </div>
    </div>
    <div class="panel">
      <div class="ph"><span class="t">${t.p4t}</span><span class="m">${t.p4m}</span></div>
      <div class="pb">
        <div class="mrow"><span class="mi2 b"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor"/></svg></span><span><span class="k">${t.m1k}</span><span class="v">${t.m1v}</span></span></div>
        <div class="mrow"><span class="mi2 c"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.4 8h3l2-4.6L9 12.4l2-4.4h3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span><span class="k">${t.m2k}</span><span class="v">${t.m2v}</span></span></div>
        <div class="mrow"><span class="mi2 a"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2.2l6 11.2H2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.4v3.2M8 11.4v.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span><span><span class="k">${t.m3k}</span><span class="v">${t.m3v}</span></span></div>
      </div>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:46px">${t.getEb2}</div>
  <div class="g2 rv">
    <div class="post">
      <div class="pph"><span class="av"></span><span><span class="pn">${t.postName}</span><br><span class="pr">${t.postTitle}</span></span></div>
      <p class="pbody">${t.postBody}</p>
      <div class="srcline"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.6" stroke="currentColor" stroke-width="1.2"/><path d="M4 6.6l1.9 2 3.3-3.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> ${t.srcline}</div>
    </div>
    <div class="panel">
      <div class="ph"><span class="t">${t.p5t}</span><span class="m">${t.p5m}</span></div>
      <div class="pb">
        <div class="slides">
          <div class="sl" style="background:#0F1519;color:#fff">
            <svg class="shape" style="top:-14px;right:-14px" width="70" height="70" viewBox="0 0 70 70" fill="none"><circle cx="40" cy="30" r="26" stroke="#00CEC9" stroke-opacity=".35"/><circle cx="40" cy="30" r="16" stroke="#00CEC9" stroke-opacity=".2"/></svg>
            <span class="n">01</span><span class="t">${t.sl1}</span>
          </div>
          <div class="sl" style="background:#0670C4;color:#fff">
            <svg class="shape" style="right:10px;top:26px" width="56" height="42" viewBox="0 0 56 42" fill="none"><rect x="2" y="24" width="10" height="16" rx="2" fill="#fff" fill-opacity=".3"/><rect x="16" y="16" width="10" height="24" rx="2" fill="#fff" fill-opacity=".45"/><rect x="30" y="8" width="10" height="32" rx="2" fill="#fff" fill-opacity=".6"/><rect x="44" y="2" width="10" height="38" rx="2" fill="#fff" fill-opacity=".8"/></svg>
            <span class="n">02</span><span class="t" style="font-size:19px">${t.sl2}</span>
          </div>
          <div class="sl" style="background:#EFF4FA;border:1px solid #D2D8E0;color:#0F1519">
            <svg class="shape" style="top:10px;right:10px" width="30" height="28" viewBox="0 0 30 28" fill="none"><path d="M15 3l12 22H3z" stroke="#E0A82E" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 11v6M15 20v1.4" stroke="#E0A82E" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="n">03</span><span class="t">${t.sl3}</span>
          </div>
          <div class="sl" style="background:#0F1519;color:#00CEC9">
            <svg class="shape" style="right:10px;top:26px" width="66" height="66" viewBox="0 0 66 66" fill="none"><path d="M12 46L48 14M32 14h16v16" stroke="#00CEC9" stroke-opacity=".3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="n">04</span><span class="t">${t.sl4}</span>
          </div>
        </div>
        <div class="chipg"><span>${t.chip1}</span><span>${t.chip2}</span><span>${t.chip3}</span></div>
      </div>
    </div>
  </div>

  <div class="trio rv" style="margin-top:22px">
    <div class="bene"><div class="big k" style="font-size:30px">${t.t1big}</div><div class="det">${t.t1det}</div></div>
    <div class="bene"><div class="big k" style="font-size:30px">${t.t2big}</div><div class="det">${t.t2det}</div></div>
    <div class="bene"><div class="big k" style="font-size:30px">${t.t3big}</div><div class="det">${t.t3det}</div></div>
  </div>
</section>

<section class="pg" id="why">
  <div class="hdr">
    <span class="tag">${t.whyTag}</span>
    <h2>${t.whyH2a}<br><span class="grad">${t.whyH2b}</span></h2>
    <p class="sub">${t.whySub}</p>
  </div>

  <div class="ledger rv">
    <div class="head"><span>${t.ledHead}</span><span>${t.ledDays}</span></div>
    <div class="row">
      <div>
        <span class="main">${t.lr1m}</span>
        <span class="sub">${t.lr1s}</span>
      </div>
      <span class="status">${t.lr1x}</span>
    </div>
    <div class="row">
      <div>
        <span class="main">${t.lr2m}</span>
        <span class="sub">${t.lr2s}</span>
      </div>
      <span class="status">${t.lr2x}</span>
    </div>
    <div class="row">
      <div>
        <span class="main">${t.lr3m}</span>
        <span class="sub">${t.lr3s}</span>
      </div>
      <span class="status">${t.lr3x}</span>
    </div>
    <div class="row">
      <div>
        <span class="main">${t.lr4m}</span>
        <span class="sub">${t.lr4s}</span>
      </div>
      <span class="status">${t.lr4x}</span>
    </div>
    <div class="total">
      <span class="q">${t.totQ}</span>
      <span class="a">${t.totA}</span>
    </div>
  </div>

  <div class="turn rv">
    <h3>${t.turnH3}</h3>
    <p>${t.turnP}</p>
    <p class="mono">${t.turnMono}</p>
  </div>

  <div class="eyebrow">${t.whyEb}</div>
  <div class="wide rv">
    ${ar ? YEAR_AR(t) : YEAR_EN}

    <div class="calc">
      <p class="ct">${t.calcCt}</p>
      <div class="curr"><button data-curr="SAR" aria-pressed="true">SAR</button><button data-curr="AED" aria-pressed="false">AED</button><button data-curr="USD" aria-pressed="false">USD</button></div>
      <div class="srow"><label for="hrs">${t.hrsLabel}</label><output id="hrs-o" for="hrs">5</output></div>
      <input id="hrs" type="range" min="1" max="14" step="0.5" value="5" aria-label="${t.hrsAria}">
      <div class="srow"><label for="rt">${t.rtLabel}</label><output id="rt-o" for="rt">SAR 300</output></div>
      <input id="rt" type="range" min="50" max="900" step="25" value="300" aria-label="${t.rtAria}">
      <p class="ct" style="margin:14px 0 0">${t.ownLine}</p>
      <p class="ct" style="margin-top:10px">${t.ghost}</p>
      <p class="ct" id="kick" style="margin-top:6px"></p>
    </div>
  </div>

</section>

<section class="pg" id="cmp">
  <div class="hdr">
    <span class="tag">${t.cmpTag}</span>
    <h2>${t.cmpH2a}<br><span class="grad">${t.cmpH2b}</span></h2>
    <p class="sub">${t.cmpSub}</p>
  </div>


  <div class="eyebrow">${t.cmpEb}</div>
  <div class="cmp rv">
    <table>
      <thead><tr><th></th><th class="us">KnownBy</th><th>${t.th1}</th><th>${t.th2}</th><th>${t.th3}</th><th>${t.th4}</th></tr></thead>
      <tbody>
        <tr><td>${t.r1}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>${t.r2}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>${t.r3}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>${t.r4}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td><td><span class="dN"></span></td><td><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td></tr>
        <tr><td>${t.r5}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td></tr>
        <tr><td>${t.r6}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td></tr>
        <tr><td>${t.r7}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>${t.r8}</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td></tr>
      </tbody>
    </table>
  </div>
  <p class="mi" style="text-align:center;margin-top:14px">${t.legend}</p>

  <div class="trio rv" style="margin-top:26px">
    <div class="bene">
      <div class="viz"><svg width="150" height="80" viewBox="0 0 150 80" fill="none">
        <rect x="2" y="12" width="42" height="56" rx="6" fill="#EFF4FA" stroke="#D2D8E0"/><rect x="54" y="12" width="42" height="56" rx="6" fill="#EFF4FA" stroke="#D2D8E0"/><rect x="106" y="12" width="42" height="56" rx="6" fill="#EFF4FA" stroke="#D2D8E0"/>
        <g stroke="#D2D8E0" stroke-width="1.3" stroke-linecap="round"><path d="M10 26h26M10 34h26M10 42h16M62 26h26M62 34h26M62 42h16M114 26h26M114 34h26M114 42h16"/></g>
      </svg></div>
      <div class="big k" style="font-size:28px">${t.c1big}</div>
      <div class="det">${t.c1det}</div>
    </div>
    <div class="bene">
      <div class="viz"><svg width="170" height="80" viewBox="0 0 170 80" fill="none">
        <rect x="2" y="14" width="92" height="52" rx="8" fill="none" stroke="#D2D8E0" stroke-dasharray="5 5"/>
        ${ar ? EMPTY_AR(t) : EMPTY_EN}
        <path class="dash" d="M100 40h24" stroke="#D2D8E0" stroke-width="1.4"/>
        <circle cx="144" cy="40" r="18" fill="#FDECEA" stroke="#C0392B"/>
        <text x="144" y="47" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#C0392B">?</text>
      </svg></div>
      <div class="big k" style="font-size:28px">${t.c2big}</div>
      <div class="det">${t.c2det}</div>
    </div>
    <div class="bene" style="background:linear-gradient(180deg,var(--bluetint),var(--white))">
      <div class="viz"><svg width="180" height="80" viewBox="0 0 180 80" fill="none">
        <circle cx="26" cy="40" r="20" fill="#0670C4"/><path d="M18 40l6 7 13-15" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path class="dash" d="M52 40h30" stroke="#00CEC9" stroke-width="1.6"/>
        <rect x="88" y="12" width="88" height="56" rx="9" fill="#0F1519"/>
        <g stroke="#00CEC9" stroke-width="1.6" stroke-linecap="round"><path d="M100 30h58M100 40h58M100 50h34"/></g>
      </svg></div>
      <div class="big b" style="font-size:28px">${t.c3big}</div>
      <div class="det">${t.c3det}</div>
    </div>
  </div>

  <div class="eyebrow">${t.payEb}</div>
  <div class="wide rv">
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">${t.pay1}</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:88%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$50–400</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">${t.pay2}</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:66%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$30–300</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">${t.pay3}</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:40%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$30–160</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">${t.pay4}</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:26%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$20–100</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">${t.pay5}</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:18%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$20–40</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center"><span style="font-size:13.5px;color:#0F1519;font-weight:600">${t.pay6}</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:100%;border-radius:7px;background:linear-gradient(90deg,#7FD3B4,#12805C)"></i></span><span class="mi" style="text-align:right;color:#12805C;font-weight:700">${SEAT_PRICE.split(" ")[0]}</span></div>
    <p style="margin-top:16px;font-size:13.5px;color:var(--ink3);line-height:1.7">${t.payP}</p>
    <p class="mi" style="margin-top:12px;line-height:1.7">${t.payNote}</p>
  </div>
</section>

<section class="pg" id="price">
  <div class="hdr">
    <span class="tag">${t.prTag}</span>
    <h2>${t.prH2a}<br><span class="grad">${t.prH2b}</span></h2>
    <p class="sub">${t.prSub}</p>
  </div>

  <div class="ptwo rv">
    <div class="pcard road">
      <div class="ptop"><span class="plab">${t.roadLab}</span><span class="pchip">${t.roadChip}</span></div>
      <h3>${t.roadH3}</h3>
      <div class="prc"><span class="p">${t.roadFree}</span><span class="u">${t.roadFreeU}</span></div>
      <div class="stops">
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">${t.st1}</div><div class="sh">${t.sh1}</div><div class="sb">${t.sb1}</div></div>
        </div>
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">${t.st2}</div><div class="sh">${t.sh2}</div><div class="sb">${t.sb2}</div></div>
        </div>
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">${t.st3}</div><div class="sh">${t.sh3}</div><div class="sb">${t.sb3}</div></div>
        </div>
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">${t.st4}</div><div class="sh">${t.sh4}</div><div class="sb">${t.sb4}</div></div>
        </div>
        <div class="stop last">
          <span class="pin"></span>
          <div><div class="st">${t.st5}</div><div class="sh">${t.sh5}</div><div class="sb">${t.sb5}</div></div>
        </div>
      </div>
      <div class="pcta"><a class="btn bp" href="/assessment">${t.freeCta}</a><p class="undr">${t.roadUndr}</p></div>
    </div>

    <div class="pcard seat night">
      <div class="ptop"><span class="plab">${t.seatLab}</span><span class="pchip">${t.seatChip}</span></div>
      <h3>${t.seatH3}</h3>
      <p class="who">${t.seatWho}</p>
      <div class="prc"><span class="p">${SEAT_PRICE.split(" ")[0]}</span><span class="u">${t.seatU}</span></div>
      <ul class="ticks">
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${t.tick1}</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${t.tick2}</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${t.tick3}</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${t.tick4}</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${t.tick5}</span></li>
      </ul>
      <p class="lock">${t.seatLock}</p>
      <div class="pcta"><a class="btn bwhite" href="${SEAT_PATH}">${SEAT_CTA}</a><p class="undr">${SEAT_NO_CARD}</p></div>
    </div>
  </div>

  <p class="bridge">${t.bridge}</p>

  <div class="founder">
    <img src="/aura-founder.jpg" alt="${t.founderAlt}">
    <div class="t">${t.founderT}</div>
  </div>

  <div class="hdr" style="margin-top:56px">
    <span class="tag">${t.faqTag}</span>
    <h2>${t.faqH2a}<br><span class="grad">${t.faqH2b}</span></h2>
    <p class="sub">${t.faqSub}</p>
  </div>
  <div style="max-width:760px;margin:0 auto">
    <details open><summary>${t.fq1}</summary><p>${t.fa1}</p></details>
    <details><summary>${t.fq2}</summary><p>${t.fa2}</p></details>
    <details><summary>${t.fq3}</summary><p>${t.fa3}</p></details>
    <details><summary>${t.fq4}</summary><p>${t.fa4}</p></details>
    <details><summary>${t.fq5}</summary><p>${t.fa5}</p></details>
    <details><summary>${t.fq6}</summary><p>${t.fa6}</p></details>
    <details><summary>${t.fq7}</summary><p>${t.fa7}</p></details>
    <details><summary>${t.fq8}</summary><p>${t.fa8}</p></details>
  </div>

  <div class="dark rv"><div class="dark-in" style="grid-template-columns:1fr;text-align:center">
    <div>
      <h3 style="max-width:none;margin:0 auto">${t.stillH3}</h3>
      <p style="max-width:460px;margin:12px auto 0">${t.stillP}</p>
      <div style="margin-top:22px;display:flex;gap:11px;justify-content:center;flex-wrap:wrap">
        <a class="btn bp" href="/assessment">${t.freeCta}</a>
      </div>
      <p class="closing-note">${t.closing}</p>
    </div>
  </div></div>
</section>

<div class="foot">
  <span>${t.footLeft}</span>
  <span><a href="/our-story">${t.fl1}</a> · <a href="/guide">${t.fl2}</a> · <a href="/trust">${t.fl3}</a> · <a href="/contact">${t.fl4}</a> · <a href="/privacy">${t.fl5}</a> · <a href="/terms">${t.fl6}</a></span>
</div>

</div>
`;

export type LandingStrings = { [K in keyof typeof LANDING_COPY]: string };
export const landingStrings = (lang: UiLang): LandingStrings => {
  const i = lang === "ar" ? 1 : 0;
  return Object.fromEntries(
    Object.entries(LANDING_COPY).map(([k, v]) => [k, v[i]]),
  ) as LandingStrings;
};

const CURRENCIES: Record<string, { min: number; max: number; step: number }> = {
  SAR: { min: 50, max: 900, step: 25 },
  AED: { min: 50, max: 900, step: 25 },
  USD: { min: 15, max: 250, step: 5 },
};

const WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen",
  "Nineteen", "Twenty",
];
const spell = (n: number) => (n >= 0 && n <= 20 && Number.isInteger(n) ? WORDS[n] : String(n));
const money = (curr: string, v: number) => `${curr} ${Math.round(v).toLocaleString("en-US")}`;

/** Script-built strings. Arabic prints counts as digits, fixed phrasing, isolated left-to-right. */
const DYN = {
  en: {
    hours: (h: number) => String(h),
    money: (s: string) => s,
    own: (n: string) => `${n} hrs`,
    dHours: (n: string) => `${n} hours of reading`,
    dHours2: (n: string) => `the same ${n} hours`,
    dCost: (m: string) => `= ${m} OF YOUR OWN TIME, AND NOTHING TO SHOW`,
    kicker: (months: number, weeks: number) => {
      const unit =
        months >= 1.6
          ? `${spell(Math.round(months))} working month${Math.round(months) === 1 ? "" : "s"}`
          : `${spell(Math.floor(weeks))} working week${Math.floor(weeks) === 1 ? "" : "s"}`;
      return `<strong>${unit}</strong> of thinking, written off every year. <strong>One tap to keep it.</strong>`;
    },
  },
  ar: {
    hours: (h: number) => I(String(h)),
    money: (s: string) => I(s),
    own: (n: string) => I(n),
    dHours: (n: string) => `${I(n)} ساعة قراءة`,
    dHours2: (n: string) => `الساعات نفسها: ${I(n)}`,
    dCost: (m: string) => `= ${I(m)} من وقتك، ولا أثر لها`,
    kicker: (months: number, weeks: number) =>
      months >= 1.6
        ? `<strong>ما يعادل ${Math.round(months)} من أشهر العمل</strong> من تفكيرك يُشطب كل سنة. <strong>ولمسة واحدة تحفظه.</strong>`
        : `<strong>ما يعادل ${Math.floor(weeks)} من أسابيع العمل</strong> من تفكيرك يُشطب كل سنة. <strong>ولمسة واحدة تحفظه.</strong>`,
  },
} as const;

const LandingV2 = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const t = useMemo(() => landingStrings(lang), [lang]);
  const html = useMemo(() => landingHtml(t, ar), [t, ar]);
  const tabRef = useRef("home");

  usePageMeta({
    title: t.metaTitle,
    description: t.metaDesc,
    path: "/",
  });

  useEffect(() => setMounted(true), []);

  /* ── the pill tightens once you are past the fold ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nav = root.querySelector<HTMLElement>(".nav");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("shrink", window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mounted, html]);

  /* ── the page knows who is looking at it ── */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive) setSignedIn(!!session?.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session?.user);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || signedIn === null) return;
    const alt = root.querySelector<HTMLAnchorElement>("#navalt");
    const cta = root.querySelector<HTMLAnchorElement>("#navcta");
    const hero = root.querySelector<HTMLAnchorElement>("#heropri");
    if (alt) {
      alt.textContent = signedIn ? t.signOut : t.signIn;
      alt.setAttribute("href", signedIn ? "#" : "/auth");
      if (signedIn) alt.dataset.signout = "1";
      else delete alt.dataset.signout;
    }
    if (cta) {
      cta.innerHTML = ar
        ? (signedIn ? t.openApp : t.navCtaInner)
        : `${signedIn ? "Open KnownBy" : FREE_CTA_SHORT_LABEL} <span class="a">↗</span>`;
      cta.setAttribute("href", signedIn ? "/home" : "/assessment");
    }
    if (hero) {
      hero.textContent = signedIn ? t.openApp : t.freeCta;
      hero.setAttribute("href", signedIn ? "/home" : "/assessment");
    }
  }, [signedIn, mounted, html, t, ar]);

  /* ── calculator + in-app link interception ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const d = ar ? DYN.ar : DYN.en;

    const hours = root.querySelector<HTMLInputElement>("#hrs");
    const rate = root.querySelector<HTMLInputElement>("#rt");
    const hoursOut = root.querySelector<HTMLElement>("#hrs-o");
    const rateOut = root.querySelector<HTMLElement>("#rt-o");
    const own = root.querySelector<HTMLElement>("#own");
    const cost = root.querySelector<HTMLElement>("#cost");
    const kicker = root.querySelector<HTMLElement>("#kick");
    // The diagram is not a second calculation — it reads the same source as
    // the calculator, so the two can never disagree.
    const dHours = root.querySelector<SVGTextElement>("#dHours");
    const dHours2 = root.querySelector<SVGTextElement>("#dHours2");
    const dCost = root.querySelector<SVGTextElement>("#dCost");
    const currBtns = Array.from(root.querySelectorAll<HTMLButtonElement>(".curr button"));
    let curr = "SAR";

    const render = () => {
      if (!hours || !rate) return;
      const h = parseFloat(hours.value);
      const r = parseFloat(rate.value);
      const annual = h * 52;
      if (hoursOut) hoursOut.textContent = d.hours(h);
      if (rateOut) rateOut.textContent = d.money(money(curr, r));
      if (own) own.textContent = d.own(Math.round(annual).toLocaleString("en-US"));
      if (cost) cost.textContent = d.money(money(curr, annual * r));
      const annualRounded = Math.round(annual).toLocaleString("en-US");
      if (dHours) dHours.textContent = d.dHours(annualRounded);
      if (dHours2) dHours2.textContent = d.dHours2(annualRounded);
      if (dCost) dCost.textContent = d.dCost(money(curr, annual * r));
      if (kicker) {
        const weeks = annual / 40;
        const months = weeks / 4.33;
        kicker.innerHTML = d.kicker(months, weeks);
      }
    };

    const setCurrency = (next: string) => {
      const cfg = CURRENCIES[next];
      if (!cfg || !rate) return;
      const prev = CURRENCIES[curr];
      const ratio = (parseFloat(rate.value) - prev.min) / (prev.max - prev.min);
      curr = next;
      rate.min = String(cfg.min);
      rate.max = String(cfg.max);
      rate.step = String(cfg.step);
      rate.value = String(Math.round((cfg.min + ratio * (cfg.max - cfg.min)) / cfg.step) * cfg.step);
      currBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.curr === next)));
      render();
    };

    const onCurr = (e: Event) => setCurrency((e.currentTarget as HTMLButtonElement).dataset.curr || "SAR");
    hours?.addEventListener("input", render);
    rate?.addEventListener("input", render);
    currBtns.forEach((b) => b.addEventListener("click", onCurr));
    render();

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      if (a.dataset.signout === "1") {
        e.preventDefault();
        void signOutAndLand(navigate);
        return;
      }
      if (href.startsWith("/") && !href.startsWith("//")) {
        e.preventDefault();
        navigate(href);
      }
    };
    root.addEventListener("click", onClick);

    return () => {
      hours?.removeEventListener("input", render);
      rate?.removeEventListener("input", render);
      currBtns.forEach((b) => b.removeEventListener("click", onCurr));
      root.removeEventListener("click", onClick);
    };
  }, [mounted, navigate, html, ar]);

  /* ── tabs: six pages, one at a time ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const show = (id: string) => {
      root.querySelectorAll<HTMLElement>(".pg").forEach(s => s.classList.toggle("on", s.id === id));
      root.querySelectorAll<HTMLElement>(".links button").forEach(x => x.classList.toggle("on", x.dataset.p === id));
    };
    // A language switch redraws the page; keep the tab the reader was on.
    if (tabRef.current !== "home") show(tabRef.current);
    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement)?.closest?.("[data-p]") as HTMLElement | null;
      if (!b) return;
      e.preventDefault();
      const id = b.dataset.p!;
      tabRef.current = id;
      show(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [mounted, html]);

  /* ── reveals and counters ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const cleanups: Array<() => void> = [];

    const revealables = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
    if (reduced) {
      revealables.forEach((el) => el.classList.add("in"));
    } else if (revealables.length) {
      const ro = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            ro.unobserve(e.target);
            e.target.classList.add("in");
          }),
        { rootMargin: "0px 0px -10% 0px" },
      );
      revealables.forEach((el, i) => {
        el.style.transitionDelay = `${(i % 4) * 70}ms`;
        ro.observe(el);
      });
      cleanups.push(() => ro.disconnect());
    }

    const counters = Array.from(root.querySelectorAll<HTMLElement>("[data-countup]"));
    counters.forEach((el) => {
      const target = Number(el.dataset.countup || "0");
      const meter = el.parentElement?.querySelector<HTMLElement>(".meter i");
      if (reduced) {
        el.textContent = String(target);
        if (meter) meter.style.width = `${target}%`;
        return;
      }
      el.textContent = "0";
      if (meter) {
        meter.style.width = "0%";
        meter.style.transition = "width 1.4s cubic-bezier(.22,1,.36,1)";
      }
      const o = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            o.unobserve(e.target);
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - start) / 1400);
              el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            if (meter) requestAnimationFrame(() => { meter.style.width = `${target}%`; });
          }),
        { threshold: 0.4 },
      );
      o.observe(el);
      cleanups.push(() => o.disconnect());
    });

    return () => cleanups.forEach((fn) => fn());
  }, [mounted, html]);

  /* ── founding seats — live from the public RPC, never hardcoded ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("founding_reservations");
        if (cancelled || error || !data) return;
        const row: any = Array.isArray(data) ? (data as any)[0] : data;
        const claimed = Number(row?.claimed);
        const cap = Number(row?.cap);
        if (!Number.isFinite(claimed) || !Number.isFinite(cap) || cap <= 0) return;
        // Nothing true to say yet — the chip and card stay hidden on zero.
        if (claimed <= 0) return;
        const root = rootRef.current;
        if (!root) return;
        const w = waveFrom(claimed, cap || SEAT_CAP);
        const chips = root.querySelectorAll<HTMLElement>('[data-wave="chip"],[data-wave="chip2"]');
        const card = root.querySelector<HTMLElement>('[data-wave="card"]');
        const priceNote = root.querySelector<HTMLElement>('[data-wave="pricenote"]');

        if (!w) {
          // The fifty are gone — no wave exists, so nothing about waves is shown.
          chips.forEach((el) => { el.style.display = "none"; });
          if (card) card.style.display = "none";
          if (priceNote) priceNote.textContent = SEAT_SOLD_OUT_NOTE;
          return;
        }

        chips.forEach((el) => {
          el.textContent = w.chip.toUpperCase();
          el.style.display = "";
        });
        if (card) card.style.display = "";
        const pips = root.querySelector<HTMLElement>('[data-wave="pips"]');
        if (pips) {
          pips.innerHTML = Array.from({ length: SEAT_WAVE_SIZE }, (_, i) =>
            `<i class="${i < w.inWave ? "taken" : i === w.inWave ? "next" : ""}"></i>`,
          ).join("");
        }
        const note = root.querySelector<HTMLElement>('[data-wave="note"]');
        if (note) note.textContent = w.note;
      } catch {
        /* silent — the wave elements simply stay hidden */
      }
    })();
    return () => { cancelled = true; };
  }, [mounted, html]);

  return (
    <>
      <style>{LANDING_V2_CSS}</style>
      <div style={{ position: "fixed", top: 8, insetInlineEnd: 8, zIndex: 70 }}><LanguageToggle /></div>
      <div
        ref={rootRef}
        className="aura-v2"
        dir={ar ? "rtl" : "ltr"}
        lang={ar ? "ar" : "en"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
};

export default LandingV2;
