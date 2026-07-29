import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";

/* ────────────────────────────────────────────────────────────────
   LandingV2 — parallel prospect landing page at /v2.
   Pure CSS backgrounds (no WebGL, no raster images). Every rule is
   scoped under .aura-v2 so nothing leaks into the app's own pages.
   ──────────────────────────────────────────────────────────────── */

const LANDING_V2_CSS = `
.aura-v2{
  --paper:#F1ECE1; --bone:#EDE7D9; --teal:#36C5B0; --deep:#14544C;
  --amber:#D6A748; --ox:#6E2A26; --bg:#040706; --ink:#1B1712;
  --line-d:#1c2b28; --line-l:#e0d7c7;
  --serif:'Newsreader',Georgia,'Times New Roman',serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --ar:'Cairo','CairoAR',sans-serif;
  background:var(--bg); color:var(--bone);
  font-family:var(--serif); -webkit-font-smoothing:antialiased;
  overflow-x:hidden; width:100%;
}
.aura-v2 *,.aura-v2 *::before,.aura-v2 *::after{box-sizing:border-box;}
.aura-v2 p,.aura-v2 h1,.aura-v2 h2,.aura-v2 h3,.aura-v2 h4,.aura-v2 ul,.aura-v2 li,.aura-v2 figure{margin:0;padding:0;list-style:none;}
.aura-v2 a{color:inherit;text-decoration:none;}
.aura-v2 img{max-width:100%;}
.aura-v2 :focus-visible{outline:2px solid var(--teal);outline-offset:3px;border-radius:6px;}

/* ── surfaces ── */
.aura-v2 .v2dark{background:var(--bg);color:var(--bone);position:relative;}
.aura-v2 .v2bone{
  background:var(--paper);color:var(--ink);position:relative;
  background-image:radial-gradient(rgba(27,23,18,.02) 1px,transparent 1px);
  background-size:4px 4px;
}
.aura-v2 section{padding:clamp(64px,9vw,124px) 20px;position:relative;overflow:hidden;}
.aura-v2 .wrap{max-width:1160px;margin:0 auto;position:relative;z-index:2;}

/* ── type ── */
.aura-v2 .eyebrow{
  font-family:var(--mono);font-size:11px;letter-spacing:3px;text-transform:uppercase;
  color:var(--teal);margin-bottom:18px;display:block;
}
.aura-v2 .v2bone .eyebrow{color:var(--ox);}
.aura-v2 h1{font-family:var(--serif);color:#EDE7D9;font-weight:500;font-size:clamp(36px,6vw,72px);line-height:1.06;letter-spacing:-.02em;}
.aura-v2 h2{font-family:var(--serif);color:#EDE7D9;font-weight:500;font-size:clamp(27px,4vw,44px);line-height:1.14;letter-spacing:-.015em;}
.aura-v2 h1 em,.aura-v2 h2 em{font-style:italic;color:var(--teal);}
.aura-v2 .v2bone h1 em,.aura-v2 .v2bone h2 em{color:var(--ox);}
.aura-v2 h3{font-family:var(--serif);font-weight:500;font-size:19px;line-height:1.3;letter-spacing:-.01em;color:#EDE7D9;}
.aura-v2 .v2bone h1,.aura-v2 .v2bone h2,.aura-v2 .v2bone h3{color:#1B1712;}
.aura-v2 .v2dark h1,.aura-v2 .v2dark h2,.aura-v2 .v2dark h3{color:#EDE7D9;}
.aura-v2 footer h4{color:#7E8C87;}
.aura-v2 .mono{font-family:var(--mono);font-size:11px;letter-spacing:2px;text-transform:uppercase;}
.aura-v2 .lede{font-size:clamp(16px,1.9vw,20px);line-height:1.62;color:#B9C4BF;max-width:660px;}
.aura-v2 .v2bone .lede{color:#4A423A;}
.aura-v2 .lede strong,.aura-v2 .body strong{font-weight:600;color:var(--bone);}
.aura-v2 .v2bone .lede strong,.aura-v2 .v2bone .body strong{color:var(--ink);}
.aura-v2 .body{font-size:15px;line-height:1.68;color:#A9B4AF;}
.aura-v2 .v2bone .body{color:#544B41;}
.aura-v2 .ar{font-family:var(--ar);line-height:1.9;direction:rtl;}

/* ── cards ── */
.aura-v2 .card{
  border-radius:16px;border:1px solid var(--line-d);
  background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012));
  box-shadow:0 18px 40px -28px rgba(0,0,0,.9);
  padding:22px;
}
.aura-v2 .v2bone .card{
  border-color:var(--line-l);
  background:linear-gradient(180deg,#FFFDF7,#EDE7D9);
  box-shadow:0 18px 40px -30px rgba(27,23,18,.35);
}
.aura-v2 .card.teal{border-color:rgba(54,197,176,.4);background:linear-gradient(180deg,rgba(54,197,176,.10),rgba(54,197,176,.02));}
.aura-v2 .card.oxc{border-color:rgba(110,42,38,.45);background:linear-gradient(180deg,rgba(110,42,38,.10),rgba(110,42,38,.02));}
.aura-v2 .v2bone .card.oxc{border-color:rgba(110,42,38,.32);background:linear-gradient(180deg,#FBF1EC,#F2E5DE);}
.aura-v2 .v2bone .card.teal{border-color:rgba(20,84,76,.32);background:linear-gradient(180deg,#EEF8F5,#E4F0EC);}

/* ── buttons ── */
.aura-v2 .btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  min-height:46px;padding:0 22px;border-radius:11px;
  font-family:var(--mono);font-size:13px;letter-spacing:1px;text-transform:uppercase;
  border:1px solid transparent;cursor:pointer;transition:transform .18s ease,opacity .18s ease;
}
.aura-v2 .btn:hover{transform:translateY(-1px);}
.aura-v2 .btn-primary{background:var(--amber);color:#2A1E0B;border-color:var(--amber);font-weight:600;}
.aura-v2 .btn-ghost{background:transparent;color:var(--bone);border-color:rgba(237,231,217,.28);}
.aura-v2 .v2bone .btn-ghost{color:var(--ink);border-color:rgba(27,23,18,.24);}

/* ── nav ── */
.aura-v2 .nav{
  position:fixed;top:0;left:0;right:0;z-index:60;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 20px;background:rgba(4,7,6,.78);backdrop-filter:blur(12px);
  border-bottom:1px solid var(--line-d);
}
.aura-v2 .nav .brand{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:13px;letter-spacing:4px;}
.aura-v2 .nav .navlinks{display:flex;align-items:center;gap:10px;}
.aura-v2 .nav a.login{
  font-family:var(--mono);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;
  color:#98A5A0;display:inline-flex;align-items:center;min-height:44px;padding:0 12px;
}
.aura-v2 .nav a.login:hover{color:var(--bone);}
.aura-v2 .mark{width:26px;height:26px;flex:0 0 26px;}

/* ── hero ── */
.aura-v2 .hero{padding-top:132px;text-align:center;}
.aura-v2 .stars{
  position:absolute;inset:0;z-index:0;pointer-events:none;
  background-image:
    radial-gradient(1.6px 1.6px at 12% 18%,rgba(237,231,217,.85),transparent),
    radial-gradient(1.4px 1.4px at 78% 12%,rgba(237,231,217,.7),transparent),
    radial-gradient(1.2px 1.2px at 34% 42%,rgba(54,197,176,.7),transparent),
    radial-gradient(1.6px 1.6px at 62% 30%,rgba(237,231,217,.6),transparent),
    radial-gradient(1.2px 1.2px at 88% 48%,rgba(237,231,217,.5),transparent),
    radial-gradient(1.4px 1.4px at 22% 66%,rgba(54,197,176,.45),transparent),
    radial-gradient(1.2px 1.2px at 52% 8%,rgba(237,231,217,.55),transparent),
    radial-gradient(1.1px 1.1px at 6% 52%,rgba(237,231,217,.4),transparent),
    radial-gradient(900px 480px at 50% -12%,rgba(20,84,76,.35),transparent 70%);
}
.aura-v2 .halftone{
  position:absolute;left:0;right:0;bottom:0;height:52%;z-index:0;pointer-events:none;
  background-image:radial-gradient(rgba(54,197,176,.42) 1.1px,transparent 1.1px);
  background-size:9px 9px;
  -webkit-mask-image:linear-gradient(180deg,transparent,rgba(0,0,0,.85));
  mask-image:linear-gradient(180deg,transparent,rgba(0,0,0,.85));
}
.aura-v2 .arc{
  position:absolute;left:-14%;right:-14%;bottom:-52vw;height:78vw;z-index:1;pointer-events:none;
  border-radius:50% 50% 0 0;background:var(--bg);
  box-shadow:0 -1px 0 rgba(54,197,176,.28),0 -34px 80px -40px rgba(54,197,176,.35);
}
.aura-v2 .pill{
  display:inline-flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:center;
  border:1px solid rgba(54,197,176,.3);background:rgba(54,197,176,.07);
  border-radius:999px;padding:8px 15px;margin-bottom:26px;
  font-family:var(--mono);font-size:10px;letter-spacing:2.2px;text-transform:uppercase;color:#9FD9CF;
}
.aura-v2 .dot{width:7px;height:7px;border-radius:50%;background:var(--teal);flex:0 0 7px;animation:v2pulse 2.1s ease-in-out infinite;}
@keyframes v2pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.72);}}
.aura-v2 .hero .lede{margin:22px auto 0;}
.aura-v2 .ctas{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:30px;}
.aura-v2 .micro{margin-top:18px;font-family:var(--mono);font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:#7E8C87;}
.aura-v2 .exlabel{
  margin:56px 0 14px;font-family:var(--mono);font-size:11px;letter-spacing:3px;
  text-transform:uppercase;color:#8A9793;text-align:center;
}
.aura-v2 .herocards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:left;}
.aura-v2 .herocards .card.mid{transform:translateY(-14px);border-color:rgba(54,197,176,.4);}
.aura-v2 .ctitle{font-family:var(--mono);font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:#8A9793;margin-bottom:14px;}
.aura-v2 .chips{display:flex;flex-wrap:wrap;gap:8px;}
.aura-v2 .chip{
  font-family:var(--mono);font-size:10px;letter-spacing:1.4px;text-transform:uppercase;
  padding:7px 10px;border-radius:8px;border:1px solid var(--line-d);color:#B9C4BF;
}
.aura-v2 .chip.t{border-color:rgba(54,197,176,.45);color:#8FE0D2;background:rgba(54,197,176,.08);}
.aura-v2 .chip.o{border-color:rgba(196,92,86,.5);color:#E29C96;background:rgba(110,42,38,.14);}
.aura-v2 .chip.a{border-color:rgba(214,167,72,.5);color:#E7C67A;background:rgba(214,167,72,.12);}
.aura-v2 .tl{display:grid;gap:14px;margin-bottom:16px;}
.aura-v2 .tl li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;}
.aura-v2 .tl .tdot{width:8px;height:8px;border-radius:50%;background:var(--teal);margin-top:6px;}
.aura-v2 .tl .tt{font-family:var(--mono);font-size:10px;letter-spacing:1.6px;color:#8FE0D2;display:block;margin-bottom:3px;}
.aura-v2 .tl .tx{font-size:14px;line-height:1.5;color:#C6CFCB;}
.aura-v2 .big{font-family:var(--mono);font-size:56px;line-height:1;letter-spacing:-2px;color:var(--bone);}
.aura-v2 .bars{display:flex;gap:6px;margin:14px 0 12px;}
.aura-v2 .bars i{height:8px;flex:1;border-radius:4px;background:rgba(237,231,217,.12);}
.aura-v2 .bars i.on{background:var(--teal);}
.aura-v2 .strip{
  margin-top:40px;display:flex;flex-wrap:wrap;gap:10px 22px;justify-content:center;
  font-family:var(--mono);font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:#7E8C87;
}

/* ── math ── */
.aura-v2 .mathgrid{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;margin-top:34px;align-items:start;}
.aura-v2 .calchead{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;
  padding-bottom:14px;border-bottom:1px solid var(--line-l);margin-bottom:20px;
}
.aura-v2 .calchead .lbl{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:var(--deep);}
.aura-v2 .curr{display:flex;gap:6px;}
.aura-v2 .curr button{
  font-family:var(--mono);font-size:11px;letter-spacing:1.4px;min-height:44px;padding:0 14px;
  border-radius:9px;border:1px solid var(--line-l);background:transparent;color:#6B6155;cursor:pointer;
}
.aura-v2 .curr button[aria-pressed="true"]{background:var(--deep);border-color:var(--deep);color:#EDE7D9;}
.aura-v2 .slider{margin-bottom:22px;}
.aura-v2 .slider .srow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:9px;}
.aura-v2 .slider label{font-family:var(--mono);font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:#6B6155;}
.aura-v2 .slider output{font-family:var(--mono);font-size:15px;color:var(--ink);}
.aura-v2 input[type=range]{width:100%;height:44px;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer;}
.aura-v2 input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:3px;background:rgba(27,23,18,.16);}
.aura-v2 input[type=range]::-moz-range-track{height:4px;border-radius:3px;background:rgba(27,23,18,.16);}
.aura-v2 input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--deep);border:3px solid var(--paper);margin-top:-9px;box-shadow:0 2px 8px rgba(0,0,0,.25);}
.aura-v2 input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--deep);border:3px solid var(--paper);}
.aura-v2 .figs{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.aura-v2 .fig{border:1px solid var(--line-l);border-radius:16px;padding:16px;background:linear-gradient(180deg,#FFFDF7,#EDE7D9);}
.aura-v2 .fig .k{font-family:var(--mono);font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#797063;margin-bottom:9px;display:block;}
.aura-v2 .fig .v{font-family:var(--mono);font-size:clamp(22px,3.4vw,30px);line-height:1.05;color:var(--ink);}
.aura-v2 .fig .s{font-size:12.5px;line-height:1.45;color:#6B6155;margin-top:7px;}
.aura-v2 .fig.ox{border-color:rgba(110,42,38,.34);background:linear-gradient(180deg,#FBF1EC,#F2E5DE);}
.aura-v2 .fig.ox .v{color:var(--ox);}
.aura-v2 .fig.tl{border-color:rgba(20,84,76,.34);background:linear-gradient(180deg,#EEF8F5,#E2EFEB);}
.aura-v2 .fig.tl .v{color:var(--deep);}
.aura-v2 .kicker{margin-top:18px;font-size:16px;line-height:1.6;color:#4A423A;}
.aura-v2 .working{
  margin-top:16px;padding:14px;border-radius:12px;border:1px dashed rgba(27,23,18,.2);
  font-family:var(--mono);font-size:10.5px;line-height:1.85;letter-spacing:.6px;color:#6B6155;text-transform:uppercase;
}
.aura-v2 .costrow{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(27,23,18,.1);font-size:14px;}
.aura-v2 .costrow span:last-child{font-family:var(--mono);font-size:12.5px;color:#544B41;white-space:nowrap;}
.aura-v2 .costrow.total{border-bottom:none;font-weight:600;padding-top:14px;}
.aura-v2 .freeblock{margin-top:20px;padding-top:18px;border-top:1px solid var(--line-l);}
.aura-v2 .freeblock .f{font-family:var(--serif);font-size:38px;line-height:1;color:var(--deep);}

/* ── bento ── */
.aura-v2 .bento{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:34px;}
.aura-v2 .bento .b1,.aura-v2 .bento .b4{grid-column:span 2;}
.aura-v2 .bento .card{display:flex;flex-direction:column;gap:10px;}
.aura-v2 .foot{margin-top:auto;padding-top:14px;font-family:var(--mono);font-size:9.5px;letter-spacing:1.8px;text-transform:uppercase;color:#7E8C87;}
.aura-v2 .meter{height:8px;border-radius:4px;background:rgba(237,231,217,.1);overflow:hidden;}
.aura-v2 .meter i{display:block;height:100%;width:72%;background:var(--teal);border-radius:4px;}

/* ── night lab ── */
.aura-v2 .lab{
  position:relative;height:270px;border-radius:16px;border:1px solid var(--line-d);overflow:hidden;margin-top:34px;
  background:linear-gradient(180deg,#050B0A 0%,#07100E 62%,#0C120E 100%);
}
.aura-v2 .lab .horizon{position:absolute;left:0;right:0;bottom:74px;height:1px;background:linear-gradient(90deg,transparent,rgba(54,197,176,.4),transparent);}
.aura-v2 .lab .dawn{position:absolute;left:0;right:0;bottom:0;height:104px;background:linear-gradient(0deg,rgba(214,167,72,.34),transparent);}
.aura-v2 .lab .belt{position:absolute;left:0;right:0;bottom:52px;height:0;border-top:2px dashed rgba(237,231,217,.16);}
.aura-v2 .doc{
  position:absolute;bottom:60px;left:-8%;width:26px;height:34px;border-radius:3px;
  border:1px solid rgba(237,231,217,.4);background:rgba(237,231,217,.1);
  animation:v2travel 9s linear infinite;
}
.aura-v2 .doc::before,.aura-v2 .doc::after{content:"";position:absolute;left:5px;right:5px;height:1.5px;background:rgba(237,231,217,.4);}
.aura-v2 .doc::before{top:9px;} .aura-v2 .doc::after{top:15px;}
.aura-v2 .doc.d2{animation-delay:3s;} .aura-v2 .doc.d3{animation-delay:6s;}
@keyframes v2travel{
  0%{transform:translateX(0);opacity:0;border-color:rgba(237,231,217,.4);background:rgba(237,231,217,.1);}
  8%{opacity:1;}
  46%{border-color:rgba(237,231,217,.4);background:rgba(237,231,217,.1);}
  56%{border-color:rgba(54,197,176,.85);background:rgba(54,197,176,.2);}
  92%{opacity:1;}
  100%{transform:translateX(118vw);opacity:0;border-color:rgba(54,197,176,.85);background:rgba(54,197,176,.2);}
}
.aura-v2 .bot{position:absolute;bottom:96px;width:58px;text-align:center;animation:v2hover 3.4s ease-in-out infinite;}
.aura-v2 .bot.r1{left:16%;} .aura-v2 .bot.r2{left:47%;animation-delay:.6s;} .aura-v2 .bot.r3{left:76%;animation-delay:1.2s;}
@keyframes v2hover{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
.aura-v2 .bot .body{
  position:relative;width:46px;height:38px;margin:0 auto;border-radius:12px;
  border:1px solid rgba(54,197,176,.42);background:linear-gradient(180deg,#0E1A18,#08110F);
}
.aura-v2 .bot .ant{position:absolute;left:50%;top:-13px;width:1.5px;height:13px;background:rgba(54,197,176,.5);transform:translateX(-50%);}
.aura-v2 .bot .ant i{position:absolute;top:-5px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:var(--teal);animation:v2pulse 1.8s ease-in-out infinite;}
.aura-v2 .bot .eye{position:absolute;top:13px;width:7px;height:7px;border-radius:50%;background:var(--teal);box-shadow:0 0 9px rgba(54,197,176,.9);}
.aura-v2 .bot .eye.l{left:11px;} .aura-v2 .bot .eye.r{right:11px;}
.aura-v2 .bot .arm{position:absolute;top:16px;width:8px;height:2px;background:rgba(54,197,176,.4);}
.aura-v2 .bot .arm.l{left:-8px;} .aura-v2 .bot .arm.r{right:-8px;}
.aura-v2 .bot .beam{
  position:absolute;left:50%;bottom:-30px;width:34px;height:30px;transform:translateX(-50%);
  background:linear-gradient(180deg,rgba(54,197,176,.26),transparent);
  clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);animation:v2beam 2.6s ease-in-out infinite;
}
@keyframes v2beam{0%,100%{opacity:.3;}50%{opacity:.85;}}
.aura-v2 .bot .nm{margin-top:8px;font-family:var(--mono);font-size:8.5px;letter-spacing:1.6px;color:#7FCFC1;}
.aura-v2 .lab .ready{
  position:absolute;right:18px;top:22px;border-radius:12px;border:1px solid rgba(54,197,176,.45);
  background:rgba(4,7,6,.86);padding:10px 13px;font-family:var(--mono);font-size:10px;letter-spacing:1.8px;
  color:#9FD9CF;opacity:0;animation:v2pop 9s ease-in-out infinite;
}
@keyframes v2pop{0%,72%{opacity:0;transform:translateY(6px) scale(.96);}80%,96%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(0) scale(1);}}
.aura-v2 .lab .cap{position:absolute;left:18px;bottom:14px;font-family:var(--mono);font-size:10px;line-height:1.8;letter-spacing:1.2px;color:#7E8C87;}
.aura-v2 .lab .cap b{color:#9FD9CF;font-weight:500;}
.aura-v2 .three{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px;}

/* ── accordion ── */
.aura-v2 details.q{border:1px solid var(--line-l);border-radius:16px;background:linear-gradient(180deg,#FFFDF7,#EDE7D9);margin-bottom:10px;overflow:hidden;}
.aura-v2 details.q>summary{
  display:flex;gap:14px;align-items:center;cursor:pointer;list-style:none;
  padding:16px 18px;min-height:56px;font-family:var(--serif);font-size:clamp(16px,2vw,19px);color:var(--ink);
}
.aura-v2 details.q>summary::-webkit-details-marker{display:none;}
.aura-v2 details.q>summary .n{font-family:var(--mono);font-size:11px;letter-spacing:1.5px;color:var(--ox);flex:0 0 auto;}
.aura-v2 details.q>summary .cs{margin-left:auto;}
.aura-v2 .cs{
  font-family:var(--mono);font-size:9px;letter-spacing:1.6px;text-transform:uppercase;
  padding:5px 9px;border-radius:999px;border:1px solid rgba(214,167,72,.6);color:#8A6A16;background:rgba(214,167,72,.14);white-space:nowrap;
}
.aura-v2 .v2dark .cs{color:var(--amber);}
.aura-v2 details.q .panel{padding:0 18px 18px;}
.aura-v2 details.q .panel p{font-size:15px;line-height:1.68;color:#544B41;}
.aura-v2 .ev{
  margin-top:14px;padding:10px 0 10px 14px;border-left:2px solid rgba(20,84,76,.45);
  font-family:var(--mono);font-size:10.5px;letter-spacing:1.4px;line-height:1.8;color:#5C685F;text-transform:uppercase;
}
.aura-v2 details.d{border:1px solid var(--line-d);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));margin-bottom:12px;overflow:hidden;}
.aura-v2 details.d>summary{
  display:flex;gap:12px;align-items:center;cursor:pointer;list-style:none;padding:18px;min-height:60px;
  font-family:var(--serif);font-size:19px;color:var(--bone);
}
.aura-v2 details.d>summary::-webkit-details-marker{display:none;}
.aura-v2 details.d>summary::after{content:"+";margin-left:auto;font-family:var(--mono);color:var(--teal);font-size:18px;}
.aura-v2 details.d[open]>summary::after{content:"–";}
.aura-v2 details.d .panel{padding:0 18px 20px;}
.aura-v2 .twocol{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
.aura-v2 .listmark li{display:grid;grid-template-columns:auto 1fr;gap:9px;font-size:14.5px;line-height:1.6;color:#A9B4AF;padding:6px 0;}
.aura-v2 .listmark li::before{content:"·";color:var(--teal);}
.aura-v2 .box{border:1px solid var(--line-d);border-radius:14px;padding:16px;}
.aura-v2 .box.ox{border-color:rgba(110,42,38,.45);background:rgba(110,42,38,.08);}
.aura-v2 .box.ox .listmark li::before{color:#C97C76;}
.aura-v2 .tlink{font-family:var(--mono);font-size:11px;letter-spacing:1.6px;color:var(--teal);display:inline-flex;align-items:center;min-height:44px;}

/* ── close + footer ── */
.aura-v2 .close{text-align:center;margin-top:64px;}
.aura-v2 .close .mark{width:40px;height:40px;margin:0 auto 20px;}
.aura-v2 footer{border-top:1px solid var(--line-d);padding:52px 20px 40px;background:var(--bg);}
.aura-v2 .fgrid{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:26px;max-width:1160px;margin:0 auto;}
.aura-v2 .fgrid h4{font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#7E8C87;margin-bottom:12px;}
.aura-v2 .fgrid a{display:inline-flex;align-items:center;min-height:44px;font-size:14px;color:#A9B4AF;}
.aura-v2 .fgrid a:hover{color:var(--bone);}
.aura-v2 .fbottom{max-width:1160px;margin:32px auto 0;padding-top:20px;border-top:1px solid var(--line-d);font-family:var(--mono);font-size:10px;letter-spacing:2px;color:#6C7873;}

/* ── responsive ── */
@media (max-width:960px){
  .aura-v2 .herocards,.aura-v2 .bento,.aura-v2 .three,.aura-v2 .fgrid{grid-template-columns:1fr;}
  .aura-v2 .bento .b1,.aura-v2 .bento .b4{grid-column:span 1;}
  .aura-v2 .mathgrid{grid-template-columns:1fr;}
  .aura-v2 .herocards .card.mid{transform:none;}
  .aura-v2 .twocol{grid-template-columns:1fr;}
}
@media (max-width:520px){
  .aura-v2 .figs{grid-template-columns:1fr;}
  .aura-v2 .nav .brand span{display:none;}
  .aura-v2 .lab{height:300px;}
  .aura-v2 .bot.r3{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .aura-v2 *,.aura-v2 *::before,.aura-v2 *::after{
    animation:none !important;transition:none !important;
  }
  .aura-v2 .doc{display:none;}
  .aura-v2 .lab .ready{opacity:1;}
  .aura-v2 .btn:hover{transform:none;}
}
`;

