import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { signOutAndLand } from "@/lib/signOut";

/* ────────────────────────────────────────────────────────────────
   LandingV2 — six tabbed pages, one at a time.
   The file is two template strings (CSS + HTML) plus DOM effects
   scoped to rootRef. Everything is scoped under .aura-v2.
   ──────────────────────────────────────────────────────────────── */

const LANDING_V2_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
.aura-v2{--ink:#0B1220;--ink2:#37424F;--ink3:#66707D;--ink4:#9AA4B0;--line:#E4E8EE;--line2:#D2D8E0;--white:#FFF;--canvas:#F7F9FC;--tint:#EFF4FA;--blue:#0670C4;--blue2:#04477C;--bluetint:#E7F1FB;--cyan:#00CEC9;--cyanT:#00807B;--cyantint:#E0F7F6;--amber:#E0A82E;--amberT:#95690F;--ambertint:#FDF3DF;--red:#C0392B;--green:#12805C;--greentint:#E4F6EC;--ui:"Inter",system-ui,sans-serif;--mono:"IBM Plex Mono",monospace;--sp:cubic-bezier(.16,1,.3,1);font-family:var(--ui);background:var(--canvas);color:var(--ink);-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh}
.aura-v2 .nav{position:sticky;top:0;z-index:60;background:rgba(247,249,252,.88);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
.aura-v2 .nav-in{max-width:1240px;margin:0 auto;padding:0 34px;height:66px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.aura-v2 .logo{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;letter-spacing:-.02em;cursor:pointer;color:var(--ink);text-decoration:none}
.aura-v2 .tabs{display:flex;gap:2px}
.aura-v2 .tabs button{font-family:var(--ui);font-size:13.5px;font-weight:500;color:var(--ink3);background:none;border:none;padding:9px 15px;border-radius:8px;cursor:pointer;transition:160ms var(--sp);white-space:nowrap}
.aura-v2 .tabs button:hover{color:var(--ink);background:var(--tint)}
.aura-v2 .tabs button.on{color:var(--blue);background:var(--bluetint);font-weight:600}
.aura-v2 .navwrap{display:flex;align-items:center;gap:10px}
.aura-v2 .navalt{font-size:13px;color:var(--ink3);text-decoration:none;padding:8px 10px}
.aura-v2 .navalt:hover{color:var(--ink)}
.aura-v2 .navcta{font-weight:600;font-size:13.5px;background:var(--ink);color:#fff;border:none;padding:11px 19px;border-radius:8px;cursor:pointer;text-decoration:none;transition:180ms var(--sp);display:inline-block}
.aura-v2 .navcta:hover{background:var(--blue);transform:translateY(-1px)}
.aura-v2 .stage{max-width:1240px;margin:0 auto;padding:46px 34px 76px}
.aura-v2 .pg{display:none}
.aura-v2 .pg.on{display:block;animation:auraIn .45s var(--sp)}
@keyframes auraIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.aura-v2 .tag{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);background:var(--bluetint);padding:6px 12px;border-radius:999px}
.aura-v2 h1{font-size:clamp(38px,5.4vw,62px);font-weight:700;letter-spacing:-.035em;line-height:1.03;margin-top:20px}
.aura-v2 h2{font-size:clamp(30px,4vw,48px);font-weight:700;letter-spacing:-.034em;line-height:1.06;margin-top:16px}
.aura-v2 .grad{background:linear-gradient(96deg,var(--blue),var(--cyanT));-webkit-background-clip:text;background-clip:text;color:transparent}
.aura-v2 .sub{font-size:clamp(16px,1.75vw,19px);color:var(--ink3);line-height:1.6;margin-top:18px;max-width:520px}
.aura-v2 .sub b{color:var(--ink);font-weight:600}
.aura-v2 .hdr{text-align:center;max-width:700px;margin:0 auto 44px}
.aura-v2 .hdr .sub{margin-left:auto;margin-right:auto;max-width:560px}
.aura-v2 .eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink4);display:flex;align-items:center;gap:12px;margin-bottom:24px}
.aura-v2 .eyebrow::after{content:"";flex:1;height:1px;background:var(--line)}
.aura-v2 .btn{font-family:var(--ui);font-weight:600;font-size:14.5px;padding:14px 26px;border:none;border-radius:9px;cursor:pointer;transition:200ms var(--sp);text-decoration:none;display:inline-block}
.aura-v2 .bp{background:var(--blue);color:#fff}
.aura-v2 .bp:hover{background:var(--blue2);transform:translateY(-2px);box-shadow:0 10px 26px rgba(6,112,196,.26)}
.aura-v2 .bg2{background:var(--white);color:var(--ink);border:1px solid var(--line2)}
.aura-v2 .bg2:hover{border-color:var(--ink);transform:translateY(-2px)}
.aura-v2 .acts{display:flex;gap:11px;margin-top:30px;align-items:center;flex-wrap:wrap}
.aura-v2 .seat{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--amberT);background:var(--ambertint);padding:8px 13px;border-radius:999px}
.aura-v2 .seatdot{width:6px;height:6px;border-radius:999px;background:var(--amber)}
.aura-v2 .mi{font-family:var(--mono);font-size:10.5px;color:var(--ink4);letter-spacing:.07em}
.aura-v2 .big{font-size:clamp(34px,3.8vw,46px);font-weight:700;letter-spacing:-.038em;line-height:.98}
.aura-v2 .big.b{color:var(--blue)}.aura-v2 .big.c{color:var(--cyanT)}.aura-v2 .big.k{color:var(--ink)}.aura-v2 .big.r{color:var(--red)}
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
.aura-v2 .orb{animation:auraSpin 44s linear infinite;transform-origin:250px 250px}
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
.aura-v2 .dark .jf,.aura-v2 .dark .seatline{display:block;width:100%;text-align:center}
.aura-v2 .jf{font-family:var(--mono);font-size:10px;color:#65707E;letter-spacing:.09em;margin-top:16px;line-height:1.8}
.aura-v2 .founder{display:flex;gap:15px;align-items:center;background:var(--white);border:1px solid var(--line);border-radius:16px;padding:19px;margin:18px auto 0;max-width:640px}
.aura-v2 .founder img{width:48px;height:48px;border-radius:999px;object-fit:cover;flex-shrink:0}
.aura-v2 .founder .t{font-size:14px;color:var(--ink3);line-height:1.55}
.aura-v2 .founder .t b{color:var(--ink)}
.aura-v2 .foot{border-top:1px solid var(--line);margin-top:56px;padding:20px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.aura-v2 .foot span,.aura-v2 .foot a{font-family:var(--mono);font-size:10px;color:var(--ink4);letter-spacing:.09em;text-decoration:none}
.aura-v2 .foot a:hover{color:var(--blue)}
.aura-v2 .rv{opacity:0;transform:translateY(16px);transition:750ms var(--sp)}
.aura-v2 .rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.aura-v2 .rv{opacity:1;transform:none;transition:none}.aura-v2 .orb,.aura-v2 .pulse,.aura-v2 .dash{animation:none}.aura-v2 .pg.on{animation:none}}
@media(max-width:1000px){
.aura-v2 .hero,.aura-v2 .trio,.aura-v2 .quad,.aura-v2 .g2,.aura-v2 .g3,.aura-v2 .dark-in,.aura-v2 .savegrid{grid-template-columns:1fr}
.aura-v2 .bene{border-right:none;border-bottom:1px solid var(--line)}
.aura-v2 .bene:last-child{border-bottom:none}
.aura-v2 .sv{padding:0 0 20px;border-right:none;border-bottom:1px solid rgba(255,255,255,.11)}
.aura-v2 .sv:last-child{border-bottom:none;padding-bottom:0}
.aura-v2 .nav-in{flex-wrap:wrap;height:auto;padding:12px 18px;gap:10px}
.aura-v2 .tabs{order:3;width:100%;overflow-x:auto}
.aura-v2 .stage{padding:28px 18px 50px}
.aura-v2 .slides{grid-template-columns:repeat(2,1fr)}
.aura-v2 .cmp{overflow-x:auto}
.aura-v2 .cmp table{min-width:640px}
.aura-v2 .wide{padding:20px 16px;overflow-x:auto}}
`;

const LANDING_V2_HTML = `
<nav class="nav"><div class="nav-in">
  <a class="logo" href="#" data-p="home"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10.2" stroke="#0B1220" stroke-width="1.5"/><circle cx="12" cy="12" r="3.4" fill="#0670C4"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" stroke="#00CEC9" stroke-width="1.5" stroke-linecap="round"/></svg> Aura</a>
  <div class="tabs">
    <button data-p="home" class="on">Home</button><button data-p="how">How it works</button><button data-p="get">What you get</button><button data-p="why">Why now</button><button data-p="cmp">Compare</button><button data-p="faq">Questions</button>
  </div>
  <div class="navwrap">
    <a class="navalt" id="navalt" href="/auth">Sign in</a>
    <a class="navcta" id="navcta" href="/request-access">Request a founder seat</a>
  </div>
</div></nav>

<div class="stage">

<section class="pg on" id="home">
  <div class="hero">
    <div>
      <span class="tag"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="2.6" fill="#0670C4"/><path d="M6 .8v1.8M6 9.4v1.8M.8 6h1.8M9.4 6h1.8M2.3 2.3l1.3 1.3M8.4 8.4l1.3 1.3M9.7 2.3L8.4 3.6M3.6 8.4l-1.3 1.3" stroke="#0670C4" stroke-width="1.1" stroke-linecap="round"/></svg> Personal intelligence system</span>
      <h1>You know a lot.<br><span class="grad">Not enough people<br>know it.</span></h1>
      <p class="sub">Aura tells you what you are truly good at — then turns what you read into <b>LinkedIn posts and carousels</b> in your own style.</p>
      <div class="acts">
        <a class="btn bp" id="heropri" href="/request-access">Join free</a>
        <button class="btn bg2" data-p="how">See how it works</button>
        <span class="seat"><span class="seatdot"></span><span class="seatline"></span></span>
        <span class="mi">NO CARD</span>
      </div>
    </div>
    <div class="loopwrap">
      <svg viewBox="0 0 500 500" fill="none">
        <circle cx="250" cy="250" r="185" stroke="#E4E8EE" stroke-width="1.2"/>
        <circle class="dash" cx="250" cy="250" r="150" stroke="#D2D8E0" stroke-width="1.2"/>
        <defs>
          <linearGradient id="arcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0670C4"/><stop offset="1" stop-color="#00CEC9"/></linearGradient>
        </defs>
        <path d="M250 65a185 185 0 0 1 185 185" stroke="url(#arcg)" stroke-width="3" stroke-linecap="round"/>
        <g class="orb"><circle cx="435" cy="250" r="6" fill="#00CEC9"/></g>
        <path class="dash" d="M250 178V128M322 250h50M250 322v50M178 250h-50" stroke="#D2D8E0" stroke-width="1.2"/>
        <circle cx="250" cy="250" r="72" fill="#0B1220"/>
        <text x="250" y="243" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="36" font-weight="600" fill="#FFFFFF">85</text>
        <text x="250" y="262" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.5" letter-spacing="1.6" fill="#00CEC9">YOUR IMPRINT</text>
        <text x="250" y="277" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" fill="#8E99A6">rises every week</text>

        <circle cx="250" cy="95" r="40" fill="#FFFFFF" stroke="#E4E8EE"/>
        <g stroke="#0670C4" stroke-width="1.6" stroke-linecap="round"><path d="M236 88h28M236 95h28M236 102h18"/></g>
        <text class="nodeL" x="250" y="42" text-anchor="middle">1 · YOU READ</text>
        <text class="nodeS" x="250" y="58" text-anchor="middle">One tap. One second.</text>

        <circle cx="405" cy="250" r="40" fill="#FFFFFF" stroke="#E4E8EE"/>
        <g class="pulse"><circle cx="405" cy="250" r="13" stroke="#0670C4" stroke-width="1.6" fill="none"/><circle cx="405" cy="250" r="4.5" fill="#00CEC9"/></g>
        <text class="nodeL" x="405" y="196" text-anchor="middle">2 · IT LEARNS</text>
        <text class="nodeS" x="405" y="212" text-anchor="middle">Your subjects, your voice.</text>

        <circle cx="250" cy="405" r="40" fill="#FFFFFF" stroke="#E4E8EE"/>
        <path d="M254 391l-11 15h9l-3 12 12-16h-9z" fill="#E0A82E"/>
        <text class="nodeL" x="250" y="464" text-anchor="middle">3 · IT WRITES AT NIGHT</text>

        <circle cx="95" cy="250" r="40" fill="#FFFFFF" stroke="#E4E8EE"/>
        <path d="M83 250l8 9 17-19" stroke="#00807B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <text class="nodeL" x="95" y="196" text-anchor="middle">4 · YOU APPROVE</text>
        <text class="nodeS" x="95" y="212" text-anchor="middle">One click. It is live.</text>
      </svg>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:56px">What Aura does for you</div>
  <div class="trio rv">
    <div class="bene">
      <span class="step">01</span>
      <div class="viz"><svg width="120" height="90" viewBox="0 0 120 90" fill="none">
        <circle cx="60" cy="45" r="34" stroke="#E4E8EE"/><circle cx="60" cy="45" r="22" stroke="#EFF4FA"/>
        <circle cx="60" cy="45" r="30" stroke="#E0A82E" stroke-width="1.2" stroke-dasharray="3 4"/>
        <path d="M60 11v68M26 45h68M36 21l48 48M84 21L36 69" stroke="#EFF4FA"/>
        <path d="M60 19 84 34 78 62 60 72 38 60 34 33Z" fill="#0670C4" fill-opacity=".18" stroke="#0670C4" stroke-width="1.4"/>
      </svg></div>
      <div class="big b">Know</div>
      <div class="rest">your strengths, your skills,<br>and what you stand for.</div>
      <div class="det">Ten questions and your profile become a real report: the subjects you truly own, the space nobody else holds, and the two things to improve next. <b>Most people have never seen this about themselves.</b></div>
    </div>
    <div class="bene">
      <span class="step">02</span>
      <div class="viz"><svg width="150" height="90" viewBox="0 0 150 90" fill="none">
        <rect x="2" y="26" width="34" height="42" rx="5" fill="#FFF" stroke="#E4E8EE"/>
        <rect x="14" y="20" width="34" height="42" rx="5" fill="#FFF" stroke="#D2D8E0"/>
        <rect x="26" y="14" width="34" height="42" rx="5" fill="#FFF" stroke="#0670C4"/>
        <path class="dash" d="M64 40h22" stroke="#00CEC9" stroke-width="1.4"/>
        <rect x="90" y="14" width="56" height="60" rx="10" fill="#0B1220"/>
        <g fill="#00CEC9"><circle cx="104" cy="30" r="3"/><circle cx="118" cy="30" r="3"/><circle cx="132" cy="30" r="3"/><circle class="pulse" cx="104" cy="44" r="3"/><circle cx="118" cy="44" r="3"/><circle cx="132" cy="44" r="3"/><circle cx="104" cy="58" r="3"/><circle cx="118" cy="58" r="3"/><circle cx="132" cy="58" r="3"/></g>
      </svg></div>
      <div class="big k">Nothing lost</div>
      <div class="rest">from your experience<br>and everything you read.</div>
      <div class="det">Every article you save is broken into pieces and kept. An idea you read in March is still there, ready to use, in November. <b>Your reading stops disappearing.</b></div>
    </div>
    <div class="bene">
      <span class="step">03</span>
      <div class="viz"><svg width="180" height="90" viewBox="0 0 180 90" fill="none">
        <rect x="0" y="12" width="86" height="66" rx="10" fill="#0B1220"/>
        <path d="M28 30a13 13 0 1 0 12 19 15 15 0 0 1-12-19Z" fill="#E0A82E"/>
        <g fill="#00CEC9"><circle cx="56" cy="28" r="1.6"/><circle cx="66" cy="38" r="1.2"/><circle cx="50" cy="45" r="1.2"/></g>
        <text x="12" y="68" font-family="IBM Plex Mono, monospace" font-size="7.5" letter-spacing="1.1" fill="#8E99A6">02:00 → DAWN</text>
        <path class="dash" d="M90 45h16" stroke="#D2D8E0" stroke-width="1.3"/>
        <rect x="110" y="16" width="42" height="34" rx="6" fill="#FFF" stroke="#E4E8EE"/>
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
  </div></div>
</section>

<section class="pg" id="how">
  <div class="hdr">
    <span class="tag">How it works</span>
    <h2>Four stages.<br>You are only in <span class="grad">two of them.</span></h2>
    <p class="sub">Other tools start writing on day one. Aura will not write a word until it knows what you are good at.</p>
  </div>

  <div class="eyebrow">The pipeline, end to end</div>
  <div class="wide rv">
    <svg viewBox="0 0 900 300" fill="none">
      <rect x="222" y="18" width="440" height="176" rx="16" fill="#0B1220"/>
      <text x="442" y="46" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="1.6" fill="#00CEC9">02:00 → DAWN · YOU ARE ASLEEP</text>

      <rect x="10" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#0670C4" stroke-width="1.4"/>
      <text x="30" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#0670C4">STAGE 1 · YOU</text>
      <text x="30" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0B1220">You read</text>
      <text x="30" y="134" font-family="Inter, sans-serif" font-size="12" fill="#66707D">One tap on an article</text>
      <text x="30" y="150" font-family="Inter, sans-serif" font-size="12" fill="#66707D">worth keeping.</text>

      <path d="M212 111h22" stroke="#D2D8E0" stroke-width="1.4"/><path d="M230 106l7 5-7 5" fill="#D2D8E0"/>

      <rect x="240" y="58" width="196" height="106" rx="12" fill="#FFFFFF" stroke="#E4E8EE"/>
      <text x="260" y="84" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.4" fill="#9AA4B0">STAGE 2 · AURA</text>
      <text x="260" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0B1220">It keeps it</text>
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
      <text x="714" y="110" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0B1220">You approve</text>
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
    <div><h3>Why the order<br><em>matters.</em></h3><p>It is the part no other tool has.</p></div>
    <div class="savegrid">
      <div class="sv h"><div class="n word" style="font-size:24px">Learns first</div><div class="l">A tool that writes before it knows you hands everyone <b>the same paragraph.</b></div></div>
      <div class="sv m"><div class="n word" style="font-size:24px">Then writes</div><div class="l">Your subjects, your evidence, <b>the way you open and close an idea.</b></div></div>
      <div class="sv d"><div class="n word" style="font-size:24px">Then grows</div><div class="l">Month six sounds far more like you <b>than month one did.</b></div></div>
    </div>
  </div></div>
</section>

<section class="pg" id="get">
  <div class="hdr">
    <span class="tag">What you get</span>
    <h2>See yourself.<br>Then <span class="grad">be seen.</span></h2>
    <p class="sub">Two things. First you understand yourself — then the market understands you.</p>
  </div>

  <div class="eyebrow">One · Your report</div>
  <div class="g2 rv">
    <div class="panel">
      <div class="ph"><span class="t">What you are good at</span><span class="m">8 SKILLS RATED</span></div>
      <div class="pb">
        <svg viewBox="0 0 320 230" fill="none" style="width:100%;height:auto">
          <g stroke="#EFF4FA"><circle cx="160" cy="115" r="88"/><circle cx="160" cy="115" r="66"/><circle cx="160" cy="115" r="44"/><circle cx="160" cy="115" r="22"/></g>
          <g stroke="#E4E8EE"><path d="M160 27v176M72 115h176M98 53l124 124M222 53L98 177"/></g>
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
            <text x="34" y="118" text-anchor="middle" fill="#95690F">FINANCE</text>
            <text x="70" y="46" text-anchor="middle" fill="#95690F">C-SUITE</text>
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
          <path d="M150 14a52 52 0 0 1 0 90 52 52 0 0 1 0-90Z" fill="#0B1220"/>
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
          <div class="sl" style="background:#0B1220;color:#fff">
            <svg class="shape" style="top:-14px;right:-14px" width="70" height="70" viewBox="0 0 70 70" fill="none"><circle cx="40" cy="30" r="26" stroke="#00CEC9" stroke-opacity=".35"/><circle cx="40" cy="30" r="16" stroke="#00CEC9" stroke-opacity=".2"/></svg>
            <span class="n">01</span><span class="t">The twin was<br><span style="color:#00CEC9">never the asset</span></span>
          </div>
          <div class="sl" style="background:#0670C4;color:#fff">
            <svg class="shape" style="right:10px;top:26px" width="56" height="42" viewBox="0 0 56 42" fill="none"><rect x="2" y="24" width="10" height="16" rx="2" fill="#fff" fill-opacity=".3"/><rect x="16" y="16" width="10" height="24" rx="2" fill="#fff" fill-opacity=".45"/><rect x="30" y="8" width="10" height="32" rx="2" fill="#fff" fill-opacity=".6"/><rect x="44" y="2" width="10" height="38" rx="2" fill="#fff" fill-opacity=".8"/></svg>
            <span class="n">02</span><span class="t" style="font-size:19px">85m spent<br><span style="font-size:10px;font-weight:500;opacity:.85">over 18 months</span></span>
          </div>
          <div class="sl" style="background:#EFF4FA;border:1px solid #D2D8E0;color:#0B1220">
            <svg class="shape" style="top:10px;right:10px" width="30" height="28" viewBox="0 0 30 28" fill="none"><path d="M15 3l12 22H3z" stroke="#E0A82E" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 11v6M15 20v1.4" stroke="#E0A82E" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="n">03</span><span class="t">Operations still<br>use the old system</span>
          </div>
          <div class="sl" style="background:#0B1220;color:#00CEC9">
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
    <span class="tag">Why now</span>
    <h2>You read a lot.<br><span class="grad">Nobody ever sees it.</span></h2>
    <p class="sub">You read about five hours a week. You never write about it, and you never talk about it. So the market never learns what you know.</p>
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
      <path d="M10 122h880" stroke="#E4E8EE"/>
      <text x="10" y="152" font-family="IBM Plex Mono, monospace" font-size="9" letter-spacing="1.5" fill="#00807B">WITH AURA</text>
      <rect x="10" y="164" width="600" height="46" rx="10" fill="url(#rise)"/>
      <text x="30" y="193" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#0B1220" id="dHours2">the same 260 hours</text>
      <path d="M618 187h100" stroke="#00CEC9" stroke-width="1.8"/>
      <circle cx="760" cy="187" r="34" fill="#0B1220"/>
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
      <p class="ct" id="kick" style="margin-top:6px"></p>
    </div>
  </div>

  <div class="g2 rv" style="margin-top:22px">
    <div style="background:#FFF;border:1px solid #E4E8EE;border-radius:20px;padding:32px 28px">
      <div class="viz"><svg width="230" height="80" viewBox="0 0 230 80" fill="none">
        <rect x="2" y="14" width="40" height="52" rx="6" fill="#FFF" stroke="#0670C4"/>
        <rect x="50" y="14" width="40" height="52" rx="6" fill="#FFF" stroke="#0670C4" stroke-opacity=".6"/>
        <rect x="98" y="14" width="40" height="52" rx="6" fill="#FFF" stroke="#0670C4" stroke-opacity=".3"/>
        <rect x="146" y="14" width="40" height="52" rx="6" fill="#FFF" stroke="#0670C4" stroke-opacity=".12"/>
        <circle cx="212" cy="40" r="16" fill="#FDECEA" stroke="#C0392B"/>
        <text x="212" y="46" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="14" fill="#C0392B">0</text>
      </svg></div>
      <div class="big r">Lost</div>
      <div class="rest">what happens now.</div>
      <div class="det">You read something good. You close the page. Nobody ever hears about it. A year later you cannot point to one thing, and the people who should know your name still do not.</div>
    </div>
    <div style="background:#FFF;border:1px solid #00CEC9;border-radius:20px;padding:32px 28px">
      <div class="viz"><svg width="230" height="80" viewBox="0 0 230 80" fill="none">
        <rect x="10" y="52" width="30" height="22" rx="4" fill="#E0F7F6"/>
        <rect x="56" y="40" width="30" height="34" rx="4" fill="#B6ECEA"/>
        <rect x="102" y="26" width="30" height="48" rx="4" fill="#6FDDD9"/>
        <rect x="148" y="10" width="30" height="64" rx="4" fill="#00CEC9"/>
        <path d="M18 50l46-12 46-14 48-16" stroke="#00807B" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="200" cy="14" r="5" fill="#00807B"/>
      </svg></div>
      <div class="big c">Kept</div>
      <div class="rest">what happens with Aura.</div>
      <div class="det">The same reading becomes posts and carousels people can see. Every week adds to the last one, so after six months there is a real record of what you know — <b>and it cost you two minutes a day.</b></div>
    </div>
  </div>

  <div class="eyebrow" style="margin-top:46px">What people pay for the pieces, every month</div>
  <div class="wide rv">
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A ghostwriter</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:88%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$50–400</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A positioning consultant</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:66%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$30–300</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A designer</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:40%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$30–160</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">A posting tool</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:26%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$20–100</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center;margin-bottom:10px"><span style="font-size:13.5px;color:#37424F">An AI writing tool</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:18%;border-radius:7px;background:linear-gradient(90deg,#E77A6E,#C0392B)"></i></span><span class="mi" style="text-align:right">$20–40</span></div>
    <div style="display:grid;grid-template-columns:170px 1fr 78px;gap:14px;align-items:center"><span style="font-size:13.5px;color:#0B1220;font-weight:600">Aura, all of it</span><span style="height:26px;border-radius:7px;background:#EFF4FA;display:block"><i style="display:block;height:26px;width:100%;border-radius:7px;background:linear-gradient(90deg,#7FD3B4,#12805C)"></i></span><span class="mi" style="text-align:right;color:#12805C;font-weight:700">Free</span></div>
    <p class="mi" style="margin-top:16px;line-height:1.7">EXAMPLE FIGURES, ADJUSTABLE TO YOUR OWN HOURS AND RATE. WE DO NOT PROMISE FOLLOWERS OR LIKES.</p>
  </div>
</section>

<section class="pg" id="cmp">
  <div class="hdr">
    <span class="tag">Compare</span>
    <h2>They give everyone<br>the same template.<br><span class="grad">We start with you.</span></h2>
    <p class="sub">Other tools hand every person the same shapes and the same words. Aura learns your experience and your reading first — then writes from them.</p>
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
        <rect x="88" y="12" width="88" height="56" rx="9" fill="#0B1220"/>
        <g stroke="#00CEC9" stroke-width="1.6" stroke-linecap="round"><path d="M100 30h58M100 40h58M100 50h34"/></g>
      </svg></div>
      <div class="big b" style="font-size:28px">We learn<br>you first</div>
      <div class="det">Aura respects what you already know. It reads your experience and your reading, works out what only you can say — and only then writes. <b>Nobody else gets your version.</b></div>
    </div>
  </div>
</section>

<section class="pg" id="faq">
  <div class="hdr">
    <span class="tag">Questions</span>
    <h2>What people ask<br>before joining.</h2>
  </div>
  <div style="max-width:760px;margin:0 auto">
    <details open><summary>How much of my time does this take?</summary><p>Ten questions once at the start. After that, one tap when you read something good, and about two minutes to approve a post. Nothing more.</p></details>
    <details><summary>How many posts will I get?</summary><p>As many as you want. There is no weekly quota. Save two articles and you can publish two posts; save ten and you can publish ten. It follows your reading, not a calendar.</p></details>
    <details><summary>Do I need a designer for the carousels?</summary><p>No. Aura designs them for you, ready to post — no design tool, no design skill, no fee.</p></details>
    <details><summary>Will the posts really sound like me?</summary><p>Aura learns from your own posts: how you open, how you explain, how you finish. And you read every word before anything goes out.</p></details>
    <details><summary>Does it work in Arabic?</summary><p>Yes. Arabic is written as Arabic and English as English. One is never a translation of the other.</p></details>
    <details><summary>Who owns what I save?</summary><p>You do. Your articles, your notes, your posts. We never use your work to help anyone else.</p></details>
    <details><summary>What does “free” mean exactly?</summary><p>The first members pay nothing, with no card. If a price arrives later it does not apply to you — you keep the terms you joined on.</p></details>
    <details><summary>What if I stop using it?</summary><p>Everything you saved stays yours and you can take it with you. Nothing is locked.</p></details>
  </div>

  <div class="dark rv"><div class="dark-in" style="grid-template-columns:1fr;text-align:center">
    <div>
      <h3 style="max-width:none;margin:0 auto">Still deciding?<br><em>It costs nothing to look and try.</em></h3>
      <p style="max-width:460px;margin:12px auto 0">The founder seats close soon — and members keep the terms they joined on.</p>
      <div style="margin-top:22px"><button class="btn bp" data-p="join">Join free</button></div>
      <p class="jf"><span class="seatline"></span></p>
    </div>
  </div></div>
</section>

<section class="pg" id="join">
  <div class="join"><div class="join-in">
    <span class="tag" style="background:rgba(0,206,201,.14);color:#00CEC9">Founding circle · free</span>
    <h2>Show the market<br>what you already know.</h2>
    <p>Your report first — what you are good at and the space that is yours. Then your posts and carousels, from what you read.</p>
    <div style="margin-top:26px"><a class="btn bp" href="/request-access">Request my founder seat</a></div>
    <div class="jf">30 SECONDS · WE ANSWER WITHIN 24 HOURS · <span class="seatline"></span></div>
  </div></div>
  <div class="founder">
    <img src="/aura-founder.jpg" alt="Mohammad Mahafdhah">
    <div class="t"><b>Mohammad Mahafdhah</b> — I built Aura from my own reading, because I had the same problem. Write to me directly and I will answer.</div>
  </div>
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
    title: "Aura — You know a lot. Not enough people know it.",
    description:
      "Aura tells you what you are truly good at, then turns what you read into LinkedIn posts and carousels in your own style. Free for the first founding members.",
    path: "/",
  });

  useEffect(() => setMounted(true), []);

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
      cta.textContent = signedIn ? "Open Aura" : "Request a founder seat";
      cta.setAttribute("href", signedIn ? "/home" : "/request-access");
    }
    if (hero) {
      hero.textContent = signedIn ? "Open Aura" : "Join free";
      hero.setAttribute("href", signedIn ? "/home" : "/request-access");
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
      root.querySelectorAll<HTMLElement>(".tabs button").forEach(x => x.classList.toggle("on", x.dataset.p === id));
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
        const { data, error } = await supabase.rpc("founding_seats");
        if (cancelled || error || !data) return;
        const row: any = Array.isArray(data) ? (data as any)[0] : data;
        const claimed = Number(row?.claimed);
        const cap = Number(row?.cap);
        if (!Number.isFinite(claimed) || !Number.isFinite(cap) || cap <= 0) return;
        rootRef.current?.querySelectorAll(".seatline").forEach((el) => {
          el.textContent = `${claimed} of ${cap} founding seats taken`;
        });
      } catch {
        /* silent — the seat line simply stays empty */
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
