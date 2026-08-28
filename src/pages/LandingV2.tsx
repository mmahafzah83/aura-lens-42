import { useEffect, useRef, useState } from "react";
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
.aura-v2 .bg2{background:var(--white);color:var(--ink);border:1px solid var(--line2)}
.aura-v2 .bg2:hover{border-color:var(--ink);transform:translateY(-2px)}
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
.aura-v2 .refuse{background:#0F1519;border-radius:20px;padding:38px 36px;margin-top:26px;position:relative;overflow:hidden}
.aura-v2 .refuse::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 12% 12%,rgba(0,206,201,.12),transparent 44%),radial-gradient(circle at 92% 92%,rgba(6,112,196,.16),transparent 48%)}
.aura-v2 .refuse-in{position:relative}
.aura-v2 .refuse .kick{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#00CEC9;margin-bottom:16px}
.aura-v2 .refuse h2{color:#fff;margin-top:0;font-size:clamp(30px,4vw,48px)}
.aura-v2 .refuse .body{font-size:15px;line-height:1.65;color:#9AA5B1;margin-top:14px;max-width:620px}
.aura-v2 .refuse .bar{display:flex;gap:3px;margin-top:26px;height:7px}
.aura-v2 .refuse .bar i{flex:1;height:7px;border-radius:2px;background:#39434C;display:block}
.aura-v2 .refuse .bar i:last-child{background:#00CEC9}
.aura-v2 .refuse .cap{font-size:13px;color:#8B96A2;margin-top:12px}
.aura-v2 .refuse .close{font-size:15px;color:#fff;margin-top:18px}
@media(max-width:700px){
 .aura-v2 .refuse{padding:26px 20px}
 .aura-v2 .refuse .body{font-size:14px}
 .aura-v2 .refuse .close{font-size:14px}
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
`;

const LANDING_V2_HTML = `
<svg style="display:none"><symbol id="m" viewBox="0 0 64 64"><g stroke="currentColor" fill="currentColor" stroke-linecap="round"><circle cx="32" cy="32" r="6.85" stroke="none"/><line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/><line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/><line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/><line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/><line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/><line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/><line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/><line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/><line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/><line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/><line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/></g><g stroke="#00CEC9" fill="#00CEC9" stroke-linecap="round"><line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/><circle cx="49.24" cy="9.94" r="1.61"/></g></symbol></svg>

<div class="navshell">
  <nav class="nav">
    <a class="brand" href="#" data-p="home"><svg class="mark"><use href="#m"/></svg><span class="bn">Aura</span></a>
    <div class="links">
      <button data-p="home" class="on">Home</button>
      <button data-p="how">How it works</button>
      <button data-p="get">What you get</button>
      <button data-p="why">Why now</button>
      <button data-p="cmp">Compare</button>
      <button data-p="price">Pricing</button>
    </div>
    <a class="navalt" id="navalt" href="/auth">Sign in</a>
    <a class="navcta" id="navcta" href="/assessment">${FREE_CTA_SHORT_LABEL} <span class="a">↗</span></a>
  </nav>
</div>

<div class="stage">

<section class="pg on" id="home">
  <div class="hero">
    <div>
      <span class="tag" style="background:var(--cyantint);color:var(--cyanT)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="3" fill="#00807B"/></svg> AI Professional Identity Platform</span>
      <h1>${HEAD_LEAD}<br><span class="grad">${HEAD_TAIL}</span></h1>
      <p class="sub">Aura reads what you already know and turns it into weekly presence — without turning you into a content creator.</p>
      <div class="acts">
        <a class="btn bp" id="heropri" href="/assessment">${FREE_CTA}</a>
        <button class="btn bg2" data-p="how">See how it works</button>
      </div>
      <p class="support">${FIRST_READ_LINE}. ${FULL_PICTURE_LINE}. Free, and yours to keep.</p>
    </div>
    <div class="loopwrap">
      <div class="jring">
      <svg viewBox="-120 -24 840 664" fill="none" role="img" aria-label="The nine-step Aura journey, running clockwise from step one. Step one, your assessment, is free. Then: capture what you read, organise it, evidence in fragments, your field's trends, tuned to your voice, the draft by dawn, you publish, and the outcome — your standing moves.">
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
      </svg>
      </div>

      <div class="jrail">
        <p class="rstart">▼ You start here · free</p>
        <p class="rkick ka">SEE YOURSELF · YOUR UNDERSTANDING · FREE</p>
        <div class="rrow first ra"><span class="rbead"><i></i><u></u></span><span><span class="rt">Your assessment</span><span class="rs" style="display:block">free, yours to keep</span></span></div>
        <p class="rkick kb">NOTHING LOST · YOUR KNOWLEDGE, KEPT</p>
        <div class="rrow rb"><span class="rbead"><i></i><u></u></span><span><span class="rt">Capture what you read</span><span class="rs" style="display:block">one tap</span></span></div>
        <div class="rrow rb"><span class="rbead"><i></i><u></u></span><span><span class="rt">Organise it</span><span class="rs" style="display:block">nothing lost</span></span></div>
        <div class="rrow rb"><span class="rbead"><i></i><u></u></span><span><span class="rt">Evidence, in fragments</span><span class="rs" style="display:block">usable in November</span></span></div>
        <p class="rkick kc">IT COMPOSES · YOUR CONTENT, WRITTEN</p>
        <div class="rrow rc"><span class="rbead"><i></i><u></u></span><span><span class="rt">Your field's trends</span><span class="rs" style="display:block">matched to you</span></span></div>
        <div class="rrow rc"><span class="rbead"><i></i><u></u></span><span><span class="rt">Tuned to your voice</span><span class="rs" style="display:block">learned, not guessed</span></span></div>
        <div class="rrow rc"><span class="rbead"><i></i><u></u></span><span><span class="rt">The draft</span><span class="rs" style="display:block">by dawn</span></span></div>
        <p class="rkick kd">YOU ARE SEEN · YOUR STANDING, MEASURED</p>
        <div class="rrow rd"><span class="rbead"><i></i><u></u></span><span><span class="rt">You publish</span><span class="rs" style="display:block">one click</span></span></div>
        <div class="rrow rd"><span class="rbead"><i></i></span><span><span class="rt">The outcome</span><span class="rs" style="display:block">your standing moves</span></span></div>
        <div class="rdial"><div class="n">85</div><div class="p">YOUR STANDING</div><div class="c">step 9 feeds this</div></div>
        <a class="btn bp rbtn" href="/assessment">${FREE_CTA}</a>
      </div>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:56px">What Aura does for you</div>
  <div class="trio rv">
    <div class="bene">
      <span class="step">01</span>
      <div class="viz"><svg width="120" height="90" viewBox="0 0 120 90" fill="none">
        <circle cx="60" cy="45" r="34" stroke="#E2E7EE"/><circle cx="60" cy="45" r="22" stroke="#EFF4FA"/>
        <circle cx="60" cy="45" r="30" stroke="#E0A82E" stroke-width="1.2" stroke-dasharray="3 4"/>
        <path d="M60 11v68M26 45h68M36 21l48 48M84 21L36 69" stroke="#EFF4FA"/>
        <path d="M60 19 84 34 78 62 60 72 38 60 34 33Z" fill="#0670C4" fill-opacity=".18" stroke="#0670C4" stroke-width="1.4"/>
      </svg></div>
      <div class="big b">Know</div>
      <div class="rest">your strengths, your skills,<br>and what you stand for.</div>
      <div class="det">${ASSESSMENT_QUESTIONS_PHRASE.replace(/^./, (c) => c.toUpperCase())} and your profile become a real report: the subjects you truly own, the space nobody else holds, and the two things to improve next. <b>Most people have never seen this about themselves.</b></div>
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
      <div class="big k">Nothing lost</div>
      <div class="rest">from your experience<br>and everything you read.</div>
      <div class="det">Every article you save is broken into pieces and kept. An idea you read in March is still there, ready to use, in November. <b>Your reading stops disappearing.</b></div>
    </div>
    <div class="bene">
      <span class="step">03</span>
      <div class="viz"><svg width="180" height="90" viewBox="0 0 180 90" fill="none">
        <rect x="0" y="12" width="86" height="66" rx="10" fill="#0F1519"/>
        <path d="M28 30a13 13 0 1 0 12 19 15 15 0 0 1-12-19Z" fill="#E0A82E"/>
        <g fill="#00CEC9"><circle cx="56" cy="28" r="1.6"/><circle cx="66" cy="38" r="1.2"/><circle cx="50" cy="45" r="1.2"/></g>
        <text x="12" y="68" font-family="IBM Plex Mono, monospace" font-size="7.5" letter-spacing="1.1" fill="#8E99A6">02:00 → DAWN</text>
        <path class="dash" d="M90 45h16" stroke="#D2D8E0" stroke-width="1.3"/>
        <rect x="110" y="16" width="42" height="34" rx="6" fill="#FFF" stroke="#E2E7EE"/>
        <g stroke="#D2D8E0" stroke-width="1.4" stroke-linecap="round"><path d="M118 26h26M118 32h26M118 38h16"/></g>
        <g fill="#0670C4" fill-opacity=".22"><rect x="110" y="58" width="12" height="18" rx="3"/><rect x="126" y="58" width="12" height="18" rx="3"/><rect x="142" y="58" width="12" height="18" rx="3"/></g>
      </svg></div>
      <div class="big c">Publish</div>
      <div class="rest">in your own voice —<br>while you were asleep.</div>
      <div class="det">Agents work from 02:00 to dawn and leave you a finished post <b>and a designed carousel</b>. Read it, change a word, click once. It is live on LinkedIn.</div>
    </div>
  </div>

  <div class="dark rv"><div class="dark-in">
    <div><h3>And what that<br><em>saves you.</em></h3><p>Every year, without adding a single hour to your week.</p></div>
    <div class="savewrap">
      <div class="savegrid">
        <div class="sv h">
          <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="#FFFFFF" stroke-width="1.4"/><path d="M12 6.6V12l3.6 2.4" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/></svg></div>
          <div class="n">260<span style="font-size:.5em"> hrs</span></div>
          <div class="l">of reading a year that <b>stops vanishing</b> — six working weeks of your own thinking.</div>
        </div>
        <div class="sv m">
          <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3.4v17.2" stroke="#00CEC9" stroke-width="1.4" stroke-linecap="round"/><path d="M15.8 7.6c0-1.6-1.7-2.6-3.8-2.6S8.2 6 8.2 7.6s1.6 2.3 3.8 2.9 3.8 1.3 3.8 3-1.7 2.9-3.8 2.9-3.8-1.2-3.8-2.9" stroke="#00CEC9" stroke-width="1.4" stroke-linecap="round"/></svg></div>
          <div class="n">$150<span style="font-size:.5em">–1,000</span></div>
          <div class="l">a month people pay for <b>a writer, a designer, a consultant and two tools.</b></div>
        </div>
        <div class="sv d">
          <div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3.4" y="13" width="4" height="7.6" rx="1.4" fill="#E0A82E"/><rect x="10" y="8.6" width="4" height="12" rx="1.4" fill="#E0A82E" fill-opacity=".7"/><rect x="16.6" y="4.2" width="4" height="16.4" rx="1.4" fill="#E0A82E" fill-opacity=".45"/></svg></div>
          <div class="n">0</div>
          <div class="l">hours added to your week. <span class="strike">design tools</span> <span class="strike">designers</span> <span class="strike">blank pages</span></div>
        </div>
      </div>
      <div class="savefoot">
        <span class="savechip"><span style="margin-right:6px">ⓘ</span><b>Illustrative</b><span class="savechip-rest"> — figures reflect typical market rates, not a guarantee for every user.</span></span>
      </div>
    </div>
  </div></div>
</section>

<section class="pg" id="how">
  <div class="hdr">
    <span class="tag">It refuses to write first</span>
    <h2>Four stages.<br><span class="grad">You are only in two of them.</span></h2>
    <p class="sub">Every other tool writes on day one. Aura will not write until it knows you.</p>
  </div>

  <div class="eyebrow">The pipeline, end to end</div>
  <div class="wide rv">
    <svg viewBox="0 0 900 300" fill="none">
      <rect x="222" y="18" width="440" height="176" rx="16" fill="#0F1519"/>
      <text x="442" y="46" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="1.6" fill="#00CEC9">02:00 → DAWN · YOU ARE ASLEEP</text>

      <rect x="10" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#0670C4" stroke-width="1.4"/>
      <text x="30" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#0670C4">STAGE 1 · YOU</text>
      <text x="30" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F1519">You read</text>
      <text x="30" y="134" font-family="Inter, sans-serif" font-size="12" fill="#66707D">One tap on an article</text>
      <text x="30" y="150" font-family="Inter, sans-serif" font-size="12" fill="#66707D">worth keeping.</text>

      <path d="M212 111h22" stroke="#D2D8E0" stroke-width="1.4"/><path d="M230 106l7 5-7 5" fill="#D2D8E0"/>

      <rect x="240" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#E2E7EE"/>
      <text x="260" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#9AA4B0">STAGE 2 · AURA</text>
      <text x="260" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F1519">It keeps it</text>
      <text x="260" y="134" font-family="Inter, sans-serif" font-size="12" fill="#66707D">Broken into pieces you</text>
      <text x="260" y="150" font-family="Inter, sans-serif" font-size="12" fill="#66707D">can use months later.</text>

      <path d="M442 111h22" stroke="#37424F" stroke-width="1.4"/><path d="M460 106l7 5-7 5" fill="#37424F"/>

      <rect x="470" y="58" width="180" height="106" rx="12" fill="#141D2C" stroke="#2A3648"/>
      <circle class="pulse" cx="628" cy="80" r="4" fill="#00CEC9"/>
      <text x="490" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#00CEC9">STAGE 3 · AURA</text>
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
    </svg>
  </div>

  <div class="quad rv" style="margin-top:22px">
    <div class="bene">
      <span class="who u">YOU · 1 SECOND</span>
      <div class="big b">Tap</div>
      <div class="rest">anything worth keeping.</div>
      <div class="det">A button on any article. The argument, the figures and the source are all kept — you never copy or paste.</div>
    </div>
    <div class="bene">
      <span class="who a">AURA</span>
      <div class="big k">Keep</div>
      <div class="rest">it in usable pieces.</div>
      <div class="det">Each save is broken into roughly nine pieces, so one article can feed a post now and another one in November.</div>
    </div>
    <div class="bene">
      <span class="who a">AURA · OVERNIGHT</span>
      <div class="big c">Write</div>
      <div class="rest">while you are asleep.</div>
      <div class="det">Agents read what you saved, find the idea that repeats, and draft it in your voice — source attached, carousel designed.</div>
    </div>
    <div class="bene">
      <span class="who u">YOU · 2 MINUTES</span>
      <div class="big b">Approve</div>
      <div class="rest">or change a word.</div>
      <div class="det">The draft is waiting when you wake. Nothing is ever published without you pressing the button.</div>
    </div>
  </div>

  <div class="dark rv"><div class="dark-in">
    <div><h3>Why the order<br><em>matters.</em></h3><p>Aura will not write a word until it has read you.</p></div>
    <div class="savegrid">
      <div class="sv h"><div class="n word" style="font-size:24px">Learns first</div><div class="l">A tool that writes before it knows you hands everyone <b>the same paragraph.</b></div></div>
      <div class="sv m"><div class="n word" style="font-size:24px">Then writes</div><div class="l">Your subjects, your evidence, <b>the way you open and close an idea.</b></div></div>
      <div class="sv d"><div class="n word" style="font-size:24px">Then grows</div><div class="l">Month six sounds far more like you <b>than month one did.</b></div></div>
    </div>
  </div></div>
</section>

<section class="pg" id="get">
  <div class="hdr">
    <span class="tag">Free first, paid after</span>
    <h2>See yourself.<br><span class="grad">Then be seen.</span></h2>
    <p class="sub">Two things. First you understand yourself — then the market understands you.</p>
  </div>

  <div class="eyebrow">One · Your report</div>
  <div class="g2 rv">
    <div class="panel">
      <div class="ph"><span class="t">What you are good at</span><span class="m">8 SKILLS RATED</span></div>
      <div class="pb">
        <svg viewBox="0 0 320 230" fill="none" style="width:100%;height:auto">
          <g stroke="#EFF4FA"><circle cx="160" cy="115" r="88"/><circle cx="160" cy="115" r="66"/><circle cx="160" cy="115" r="44"/><circle cx="160" cy="115" r="22"/></g>
          <g stroke="#E2E7EE"><path d="M160 27v176M72 115h176M98 53l124 124M222 53L98 177"/></g>
          <path d="M160 36 226 66 240 115 214 168 160 186 104 166 84 112 106 62Z" fill="#0670C4" fill-opacity=".16" stroke="#0670C4" stroke-width="1.6"/>
          <g fill="#0670C4"><circle cx="160" cy="36" r="3"/><circle cx="226" cy="66" r="3"/><circle cx="240" cy="115" r="3"/><circle cx="214" cy="168" r="3"/><circle cx="160" cy="186" r="3"/><circle cx="104" cy="166" r="3"/><circle cx="84" cy="112" r="3"/><circle cx="106" cy="62" r="3"/></g>
          <circle cx="84" cy="112" r="7" stroke="#E0A82E" stroke-width="1.8" fill="none"/>
          <circle cx="106" cy="62" r="7" stroke="#E0A82E" stroke-width="1.8" fill="none"/>
          <g font-family="IBM Plex Mono, monospace" font-size="7.4" letter-spacing=".9" fill="#9AA4B0">
            <text x="160" y="18" text-anchor="middle">STRATEGY</text>
            <text x="248" y="52" text-anchor="middle">FORESIGHT</text>
            <text x="284" y="118" text-anchor="middle">DIGITAL</text>
            <text x="242" y="188" text-anchor="middle">LEADERSHIP</text>
            <text x="160" y="212" text-anchor="middle">DELIVERY</text>
            <text x="74" y="188" text-anchor="middle">COMMERCIAL</text>
            <text x="34" y="118" text-anchor="middle" fill="#9A6F12">FINANCE</text>
            <text x="70" y="46" text-anchor="middle" fill="#9A6F12">C-SUITE</text>
          </g>
        </svg>
        <div style="display:flex;align-items:center;gap:9px;margin-top:12px;font-size:13px;color:#66707D">
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.4" stroke="#E0A82E" stroke-width="1.8" fill="none"/></svg>
          The two rings show what to improve next.
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="ph"><span class="t">The space that is yours</span><span class="m">NOBODY ELSE HOLDS IT</span></div>
      <div class="pb">
        <svg viewBox="0 0 300 118" fill="none" style="width:100%;height:auto">
          <circle cx="112" cy="59" r="52" fill="#0670C4" fill-opacity=".1" stroke="#0670C4"/>
          <circle cx="188" cy="59" r="52" fill="#00CEC9" fill-opacity=".12" stroke="#00807B"/>
          <path d="M150 14a52 52 0 0 1 0 90 52 52 0 0 1 0-90Z" fill="#0F1519"/>
          <text x="70" y="54" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" letter-spacing="1" fill="#0670C4">BIG PLANS</text>
          <text x="70" y="68" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="#66707D">strategy people</text>
          <text x="232" y="54" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" letter-spacing="1" fill="#00807B">REAL DELIVERY</text>
          <text x="232" y="68" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="#66707D">systems people</text>
          <text x="150" y="57" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">YOU</text>
          <text x="150" y="71" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="7.5" letter-spacing="1.2" fill="#00CEC9">THE GAP</text>
        </svg>
        <p class="quote" style="margin-top:16px">Others write the strategy, or install the system. Almost nobody changes how decisions and ownership work so it actually lands. <b>That gap is yours.</b></p>
        <div class="mi" style="margin-top:16px;text-transform:uppercase">Your three subjects — stop writing about ten</div>
        <div class="chipg"><span class="pill">Readiness as real capability</span><span class="pill">Governance that lasts</span><span class="pill">Gaps to funded plans</span></div>
      </div>
    </div>
  </div>

  <div class="g2 rv" style="margin-top:18px">
    <div class="panel">
      <div class="ph"><span class="t">How others read you today</span><span class="m">TWO LENSES</span></div>
      <div class="pb">
        <div class="lens"><div class="lh"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.6" cy="5.6" r="4.2" stroke="#0670C4" stroke-width="1.4"/><path d="M8.8 8.8l3 3" stroke="#0670C4" stroke-width="1.4" stroke-linecap="round"/></svg> THE HEADHUNTER</div><p>Strong on paper. But almost nothing published on the one story senior roles now ask for.</p></div>
        <div class="lens"><div class="lh"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.6" y="2.6" width="9.8" height="9" rx="1.4" stroke="#0670C4" stroke-width="1.3"/><path d="M4.4 5.6h1.4M7.2 5.6h1.4M4.4 8.2h1.4M7.2 8.2h1.4" stroke="#0670C4" stroke-width="1.2" stroke-linecap="round"/></svg> THE CLIENT</div><p>Real depth. Yet only two posts on it — thin for someone who calls himself a specialist.</p></div>
        <div class="lens"><div class="lh"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.4" r="2.4" stroke="#0670C4" stroke-width="1.3"/><path d="M2.4 11c.6-2.4 2.2-3.6 4.1-3.6S10 8.6 10.6 11" stroke="#0670C4" stroke-width="1.3" stroke-linecap="round"/></svg> THE PEER</div><p>I know he is good. I could not tell you what he is <em>known</em> for.</p></div>
      </div>
    </div>
    <div class="panel">
      <div class="ph"><span class="t">A few lines from a real report</span><span class="m">NAME REMOVED</span></div>
      <div class="pb">
        <div class="mrow"><span class="mi2 b"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor"/></svg></span><span><span class="k">HOW THE MARKET SEES YOU</span><span class="v"><b>The Strategic Architect</b> — the person who builds the machinery that makes change actually work.</span></span></div>
        <div class="mrow"><span class="mi2 c"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.4 8h3l2-4.6L9 12.4l2-4.4h3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span><span class="k">HOW YOU SOUND</span><span class="v">Direct about what breaks organisations. Written like someone who has sat through 200 meetings.</span></span></div>
        <div class="mrow"><span class="mi2 a"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2.2l6 11.2H2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.4v3.2M8 11.4v.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span><span><span class="k">THE HONEST TRUTH</span><span class="v">The barrier is not time or ideas. You have been treating your experience as knowledge instead of a position in the market.</span></span></div>
      </div>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:46px">Two · Your posts and carousels</div>
  <div class="g2 rv">
    <div class="post">
      <div class="pph"><span class="av"></span><span><span class="pn">Your name</span><br><span class="pr">Your title · 2h</span></span></div>
      <p class="pbody">Most utilities treat the digital twin as an IT project.<br><br>Then they find the real asset was never the twin — it was trust in the data.<br><br>One national utility spent 85 million on the full stack. Eighteen months later the operations team still makes every call from the old system.</p>
      <div class="srcline"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.6" stroke="currentColor" stroke-width="1.2"/><path d="M4 6.6l1.9 2 3.3-3.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> MADE FROM AN ARTICLE YOU SAVED ON 14 JULY</div>
    </div>
    <div class="panel">
      <div class="ph"><span class="t">The carousel, designed for you</span><span class="m">NO DESIGNER NEEDED</span></div>
      <div class="pb">
        <div class="slides">
          <div class="sl" style="background:#0F1519;color:#fff">
            <svg class="shape" style="top:-14px;right:-14px" width="70" height="70" viewBox="0 0 70 70" fill="none"><circle cx="40" cy="30" r="26" stroke="#00CEC9" stroke-opacity=".35"/><circle cx="40" cy="30" r="16" stroke="#00CEC9" stroke-opacity=".2"/></svg>
            <span class="n">01</span><span class="t">The twin was<br><span style="color:#00CEC9">never the asset</span></span>
          </div>
          <div class="sl" style="background:#0670C4;color:#fff">
            <svg class="shape" style="right:10px;top:26px" width="56" height="42" viewBox="0 0 56 42" fill="none"><rect x="2" y="24" width="10" height="16" rx="2" fill="#fff" fill-opacity=".3"/><rect x="16" y="16" width="10" height="24" rx="2" fill="#fff" fill-opacity=".45"/><rect x="30" y="8" width="10" height="32" rx="2" fill="#fff" fill-opacity=".6"/><rect x="44" y="2" width="10" height="38" rx="2" fill="#fff" fill-opacity=".8"/></svg>
            <span class="n">02</span><span class="t" style="font-size:19px">85m spent<br><span style="font-size:10px;font-weight:500;opacity:.85">over 18 months</span></span>
          </div>
          <div class="sl" style="background:#EFF4FA;border:1px solid #D2D8E0;color:#0F1519">
            <svg class="shape" style="top:10px;right:10px" width="30" height="28" viewBox="0 0 30 28" fill="none"><path d="M15 3l12 22H3z" stroke="#E0A82E" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 11v6M15 20v1.4" stroke="#E0A82E" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="n">03</span><span class="t">Operations still<br>use the old system</span>
          </div>
          <div class="sl" style="background:#0F1519;color:#00CEC9">
            <svg class="shape" style="right:10px;top:26px" width="66" height="66" viewBox="0 0 66 66" fill="none"><path d="M12 46L48 14M32 14h16v16" stroke="#00CEC9" stroke-opacity=".3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="n">04</span><span class="t">Trust in the data<br>is the real asset</span>
          </div>
        </div>
        <div class="chipg"><span>No designer fee</span><span>No design tool</span><span>No hours lost</span></div>
      </div>
    </div>
  </div>

  <div class="trio rv" style="margin-top:22px">
    <div class="bene"><div class="big k" style="font-size:30px">As often<br>as you like</div><div class="det">No weekly quota. Save two articles and publish two. Save ten and publish ten. It follows your reading, not a calendar.</div></div>
    <div class="bene"><div class="big k" style="font-size:30px">With the<br>source shown</div><div class="det">Every post carries the article it came from. When someone asks “where did you get this?”, you have the answer ready.</div></div>
    <div class="bene"><div class="big k" style="font-size:30px">In English<br>or Arabic</div><div class="det">Each written properly in its own language. One is never a translation of the other.</div></div>
  </div>
</section>

<section class="pg" id="why">
  <div class="hdr">
    <span class="tag">The cost of one more quiet year</span>
    <h2>You read a lot.<br><span class="grad">Nobody ever sees it.</span></h2>
    <p class="sub">Five hours a week of reading, and none of it reaches the people who decide about you.</p>
  </div>

  <div class="ledger rv">
    <div class="head"><span>YOUR WEEK, AS A LEDGER</span><span>MON – FRI</span></div>
    <div class="row">
      <div>
        <span class="main">The report you read at 6am</span>
        <span class="sub">Two sharp numbers you quoted all day</span>
      </div>
      <span class="status">GONE BY FRIDAY</span>
    </div>
    <div class="row">
      <div>
        <span class="main">The argument you won in a meeting</span>
        <span class="sub">A position it took you years to be able to take</span>
      </div>
      <span class="status">NEVER WRITTEN</span>
    </div>
    <div class="row">
      <div>
        <span class="main">The article you sent to a colleague</span>
        <span class="sub">With one line of your own on top — your best line that week</span>
      </div>
      <span class="status">LOST IN CHAT</span>
    </div>
    <div class="row">
      <div>
        <span class="main">The pattern you noticed before others</span>
        <span class="sub">The thing that makes you worth calling</span>
      </div>
      <span class="status">IN YOUR HEAD ONLY</span>
    </div>
    <div class="total">
      <span class="q">What your market saw of all this</span>
      <span class="a">NOTHING</span>
    </div>
  </div>

  <div class="turn rv">
    <h3>Same week. One tap different.</h3>
    <p>Everything above, kept the moment you touched it — with its source attached. By dawn the best of it is a draft in your voice: a post, a carousel, in English or Arabic. You read it over coffee and decide.</p>
    <p class="mono">SAME READING · SAME HOURS · NOTHING EXTRA TO DO</p>
  </div>

  <div class="eyebrow">A year of your reading</div>
  <div class="wide rv">
    <svg viewBox="0 0 900 250" fill="none">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0670C4"/><stop offset="1" stop-color="#EFF4FA"/></linearGradient>
        <linearGradient id="rise" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E0F7F6"/><stop offset="1" stop-color="#00CEC9"/></linearGradient>
      </defs>
      <text x="10" y="20" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.5" fill="#9AA4B0">TODAY, WITHOUT AURA</text>
      <rect x="10" y="32" width="600" height="46" rx="10" fill="url(#fade)"/>
      <text x="30" y="61" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" id="dHours">260 hours of reading</text>
      <path class="dash" d="M618 55h100" stroke="#C0392B" stroke-width="1.4"/>
      <circle cx="760" cy="55" r="34" fill="#FDECEA" stroke="#C0392B" stroke-width="1.4"/>
      <text x="760" y="63" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="24" font-weight="600" fill="#C0392B">0</text>
      <text x="822" y="59" font-family="Inter, sans-serif" font-size="12" fill="#66707D">posts written</text>
      <text x="10" y="100" font-family="IBM Plex Mono, monospace" font-size="9.5" letter-spacing="1.3" fill="#C0392B" id="dCost">= SAR 78,000 OF YOUR OWN TIME, AND NOTHING TO SHOW</text>
      <path d="M10 122h880" stroke="#E2E7EE"/>
      <text x="10" y="152" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.5" fill="#00807B">WITH AURA</text>
      <rect x="10" y="164" width="600" height="46" rx="10" fill="url(#rise)"/>
      <text x="30" y="193" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#0F1519" id="dHours2">the same 260 hours</text>
      <path d="M618 187h100" stroke="#00CEC9" stroke-width="1.8"/>
      <circle cx="760" cy="187" r="34" fill="#0F1519"/>
      <text x="760" y="195" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="#00CEC9">50+</text>
      <text x="822" y="184" font-family="Inter, sans-serif" font-size="12" fill="#66707D">posts, in</text>
      <text x="822" y="200" font-family="Inter, sans-serif" font-size="12" fill="#66707D">your voice</text>
    </svg>

    <div class="calc">
      <p class="ct">Change these to your own hours and rate.</p>
      <div class="curr"><button data-curr="SAR" aria-pressed="true">SAR</button><button data-curr="AED" aria-pressed="false">AED</button><button data-curr="USD" aria-pressed="false">USD</button></div>
      <div class="srow"><label for="hrs">Hours you read each week</label><output id="hrs-o" for="hrs">5</output></div>
      <input id="hrs" type="range" min="1" max="14" step="0.5" value="5" aria-label="Hours you read each week">
      <div class="srow"><label for="rt">An hour of your time is worth</label><output id="rt-o" for="rt">SAR 300</output></div>
      <input id="rt" type="range" min="50" max="900" step="25" value="300" aria-label="Value of an hour of your time">
      <p class="ct" style="margin:14px 0 0"><span id="own">260 hrs</span> a year · <span id="cost">SAR 78,000</span> of your own time</p>
      <p class="ct" style="margin-top:10px">A ghostwriter charges SAR 1,000–3,000 a month — and writes from a briefing call, not from your actual reading.</p>
      <p class="ct" id="kick" style="margin-top:6px"></p>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:28px">What people pay for the pieces, every month</div>
  <div class="wide rv">
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A ghostwriter</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:88%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$50–400</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A positioning consultant</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:66%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$30–300</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A designer</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:40%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$30–160</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A posting tool</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:26%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$20–100</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">An AI writing tool</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:18%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$20–40</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center"><span style="font-size:13.5px;color:#0F1519;font-weight:600">Aura, all of it</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:100%;border-radius:7px;background:linear-gradient(90deg,#7FD3B4,#12805C)"></i></span><span class="mi" style="text-align:right;color:#12805C;font-weight:700">${SEAT_PRICE.split(" ")[0]}</span></div>
    <p style="margin-top:16px;font-size:13.5px;color:var(--ink3);line-height:1.7">Your report is free and stays free. The part that runs every night is ${SEAT_PRICE} — and a founding seat locks that price for as long as you keep it.</p>
    <p class="mi" style="margin-top:12px;line-height:1.7">EXAMPLE FIGURES, ADJUSTABLE TO YOUR OWN HOURS AND RATE. WE DO NOT PROMISE FOLLOWERS OR LIKES.</p>
  </div>
</section>

<section class="pg" id="cmp">
  <div class="hdr">
    <span class="tag">Against every other option</span>
    <h2>They hand out templates.<br><span class="grad">We start with you.</span></h2>
    <p class="sub">Every other tool gives all its customers the same shapes. Aura learns you first.</p>
  </div>


  <div class="eyebrow">Side by side</div>
  <div class="cmp rv">
    <table>
      <thead><tr><th></th><th class="us">Aura</th><th>AI chat<br>tools</th><th>Content writing<br>tools</th><th>Design<br>tools</th><th>Ghostwriters &amp;<br>content writers</th></tr></thead>
      <tbody>
        <tr><td>Learns what you are good at first</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>Built on your own experience and reading</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>Not a template used by everyone</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>Writes in your own voice</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td><td><span class="dN"></span></td><td><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td></tr>
        <tr><td>Shows the source behind each claim</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td></tr>
        <tr><td>Designs the carousel too</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td></tr>
        <tr><td>Works while you sleep</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dP"></span></td></tr>
        <tr><td>All of it in one place</td><td class="us"><span class="dY"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td><td><span class="dN"></span></td></tr>
      </tbody>
    </table>
  </div>
  <p class="mi" style="text-align:center;margin-top:14px">● FULLY &nbsp; ◐ PARTLY &nbsp; ○ NOT AT ALL</p>

  <div class="trio rv" style="margin-top:26px">
    <div class="bene">
      <div class="viz"><svg width="150" height="80" viewBox="0 0 150 80" fill="none">
        <rect x="2" y="12" width="42" height="56" rx="6" fill="#EFF4FA" stroke="#D2D8E0"/><rect x="54" y="12" width="42" height="56" rx="6" fill="#EFF4FA" stroke="#D2D8E0"/><rect x="106" y="12" width="42" height="56" rx="6" fill="#EFF4FA" stroke="#D2D8E0"/>
        <g stroke="#D2D8E0" stroke-width="1.3" stroke-linecap="round"><path d="M10 26h26M10 34h26M10 42h16M62 26h26M62 34h26M62 42h16M114 26h26M114 34h26M114 42h16"/></g>
      </svg></div>
      <div class="big k" style="font-size:28px">Ready-made<br>templates</div>
      <div class="det">A template is a shape someone else designed, handed to thousands of people. Your name goes on top, but the thinking inside is not yours — and it looks exactly like everyone else's.</div>
    </div>
    <div class="bene">
      <div class="viz"><svg width="170" height="80" viewBox="0 0 170 80" fill="none">
        <rect x="2" y="14" width="92" height="52" rx="8" fill="none" stroke="#D2D8E0" stroke-dasharray="5 5"/>
        <text x="48" y="45" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#9AA4B0">empty</text>
        <path class="dash" d="M100 40h24" stroke="#D2D8E0" stroke-width="1.4"/>
        <circle cx="144" cy="40" r="18" fill="#FDECEA" stroke="#C0392B"/>
        <text x="144" y="47" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#C0392B">?</text>
      </svg></div>
      <div class="big k" style="font-size:28px">They wait<br>for your words</div>
      <div class="det">A tool that starts empty needs you to know what to say, and to type it. If you already knew and had the time, you would have posted last week.</div>
    </div>
    <div class="bene" style="background:linear-gradient(180deg,var(--bluetint),var(--white))">
      <div class="viz"><svg width="180" height="80" viewBox="0 0 180 80" fill="none">
        <circle cx="26" cy="40" r="20" fill="#0670C4"/><path d="M18 40l6 7 13-15" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path class="dash" d="M52 40h30" stroke="#00CEC9" stroke-width="1.6"/>
        <rect x="88" y="12" width="88" height="56" rx="9" fill="#0F1519"/>
        <g stroke="#00CEC9" stroke-width="1.6" stroke-linecap="round"><path d="M100 30h58M100 40h58M100 50h34"/></g>
      </svg></div>
      <div class="big b" style="font-size:28px">We learn<br>you first</div>
      <div class="det">Aura respects what you already know. It reads your experience and your reading, works out what only you can say — and only then writes. <b>Nobody else gets your version.</b></div>
    </div>
  </div>

  <div class="refuse rv">
    <div class="refuse-in">
      <div class="kick">THE PART NOBODY ADVERTISES</div>
      <h2>It throws away most of what it writes.</h2>
      <p class="body">Every draft is judged before it ever reaches you — against what you actually said, in your own register, with a real ending. Most do not survive. You only meet the ones that did.</p>
      <div class="bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <p class="cap">Written five times. Shown once. That is the point.</p>
      <p class="close">Every other tool hands you everything it generates and lets you sort it out.</p>
    </div>
  </div>
</section>

<section class="pg" id="price">
  <div class="hdr">
    <span class="tag">One road, one seat</span>
    <h2>Seeing yourself is free.<br><span class="grad">Being seen is not.</span></h2>
    <p class="sub">One free road, walked in one sitting. One seat, if what you saw is worth keeping true.</p>
  </div>

  <div class="ptwo rv">
    <div class="pcard road">
      <div class="ptop"><span class="plab">THE ROAD · FREE</span><span class="pchip">STARTS WITHOUT AN ACCOUNT</span></div>
      <h3>See yourself the way the market does.</h3>
      <div class="prc"><span class="p">Free</span><span class="u">all of it, forever — not a trial</span></div>
      <div class="stops">
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">MINUTE 1</div><div class="sh">Paste your LinkedIn address</div><div class="sb">That&rsquo;s all it asks to begin. No account, no card, no email.</div></div>
        </div>
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">MINUTE 3 · THE QUICK READ</div><div class="sh">How you come across, in plain words</div><div class="sb">Most people stop here and just look for a while.</div></div>
        </div>
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">MINUTE 8 · IF YOU KEEP GOING</div><div class="sh">Your CV against what&rsquo;s public</div><div class="sb">Where the two disagree — and what each one is hiding.</div></div>
        </div>
        <div class="stop">
          <span class="pin"></span>
          <div><div class="st">MINUTE 15 · THE FULL PICTURE</div><div class="sh">Your capability map, your position, your three subjects</div><div class="sb">How a headhunter, a client and a peer each read you.</div></div>
        </div>
        <div class="stop last">
          <span class="pin"></span>
          <div><div class="st">AT THE END — THE ONLY THING WE ASK</div><div class="sh">Your email, so the report is kept</div><div class="sb">Asked once, at the end, when there&rsquo;s something worth keeping. The full report arrives as a PDF, and it&rsquo;s yours for good.</div></div>
        </div>
      </div>
      <div class="pcta"><a class="btn bp" href="/assessment">${FREE_CTA}</a><p class="undr">Stop anywhere. Everything to that point still happens.</p></div>
    </div>

    <div class="pcard seat night">
      <div class="ptop"><span class="plab">THE SEAT · THE LOOP</span><span class="pchip">FOUNDING · WAVES OF TEN</span></div>
      <h3>Then make sure people find out. Every week.</h3>
      <p class="who">The road tells you who you are. The seat is who you become, week after week — without adding work to your week.</p>
      <div class="prc"><span class="p">${SEAT_PRICE.split(" ")[0]}</span><span class="u">a month · locked while you keep the seat</span></div>
      <ul class="ticks">
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Everything you read, kept and searchable for good</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Posts and carousels written by dawn, in your voice</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>The source shown behind every claim</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>English or Arabic — written, not translated</span></li>
        <li><span class="tk"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2.4 5.6l2.2 2.4 4.2-5" stroke="#00CEC9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Your identity rewritten every quarter, as you move</span></li>
      </ul>
      <p class="lock"><b>Fifty founding seats, ten at a time</b> — because one founder sets each person up himself, properly. <b>The price belongs to your seat, not to a date.</b> Wave two opens when wave one members are publishing.</p>
      <div class="pcta"><a class="btn bwhite" href="${SEAT_PATH}">${SEAT_CTA}</a><p class="undr">${SEAT_NO_CARD}</p></div>
    </div>
  </div>

  <p class="bridge">Walk the road first. The seat will still be here — and you&rsquo;ll know exactly what you&rsquo;re paying to keep alive.</p>

  <div class="founder">
    <img src="/aura-founder.jpg" alt="Mohammad Mahafdhah">
    <div class="t"><b>Mohammad Mahafdhah</b> — I built Aura from my own reading, because I had the same problem. Write to me directly and I will answer.</div>
  </div>

  <div class="hdr" style="margin-top:56px">
    <span class="tag">Answered straight</span>
    <h2>What people ask<br><span class="grad">before joining.</span></h2>
    <p class="sub">No hedging and no small print. Where the answer is no, it says no.</p>
  </div>
  <div style="max-width:760px;margin:0 auto">
    <details open><summary>What does &ldquo;free&rdquo; mean exactly?</summary><p>Your report is free permanently — not a trial. The part that runs every night, writing and designing while you sleep, is ${SEAT_PRICE}. A founding seat locks that price for as long as you keep it, and I onboard you personally. ${SEAT_NO_CARD}</p></details>
    <details><summary>Can I stop?</summary><p>Any month. Everything you kept and everything you wrote stays yours.</p></details>
    <details><summary>Will it sound like AI?</summary><p>It learns from what you have already written — how you open, how long your sentences run, how you land a point. And it deletes its own drafts that do not pass as you, before you ever see them. If one still gets through, you say so, and it learns.</p></details>
    <details><summary>How much of my time does this take?</summary><p>${ASSESSMENT_QUESTIONS_PHRASE.replace(/^./, (c) => c.toUpperCase())} once at the start. After that, one tap when you read something good, and about two minutes to approve a post. Nothing more.</p></details>
    <details><summary>How many posts will I get?</summary><p>As many as you want. There is no weekly quota. Save two articles and you can publish two posts; save ten and you can publish ten. It follows your reading, not a calendar.</p></details>
    <details><summary>Do I need a designer for the carousels?</summary><p>No. Aura designs them for you, ready to post — no design tool, no design skill, no fee.</p></details>
    <details><summary>Does it work in Arabic?</summary><p>Yes. Arabic is written as Arabic and English as English. One is never a translation of the other.</p></details>
    <details><summary>Who owns what I save?</summary><p>You do. Your articles, your notes, your posts. We never use your work to help anyone else.</p></details>
  </div>

  <div class="dark rv"><div class="dark-in" style="grid-template-columns:1fr;text-align:center">
    <div>
      <h3 style="max-width:none;margin:0 auto">Still deciding?<br><em style="font-style:italic;color:var(--ink4)">Then just take the free report.</em></h3>
      <p style="max-width:460px;margin:12px auto 0">It is yours whether you ever pay us or not. If it shows you something you did not know about yourself, the seat will still be here.</p>
      <div style="margin-top:22px;display:flex;gap:11px;justify-content:center;flex-wrap:wrap">
        <a class="btn bp" href="/assessment">${FREE_CTA}</a>
      </div>
      <p class="closing-note">Ninety seconds, free, and yours to keep.</p>
    </div>
  </div></div>
</section>

<div class="foot">
  <span>AURA · AURA-INTEL.ORG · BUILT IN RIYADH</span>
  <span><a href="/our-story">Our story</a> · <a href="/guide">Guide</a> · <a href="/trust">Security and trust</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
</div>

</div>
`;

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

const LandingV2 = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  usePageMeta({
    title: `Aura — ${BRAND.headline.replace(/\.$/, "")}`,
    description:
      "Aura finds what makes you credible, organises the evidence behind it, and turns it into positioning, content and proof. The assessment is free and yours to keep.",
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
  }, [mounted]);



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
      alt.textContent = signedIn ? "Sign out" : "Sign in";
      alt.setAttribute("href", signedIn ? "#" : "/auth");
      if (signedIn) alt.dataset.signout = "1";
      else delete alt.dataset.signout;
    }
    if (cta) {
      cta.innerHTML = `${signedIn ? "Open Aura" : FREE_CTA_SHORT_LABEL} <span class="a">↗</span>`;
      cta.setAttribute("href", signedIn ? "/home" : "/assessment");
    }
    if (hero) {
      hero.textContent = signedIn ? "Open Aura" : FREE_CTA;
      hero.setAttribute("href", signedIn ? "/home" : "/assessment");
    }
  }, [signedIn, mounted]);

  /* ── calculator + in-app link interception ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

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
      if (hoursOut) hoursOut.textContent = String(h);
      if (rateOut) rateOut.textContent = money(curr, r);
      if (own) own.textContent = `${Math.round(annual).toLocaleString("en-US")} hrs`;
      if (cost) cost.textContent = money(curr, annual * r);
      const annualRounded = Math.round(annual).toLocaleString("en-US");
      if (dHours) dHours.textContent = `${annualRounded} hours of reading`;
      if (dHours2) dHours2.textContent = `the same ${annualRounded} hours`;
      if (dCost) dCost.textContent = `= ${money(curr, annual * r)} OF YOUR OWN TIME, AND NOTHING TO SHOW`;
      if (kicker) {
        const weeks = annual / 40;
        const months = weeks / 4.33;
        const unit =
          months >= 1.6
            ? `${spell(Math.round(months))} working month${Math.round(months) === 1 ? "" : "s"}`
            : `${spell(Math.floor(weeks))} working week${Math.floor(weeks) === 1 ? "" : "s"}`;
        kicker.innerHTML = `<strong>${unit}</strong> of thinking, written off every year. <strong>One tap to keep it.</strong>`;
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
  }, [mounted, navigate]);

  /* ── tabs: six pages, one at a time ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement)?.closest?.("[data-p]") as HTMLElement | null;
      if (!b) return;
      e.preventDefault();
      const id = b.dataset.p!;
      root.querySelectorAll<HTMLElement>(".pg").forEach(s => s.classList.toggle("on", s.id === id));
      root.querySelectorAll<HTMLElement>(".links button").forEach(x => x.classList.toggle("on", x.dataset.p === id));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [mounted]);

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
  }, [mounted]);

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
  }, [mounted]);

  return (
    <>
      <style>{LANDING_V2_CSS}</style>
      <div
        ref={rootRef}
        className="aura-v2"
        dangerouslySetInnerHTML={{ __html: LANDING_V2_HTML }}
      />
    </>
  );
};

export default LandingV2;