const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" fill="none"><g stroke="currentColor" fill="currentColor" stroke-linecap="round"><circle cx="32" cy="32" r="6.85" stroke="none"/><line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/><line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/><line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/><line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/><line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/><line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/><line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/><line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/><line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/><line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/><line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/></g><g stroke="#36C5B0" fill="#36C5B0" stroke-linecap="round"><line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/><circle cx="49.24" cy="9.94" r="1.61"/></g></svg>`;

const LANDING_V2_HTML = `
<nav class="nav">
  <a class="brand" href="/v2">${MARK}<span>AURA</span></a>
  <div class="navlinks">
    <a class="login" href="/auth">Log in</a>
    <a class="btn btn-primary" href="/request-access">Request access</a>
  </div>
</nav>

<!-- 1 · HERO -->
<section class="v2dark hero">
  <div class="stars"></div><div class="halftone"></div><div class="arc"></div>
  <div class="wrap">
    <span class="pill"><i class="dot"></i> The overnight · your personal intelligence team · worked while you slept</span>
    <h1>Your name should arrive<br/><em>before you do.</em></h1>
    <p class="lede">First it works out <strong>who you actually are</strong> — the subjects you own, the capability you can prove, the gaps you cannot see. Then a team of agents builds the evidence, night after night, out of work you are already doing.</p>
    <div class="ctas">
      <a class="btn btn-primary" href="/request-access">Request your access →</a>
      <a class="btn btn-ghost" href="#overnight">See last night's work</a>
    </div>
    <p class="micro">30 seconds to ask · Decision within 24 hours <span class="seatline seatsep"></span></p>

    <p class="exlabel">Example profile</p>
    <div class="herocards">
      <div class="card">
        <p class="ctitle">Your profile</p>
        <div class="chips">
          <span class="chip t">You own · Transformation governance</span>
          <span class="chip t">You own · Public-sector delivery</span>
          <span class="chip">Proven · Regulatory strategy</span>
          <span class="chip o">Blind spot · Commercial velocity</span>
        </div>
      </div>
      <div class="card mid">
        <p class="ctitle">The overnight · 02:00 → 03:12</p>
        <ul class="tl">
          <li><i class="tdot"></i><div><span class="tt">02:04</span><span class="tx">Read 5 captures you saved this week.</span></div></li>
          <li><i class="tdot"></i><div><span class="tt">02:31</span><span class="tx">Found a pattern — 3 of them agree.</span></div></li>
          <li><i class="tdot"></i><div><span class="tt">03:12</span><span class="tx">Built the evidence, in your voice.</span></div></li>
        </ul>
        <div class="chips"><span class="chip">Reader</span><span class="chip">Signal</span><span class="chip">Voice</span><span class="chip">Editor</span></div>
      </div>
      <div class="card">
        <p class="ctitle">The imprint</p>
        <p class="big">72</p>
        <p class="ctitle" style="margin:10px 0 0">Strategist · Climbing</p>
        <div class="bars"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div>
        <p class="foot">Moves only for real presence. Never for noise.</p>
      </div>
    </div>

    <div class="strip">
      <span>It learns who you actually are</span><span>·</span>
      <span>It works every night, on what you already read</span><span>·</span>
      <span>You approve — or you don't</span>
    </div>
  </div>
</section>

<!-- 2 · THE MATH -->
<section class="v2bone">
  <div class="wrap">
    <span class="eyebrow">The math</span>
    <h2>You are already doing the work. <em>None of it survives.</em></h2>
    <div class="mathgrid">
      <div class="card">
        <div class="calchead">
          <span class="lbl"><i class="dot"></i> Your year · live calculation</span>
          <div class="curr" role="group" aria-label="Currency">
            <button type="button" data-curr="SAR" aria-pressed="true">SAR</button>
            <button type="button" data-curr="AED" aria-pressed="false">AED</button>
            <button type="button" data-curr="USD" aria-pressed="false">USD</button>
          </div>
        </div>

        <div class="slider">
          <div class="srow"><label for="v2-hours">Hours you read / week</label><output id="v2-hours-out" for="v2-hours">5</output></div>
          <input id="v2-hours" type="range" min="1" max="14" step="0.5" value="5" aria-label="Hours you read per week"/>
        </div>
        <div class="slider">
          <div class="srow"><label for="v2-rate">An hour of yours is worth</label><output id="v2-rate-out" for="v2-rate">SAR 300</output></div>
          <input id="v2-rate" type="range" min="50" max="900" step="25" value="300" aria-label="Value of an hour of your time"/>
        </div>

        <div class="figs">
          <div class="fig"><span class="k">What you already own</span><p class="v" id="v2-own">260 hrs</p><p class="s">Hours of reading and thinking, every year.</p></div>
          <div class="fig"><span class="k">What survived</span><p class="v">0</p><p class="s">Nothing you can point to a year later.</p></div>
          <div class="fig ox"><span class="k">It already costs</span><p class="v" id="v2-cost">SAR 78,000</p><p class="s">Time you have already spent, written off.</p></div>
          <div class="fig tl"><span class="k">◆ What it becomes</span><p class="v">Top 3</p><p class="s">A named position on the subjects you own.</p></div>
        </div>

        <p class="kicker" id="v2-kicker"><strong>Six working weeks</strong> of thinking, written off every year. <strong>Eight seconds a link.</strong></p>
        <p class="working">Showing the working — hours you own = hours per week × 52. It already costs = those hours × your hourly worth. Working weeks = annual hours ÷ 40. What survived is zero because nothing you read is written down anywhere you can use it. We do not promise reach, ranking or followers.</p>
      </div>

      <div class="card">
        <p class="ctitle" style="color:#797063">What people pay instead · per month</p>
        <div class="costrow"><span>Ghostwriter</span><span>$50 – $400</span></div>
        <div class="costrow"><span>Positioning consultant</span><span>$30 – $300</span></div>
        <div class="costrow"><span>Scheduling tool</span><span>$20 – $100</span></div>
        <div class="costrow"><span>AI writing assistant</span><span>$20 – $40</span></div>
        <div class="costrow"><span>Designer</span><span>$30 – $160</span></div>
        <div class="costrow total"><span>Total</span><span>~$150 – ~$1,000</span></div>
        <div class="freeblock">
          <p class="f">Free</p>
          <p class="ctitle" style="margin-top:8px;color:#797063">During founding beta</p>
          <p class="ctitle" style="margin-top:6px;color:#797063"><span class="seatline"></span></p>
          <a class="btn btn-primary" style="margin-top:16px" href="/request-access">Request your access</a>
          <p class="ctitle" style="margin-top:12px;color:#797063">No card · No commitment</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 3 · WHAT'S IN IT FOR YOU -->
<section class="v2dark">
  <div class="wrap">
    <span class="eyebrow">What's in it for you</span>
    <h2>What actually changes <em>about your week.</em></h2>
    <div class="bento">
      <div class="card teal b1">
        <p class="ctitle">The one that matters most</p>
        <h3>You publish every week without writing anything</h3>
        <p class="body">The draft is on your screen before you open your laptop, built from an article you read on Tuesday. Read it, change a line, press publish.</p>
        <p class="foot">Minutes a week — nothing goes out without you.</p>
      </div>
      <div class="card">
        <p class="ctitle">Nothing is lost</p>
        <h3>Every good idea survives</h3>
        <p class="body">Everything you capture is broken into usable fragments and kept, so a thought from March is still there in November.</p>
        <p class="foot">~9 fragments from every capture</p>
      </div>
      <div class="card">
        <p class="ctitle">It sounds like you</p>
        <h3>Your voice, in both languages</h3>
        <p class="body">It learns your rhythm from what you approve and what you edit — and writes the same way in Arabic and English.</p>
        <div class="chips"><span class="chip">Arabic</span><span class="chip">English</span><span class="chip">Your rhythm</span></div>
      </div>
      <div class="card b4">
        <p class="ctitle">It can be defended</p>
        <h3>Every post carries its receipt</h3>
        <p class="body">Each claim traces back to the source you captured, so you can stand behind it in a room full of people who will ask.</p>
        <p class="foot">Source · SDAIA National Data &amp; AI report · Captured 14 Jul · 9 fragments</p>
      </div>
      <div class="card">
        <p class="ctitle">You see it moving</p>
        <h3>One number, not a vanity meter</h3>
        <p class="big" style="font-size:40px">72</p>
        <div class="meter"><i></i></div>
        <p class="foot">The imprint · Real presence only</p>
      </div>
      <div class="card">
        <p class="ctitle">It works without you</p>
        <h3>The night shift you didn't hire</h3>
        <p class="body">Agents read, connect and draft between 02:00 and dawn. You wake up to work already done.</p>
        <p class="foot">Last night · 02:00 → 03:12</p>
      </div>
    </div>
  </div>
</section>

<!-- 4 · THE OVERNIGHT -->
<section class="v2dark" id="overnight">
  <div class="wrap">
    <span class="eyebrow">The overnight</span>
    <h2>You sleep. <em>The team works.</em></h2>
    <div class="lab" aria-hidden="true">
      <div class="horizon"></div><div class="dawn"></div><div class="belt"></div>
      <div class="doc d1"></div><div class="doc d2"></div><div class="doc d3"></div>
      <div class="bot r1"><div class="body"><i class="ant"><i></i></i><i class="eye l"></i><i class="eye r"></i><i class="arm l"></i><i class="arm r"></i><i class="beam"></i></div><p class="nm">Reader</p></div>
      <div class="bot r2"><div class="body"><i class="ant"><i></i></i><i class="eye l"></i><i class="eye r"></i><i class="arm l"></i><i class="arm r"></i><i class="beam"></i></div><p class="nm">Signal</p></div>
      <div class="bot r3"><div class="body"><i class="ant"><i></i></i><i class="eye l"></i><i class="eye r"></i><i class="arm l"></i><i class="arm r"></i><i class="beam"></i></div><p class="nm">Voice</p></div>
      <div class="ready">Draft ready 03:12</div>
      <p class="cap">&gt; reading · connecting · drafting<br/>&gt; <b>waiting for you at dawn</b></p>
    </div>
    <div class="three">
      <div class="card"><p class="ctitle">While you sleep</p><p class="body">Agents re-read everything you captured this week and look for the argument running through it.</p></div>
      <div class="card"><p class="ctitle">At dawn</p><p class="body">One draft, in your voice, with its sources attached. Approve it, edit a line, or throw it away.</p></div>
      <div class="card"><p class="ctitle">For tomorrow</p><p class="body">What you keep and what you cut teaches it. Tonight's work is sharper than last night's.</p></div>
    </div>
  </div>
</section>

<!-- 5 · WHAT AURA WORKS OUT ABOUT YOU -->
<section class="v2bone" id="questions">
  <div class="wrap">
    <span class="eyebrow">What Aura works out about you</span>
    <h2>Eight questions, <em>answered from your own material.</em></h2>
    <div style="margin-top:30px">
      <details class="q" open><summary><span class="n">01</span> Which subjects do you actually own?</summary>
        <div class="panel"><p>It clusters everything you have captured and published, then names the territories that are genuinely yours — not the ones you wish were.</p>
        <p class="ev">Clustered from your captures · Named territories only where the evidence repeats</p></div></details>
      <details class="q"><summary><span class="n">02</span> What capability can you prove, with evidence?</summary>
        <div class="panel"><p>Each capability is scored against a partner-level benchmark and backed by what you actually read and published, never by self-assessment.</p>
        <p class="ev">Scored against a partner-level benchmark · Evidence required for every point</p></div></details>
      <details class="q"><summary><span class="n">03</span> Where are you repeating yourself without noticing?</summary>
        <div class="panel"><p>Every new point is checked against everything you have already published, so you stop re-making an argument you made in April.</p>
        <p class="ev">Every draft checked against your full published history</p></div></details>
      <details class="q"><summary><span class="n">04</span> Which of your themes is accelerating right now?</summary>
        <div class="panel"><p>Themes are ranked by movement, not volume — so you can lean into the one that is picking up speed while it still is.</p>
        <p class="ev">38 accelerating of 261 signals · Strength = 0.6 × breadth + 0.4 × depth</p></div></details>
      <details class="q"><summary><span class="n">05</span> What does your writing sound like when it is really you?</summary>
        <div class="panel"><p>It learns from every approval and every edit you make, in Arabic and English, until a draft reads like something you already wrote.</p>
        <p class="ev">Learned from approvals and edits · Arabic and English held separately</p></div></details>
      <details class="q"><summary><span class="n">06</span> Which gaps are visible to the market but not to you?</summary>
        <div class="panel"><p>Gaps are sorted largest-gap-first, never by your best score, because the useful list is the uncomfortable one.</p>
        <p class="ev">Sorted largest-gap-first · Never ordered by your strongest result</p></div></details>
      <details class="q"><summary><span class="n">07</span> How does your position compare to your peer set? <span class="cs">Coming soon</span></summary>
        <div class="panel"><p>A read on the market value of the position you have built.</p>
        <p class="ev">In design · Shaped by the founding fifty</p></div></details>
      <details class="q"><summary><span class="n">08</span> What would close the distance to the role above? <span class="cs">Coming soon</span></summary>
        <div class="panel"><p>The capability evidence you are missing for the next seat — and a CV assembled from what you proved, not what you claimed.</p>
        <p class="ev">In design · Shaped by the founding fifty</p></div></details>
    </div>
  </div>
</section>

<!-- 6 · WHERE THIS GOES NEXT + CLOSE -->
<section class="v2dark" id="request">
  <div class="wrap">
    <span class="eyebrow">Where this goes next</span>
    <h2>Today it makes you visible. <em>Next, it makes you sharper.</em></h2>
    <p class="lede" style="margin-top:16px">Coming soon · shaped by the founding fifty. Members get everything below as it ships, at the terms they joined on.</p>
    <div class="three" style="margin-top:28px">
      <div class="card"><span class="cs">Coming soon</span><h3 style="margin-top:12px">What you are worth</h3><p class="body">A read on the market value of the position you have built.</p></div>
      <div class="card"><span class="cs">Coming soon</span><h3 style="margin-top:12px">Gap to the role above</h3><p class="body">The capability evidence still missing for the next seat.</p></div>
      <div class="card"><span class="cs">Coming soon</span><h3 style="margin-top:12px">CV from evidence</h3><p class="body">A record assembled from what you proved, not what you claimed.</p></div>
    </div>
    <p class="working" style="border-color:rgba(237,231,217,.18);color:#7E8C87">This is a roadmap, not a promise. We'd rather show you the direction than pretend everything already works.</p>

    <div style="margin-top:34px">
      <details class="d"><summary>Your material stays yours</summary>
        <div class="panel">
          <div class="twocol">
            <div class="box"><p class="ctitle">What Aura reads</p><ul class="listmark">
              <li>The links, documents and notes you choose to capture</li>
              <li>Your own published posts and their public performance</li>
              <li>The profile and positioning you fill in yourself</li></ul></div>
            <div class="box ox"><p class="ctitle">What it never touches</p><ul class="listmark">
              <li>Your inbox, calendar or private messages</li>
              <li>Your employer's systems or internal drives</li>
              <li>Anything you have not explicitly handed over</li></ul></div>
          </div>
          <a class="tlink" href="/privacy">Read the data terms →</a>
        </div></details>

      <details class="d"><summary>The questions you're already thinking</summary>
        <div class="panel"><div class="twocol">
          <div>
            <details class="d"><summary style="font-size:16px">How is this different from ChatGPT?</summary><div class="panel"><p class="body">ChatGPT starts from nothing every time. Aura starts from your material, your published history and your voice — and shows you the source behind every line.</p></div></details>
            <details class="d"><summary style="font-size:16px">How is it different from a ghostwriter?</summary><div class="panel"><p class="body">A ghostwriter interviews you once a month. Aura works from what you read this week, every night, and never publishes without your approval.</p></div></details>
            <details class="d"><summary style="font-size:16px">How much time does it take?</summary><div class="panel"><p class="body">Eight seconds to save a link. A few minutes a week to read a draft and approve it.</p></div></details>
          </div>
          <div>
            <details class="d"><summary style="font-size:16px">Will it actually sound like me?</summary><div class="panel"><p class="body">It learns from your approvals and edits. The first drafts are close; after a few weeks people who know you can't tell.</p></div></details>
            <details class="d"><summary style="font-size:16px">Who is it for?</summary><div class="panel"><p class="body">Senior operators whose expertise is real and invisible — the people whose work is known inside the building and nowhere else.</p></div></details>
            <details class="d"><summary style="font-size:16px">Does it work in Arabic?</summary><div class="panel"><p class="body">Yes. Arabic is written natively, not translated, and held to the same standard as English.</p></div></details>
          </div>
        </div></div></details>

      <details class="d"><summary>Why I built this</summary>
        <div class="panel">
          <p class="body">I kept meeting people whose judgement was extraordinary and whose name meant nothing outside their own floor. They were reading, thinking and solving hard problems every week — and none of it survived the week. Aura is the system I wanted for them: it works from what you already do, it shows its sources, and it never speaks for you without asking.</p>
          <p class="foot">Mohammad Mahafzah · Aura builder · Built in Riyadh, for the world</p>
        </div></details>
    </div>

    <div class="close">
      ${MARK}
      <h2>Stop being the best-kept secret in your field.</h2>
      <p class="lede" style="margin:16px auto 0;text-align:center">A personal intelligence team that learns who you are, works every night, and waits for your approval.</p>
      <div class="ctas"><a class="btn btn-primary" style="min-height:54px;font-size:14px" href="/request-access">Request your access →</a></div>
      <p class="micro">Takes 30 seconds · Decision within 24 hours</p>
      <p class="ar" dir="rtl" style="margin-top:22px;font-size:20px;color:#9FD9CF">حتى السوق يعرفك قبل ما يشوفك ✦</p>
      <p class="micro">Private beta · By invitation only <span class="seatline seatsep"></span></p>
    </div>
  </div>
</section>

<footer>
  <div class="fgrid">
    <div>
      <a class="brand" href="/v2" style="display:flex;align-items:center;gap:9px;font-family:var(--mono);letter-spacing:4px;font-size:13px">${MARK}<span>AURA</span></a>
      <p class="body" style="margin-top:12px;max-width:320px">A personal intelligence system. Your expertise is invisible. Aura fixes that.</p>
      <span class="chip" style="margin-top:14px;display:inline-block">Currently invitation-only</span>
      <p class="foot">Mohammad Mahafzah · Aura builder</p>
    </div>
    <div><h4>Product</h4><a href="#overnight">The overnight</a><br/><a href="#questions">What it works out</a><br/><a href="#request">Request access</a></div>
    <div><h4>Company</h4><a href="/our-story">Our story</a><br/><a href="/guide">The guide</a><br/><a href="/trust">Security &amp; trust</a></div>
    <div><h4>Legal</h4><a href="/privacy">Privacy</a><br/><a href="/terms">Terms</a><br/><a href="mailto:support@aura-intel.org">Contact</a></div>
  </div>
  <p class="fbottom">© 2026 Aura</p>
</footer>
`;

const CURRENCIES: Record<string, { min: number; max: number; step: number; def: number }> = {
  SAR: { min: 50, max: 900, step: 25, def: 300 },
  AED: { min: 50, max: 900, step: 25, def: 300 },
  USD: { min: 15, max: 250, step: 5, def: 80 },
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
    title: "Aura — Your name should arrive before you do",
    description:
      "A personal intelligence team that learns who you are, works every night on what you already read, and waits for your approval.",
    path: "/v2",
  });

  useEffect(() => setMounted(true), []);

  // Calculator + in-app link interception.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const hours = root.querySelector<HTMLInputElement>("#v2-hours");
    const rate = root.querySelector<HTMLInputElement>("#v2-rate");
    const hoursOut = root.querySelector<HTMLOutputElement>("#v2-hours-out");
    const rateOut = root.querySelector<HTMLOutputElement>("#v2-rate-out");
    const own = root.querySelector<HTMLElement>("#v2-own");
    const cost = root.querySelector<HTMLElement>("#v2-cost");
    const kicker = root.querySelector<HTMLElement>("#v2-kicker");
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
      if (kicker) {
        const weeks = annual / 40;
        const months = weeks / 4.33;
        const unit =
          months >= 1.6
            ? `${spell(Math.round(months))} working month${Math.round(months) === 1 ? "" : "s"}`
            : `${spell(Math.floor(weeks))} working week${Math.floor(weeks) === 1 ? "" : "s"}`;
        kicker.innerHTML = `<strong>${unit}</strong> of thinking, written off every year. <strong>Eight seconds a link.</strong>`;
      }
    };

    const setCurrency = (next: string) => {
      const cfg = CURRENCIES[next];
      if (!cfg || !rate) return;
      const prev = CURRENCIES[curr];
      // Keep the relative position on the scale when rescaling the slider.
      const ratio = (parseFloat(rate.value) - prev.min) / (prev.max - prev.min);
      curr = next;
      rate.min = String(cfg.min);
      rate.max = String(cfg.max);
      rate.step = String(cfg.step);
      const raw = cfg.min + ratio * (cfg.max - cfg.min);
      rate.value = String(Math.round(raw / cfg.step) * cfg.step);
      currBtns.forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.curr === next)),
      );
      render();
    };

    hours?.addEventListener("input", render);
    rate?.addEventListener("input", render);
    const onCurr = (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      setCurrency(b.dataset.curr || "SAR");
    };
    currBtns.forEach((b) => b.addEventListener("click", onCurr));
    render();

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
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

  // Founding seats — live from the public RPC. Never a hardcoded fallback.
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
          const sep = el.classList.contains("seatsep") ? " · " : "";
          el.textContent = `${sep}${claimed} of ${cap} founding seats taken`;
        });
      } catch {
        /* silent — the seat line simply stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
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
