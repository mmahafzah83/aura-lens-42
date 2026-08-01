import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";

/* ────────────────────────────────────────────────────────────────
   LandingV2 — "Studio Plate".
   Bone canvas, grey plates, white cards, one black pill that always
   reports which chapter you are in. Pure CSS backgrounds, no WebGL,
   no raster images. Every rule is scoped under .aura-v2 so nothing
   leaks into the app's own surfaces.

   Palette is System-B verbatim (aura-tokens-system-b.css):
     n-0..n-900 neutrals · b-600 #0670C4 = your turn
     c-500 #00CEC9 = the machine is awake (never text)
     c-700 #00807B = cyan-family text
   ──────────────────────────────────────────────────────────────── */

const LANDING_V2_CSS = `
.aura-v2{--page:#F2F5F9; --plate:#EAEFF5; --n0:#FFF; --n100:#EEF2F7; --n200:#E2E7EE; --n300:#D6DCE4; --n400:#98A2AE; --n500:#5B6673; --n700:#3A434E; --n900:#0F1519; --act:#0670C4; --act-f:#0984E3; --cy:#00CEC9; --cy-b:#5EE3DC; --cy-t:#00807B; --ui:'Inter',system-ui,-apple-system,sans-serif; --ser:'Instrument Serif',Georgia,serif; --mono:'IBM Plex Mono',ui-monospace,monospace; --ar:'Cairo',sans-serif; --gut:clamp(20px,4.5vw,60px); --r:20px;}
.aura-v2 *{margin:0;padding:0;box-sizing:border-box}
.aura-v2{scroll-behavior:smooth}
.aura-v2{background:var(--page);color:var(--n900);font-family:var(--ui);font-size:16px;line-height:1.6; -webkit-font-smoothing:antialiased;overflow-x:hidden}
.aura-v2 a{color:inherit;text-decoration:none}
.aura-v2 ul{list-style:none}
.aura-v2 :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:6px}
.aura-v2 h1{font-family:var(--ser);font-weight:400;font-size:clamp(44px,7.4vw,96px);line-height:.93;letter-spacing:-.032em}
.aura-v2 h2{font-family:var(--ser);font-weight:400;font-size:clamp(31px,5.2vw,60px);line-height:1.01;letter-spacing:-.026em}
.aura-v2 h3{font-weight:600;font-size:18.5px;line-height:1.3;letter-spacing:-.012em}
.aura-v2 h1 em, .aura-v2 h2 em{font-style:italic;color:var(--n400)}
.aura-v2 .lede{font-size:clamp(16px,1.8vw,19.5px);line-height:1.6;color:var(--n700);max-width:58ch}
.aura-v2 .lede strong{font-weight:600;color:var(--n900)}
.aura-v2 .body{font-size:14.5px;line-height:1.66;color:var(--n700)}
.aura-v2 .mono{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--n500)}
.aura-v2 .ctitle{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--n500);margin-bottom:13px}
.aura-v2 .foot{margin-top:auto;padding-top:15px;font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--n500)}
.aura-v2 .navwrap{position:fixed;top:16px;left:0;right:0;z-index:90;display:flex;justify-content:center;padding:0 var(--gut);pointer-events:none}
.aura-v2 .nav{pointer-events:auto;position:relative;overflow:hidden;display:flex;align-items:center;gap:2px; background:var(--n900);border-radius:999px;padding:7px 7px 7px 18px; box-shadow:0 20px 46px -20px rgba(15,21,25,.55);transition:transform .4s cubic-bezier(.2,.7,.3,1)}
.aura-v2 .nav.tight{transform:scale(.965)}
.aura-v2 .nav .prog{position:absolute;left:0;bottom:0;height:2px;width:0;background:var(--cy);transition:width .12s linear}
.aura-v2 .brand{display:flex;align-items:center;gap:9px;margin-right:16px}
.aura-v2 .mark{width:24px;height:24px;flex:0 0 24px;color:#fff}
.aura-v2 .bn{font-family:var(--ser);color:#fff;font-size:21px;line-height:1}
.aura-v2 .readout{display:flex;align-items:center;gap:8px;max-width:0;opacity:0;overflow:hidden;white-space:nowrap; font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5); transition:max-width .45s cubic-bezier(.2,.7,.3,1),opacity .3s ease,margin .45s ease}
.aura-v2 .nav.tight .readout{max-width:250px;opacity:1;margin-right:12px}
.aura-v2 .readout b{color:#fff;font-weight:500}
.aura-v2 .readout .tk{width:5px;height:5px;border-radius:50%;background:var(--cy)}
.aura-v2 .links{display:flex;align-items:center;gap:1px}
.aura-v2 .links a{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.58); padding:11px 12px;border-radius:999px;transition:.2s;white-space:nowrap}
.aura-v2 .links a:hover{color:#fff;background:rgba(255,255,255,.08)}
.aura-v2 .links a.on{color:#fff;background:rgba(255,255,255,.12)}
.aura-v2 .navcta{margin-left:12px;display:flex;align-items:center;gap:9px;background:#fff;color:var(--n900);border-radius:999px; padding:11px 16px;font-size:14px;font-weight:600;white-space:nowrap;transition:.2s}
.aura-v2 .navcta:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(0,0,0,.45)}
.aura-v2 .navcta .a{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--n100);font-size:10px}
@media(max-width:1140px){
.aura-v2 .links, .aura-v2 .readout{display:none}
}
.aura-v2 section{padding:clamp(60px,9vw,116px) var(--gut);scroll-margin-top:100px;position:relative}
.aura-v2 .wrap{max-width:1240px;margin:0 auto}
.aura-v2 .sechead{max-width:940px;margin-bottom:clamp(32px,5vw,56px)}
.aura-v2 .eyebrow{position:relative;display:inline-block;padding:9px 14px;margin-bottom:24px}
.aura-v2 .eyebrow span{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--n700)}
.aura-v2 .eyebrow::before, .aura-v2 .eyebrow::after{content:'';position:absolute;width:13px;height:13px;border:1.5px solid var(--n300)}
.aura-v2 .eyebrow::before{left:0;bottom:0;border-top:0;border-right:0}
.aura-v2 .eyebrow::after{right:0;top:0;border-bottom:0;border-left:0}
.aura-v2 .eyebrow.night span{color:rgba(255,255,255,.72)}
.aura-v2 .eyebrow.night::before, .aura-v2 .eyebrow.night::after{border-color:rgba(255,255,255,.26)}
.aura-v2 .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;border-radius:999px; font-size:16px;font-weight:600;border:1px solid transparent;cursor:pointer; transition:transform .2s ease,box-shadow .25s ease,background .2s}
.aura-v2 .btn:hover{transform:translateY(-2px)}
.aura-v2 .btn-p{background:var(--n900);color:#fff}
.aura-v2 .btn-p:hover{box-shadow:0 16px 34px -16px rgba(15,21,25,.7)}
.aura-v2 .btn-p .a{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.15);display:grid;place-items:center;font-size:11px}
.aura-v2 .btn-g{border-color:var(--n300);color:var(--n700);background:transparent}
.aura-v2 .btn-g:hover{background:#fff}
.aura-v2 .btn-w{background:#fff;color:var(--n900)}
.aura-v2 .btn-w .a{width:24px;height:24px;border-radius:50%;background:var(--n100);display:grid;place-items:center;font-size:11px}
.aura-v2 .btn-b{background:var(--act);color:#fff}
.aura-v2 .ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.aura-v2 .micro{margin-top:20px;font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--n500)}
.aura-v2 .plateBox{background:var(--plate);border-radius:34px;padding:clamp(12px,1.6vw,20px)}
.aura-v2 .card{background:var(--n0);border:1px solid var(--n200);border-radius:var(--r);padding:clamp(20px,2.4vw,28px); display:flex;flex-direction:column;transition:transform .3s cubic-bezier(.2,.7,.3,1),box-shadow .3s}
.aura-v2 .card:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(15,21,25,.26)}
.aura-v2 .g2{display:grid;grid-template-columns:1fr 1.3fr;gap:clamp(12px,1.6vw,20px)}
.aura-v2 .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(12px,1.6vw,20px)}
.aura-v2 .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.aura-v2 .chip{display:inline-flex;align-items:center;gap:8px;background:var(--page);border:1px solid var(--n200);border-radius:999px; padding:9px 14px;font-size:14px;color:var(--n700)}
.aura-v2 .chip i{width:6px;height:6px;border-radius:50%;background:var(--n400)}
.aura-v2 .chip.t{border-color:rgba(0,128,123,.3);background:rgba(0,206,201,.07);color:var(--cy-t)}
.aura-v2 .chip.t i{background:var(--cy)}
.aura-v2 .pill{display:inline-flex;align-items:center;gap:9px;border:1px solid rgba(0,128,123,.28);background:rgba(0,206,201,.07); border-radius:999px;padding:9px 16px;margin-bottom:26px;font-family:var(--mono);font-size:9.5px;letter-spacing:.18em; text-transform:uppercase;color:var(--cy-t)}
.aura-v2 .dot{width:7px;height:7px;border-radius:50%;background:var(--cy);animation:v3pl 2.1s ease-in-out infinite;flex:0 0 7px}
@keyframes v3pl{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.aura-v2 #hero{padding-top:clamp(124px,15vw,172px)}
.aura-v2 .pair{display:grid;grid-template-columns:1fr 1fr;margin-top:clamp(30px,4vw,50px);border-top:1px solid var(--n900)}
.aura-v2 .pair>div{padding:28px 40px 28px 0}
.aura-v2 .pair>div:first-child{border-right:1px solid var(--n200)}
.aura-v2 .pair>div:last-child{padding:28px 0 28px 40px}
.aura-v2 .pair .q{font-family:var(--ser);font-size:clamp(25px,3.4vw,42px);line-height:1.08;letter-spacing:-.022em;margin-top:14px}
.aura-v2 .pair .body{margin-top:18px}
.aura-v2 .pair .off .q{color:var(--n400)}
.aura-v2 .pair .off .q s{text-decoration-color:var(--n300);text-decoration-thickness:1.5px}
.aura-v2 .pair .off .body{color:var(--n400)}
.aura-v2 .pair .on .q i{font-style:italic;color:var(--cy-t)}
.aura-v2 .order{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.aura-v2 .ord{display:inline-flex;align-items:baseline;gap:8px;border:1px solid var(--n200);background:#fff;border-radius:999px; padding:8px 14px;font-size:13.5px;color:var(--n700)}
.aura-v2 .ord b{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;color:var(--n400);font-weight:400}
.aura-v2 .ord.first{border-color:rgba(0,128,123,.4);background:rgba(0,206,201,.07);color:var(--cy-t)}
.aura-v2 .ord.first b{color:var(--cy-t)}
.aura-v2 .steps{border-top:1px solid var(--n900);margin-top:4px}
.aura-v2 .step{display:grid;grid-template-columns:38px 1fr 1.1fr auto;gap:20px;padding:26px 0;border-bottom:1px solid var(--n200);align-items:start}
.aura-v2 .step .no{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--n400);padding-top:5px}
.aura-v2 .step .ttl{font-family:var(--ser);font-size:clamp(22px,2.6vw,30px);line-height:1.1;letter-spacing:-.02em}
.aura-v2 .step .ttl em{font-style:italic;color:var(--n400)}
.aura-v2 .step .body{color:var(--n500)}
.aura-v2 .tag{font-family:var(--mono);font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;padding:6px 10px;border-radius:999px; border:1px solid var(--n200);color:var(--n500);background:#fff;white-space:nowrap;align-self:center}
.aura-v2 .tag.req{border-color:rgba(0,128,123,.4);color:var(--cy-t);background:rgba(0,206,201,.08)}
.aura-v2 .gate{display:flex;align-items:center;gap:14px;margin-top:24px;padding:16px 18px;background:#fff;border:1px solid var(--n200);border-radius:16px}
.aura-v2 .gate .k{width:28px;height:28px;border-radius:50%;background:var(--cy);display:grid;place-items:center;font-size:13px;color:#04302F;flex:0 0 28px}
.aura-v2 .gate p{font-size:15px;color:var(--n700)}
.aura-v2 .mathgrid{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(12px,1.6vw,20px);align-items:start}
.aura-v2 .calchead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px; border-bottom:1px solid var(--n200);margin-bottom:22px}
.aura-v2 .calchead .l{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:10px;letter-spacing:.18em; text-transform:uppercase;color:var(--cy-t)}
.aura-v2 .curr{display:flex;gap:6px}
.aura-v2 .curr button{font-family:var(--mono);font-size:11px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--n200); background:transparent;color:var(--n500);cursor:pointer;letter-spacing:.1em}
.aura-v2 .curr button[aria-pressed=true]{background:var(--n900);border-color:var(--n900);color:#fff}
.aura-v2 .slider{margin-bottom:22px}
.aura-v2 .srow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:9px}
.aura-v2 .slider label{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--n500)}
.aura-v2 .slider output{font-family:var(--mono);font-size:15px;color:var(--n900)}
.aura-v2 input[type=range]{width:100%;height:44px;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
.aura-v2 input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:3px;background:var(--n300)}
.aura-v2 input[type=range]::-moz-range-track{height:4px;border-radius:3px;background:var(--n300)}
.aura-v2 input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--n900); border:3px solid #fff;margin-top:-9px;box-shadow:0 2px 8px rgba(15,21,25,.28)}
.aura-v2 input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--n900);border:3px solid #fff}
.aura-v2 .figs{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.aura-v2 .fig{border:1px solid var(--n200);border-radius:16px;padding:18px;background:var(--page)}
.aura-v2 .fig .k{font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--n500);display:block;margin-bottom:9px}
.aura-v2 .fig .v{font-family:var(--mono);font-size:clamp(22px,3.2vw,30px);line-height:1.05;color:var(--n900)}
.aura-v2 .fig .s{font-size:12.5px;line-height:1.45;color:var(--n500);margin-top:7px}
.aura-v2 .fig.t{border-color:rgba(0,128,123,.28);background:linear-gradient(180deg,rgba(0,206,201,.08),transparent)}
.aura-v2 .fig.t .v{color:var(--cy-t)}
.aura-v2 .kicker{margin-top:18px;font-size:17px;line-height:1.55;color:var(--n700)}
.aura-v2 .working{margin-top:16px;padding:15px;border-radius:14px;border:1px dashed var(--n300);font-family:var(--mono); font-size:10px;line-height:1.9;letter-spacing:.05em;color:var(--n500);text-transform:uppercase}
.aura-v2 .costrow{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--n200);font-size:14.5px}
.aura-v2 .costrow span:last-child{font-family:var(--mono);font-size:12.5px;color:var(--n700);white-space:nowrap}
.aura-v2 .costrow.total{border-bottom:none;font-weight:600;padding-top:15px}
.aura-v2 .freeblock{margin-top:22px;padding-top:20px;border-top:1px solid var(--n200)}
.aura-v2 .freeblock .f{font-family:var(--ser);font-size:54px;line-height:1;color:var(--act)}
.aura-v2 .big{font-family:var(--mono);font-size:54px;line-height:1;letter-spacing:-.04em;color:var(--act-f)}
.aura-v2 .meter{height:8px;border-radius:4px;background:var(--n200);overflow:hidden;margin-top:12px}
.aura-v2 .meter i{display:block;height:100%;width:0;background:var(--cy);border-radius:4px}
.aura-v2 .night{background:var(--n900);color:#fff;border:0;position:relative;overflow:hidden}
.aura-v2 .night::before{content:'';position:absolute;inset:0;background: radial-gradient(640px 340px at 86% 8%,rgba(0,206,201,.17),transparent 62%), radial-gradient(440px 300px at 6% 98%,rgba(6,112,196,.22),transparent 64%)}
.aura-v2 .night>*{position:relative;z-index:1}
.aura-v2 .night h2, .aura-v2 .night h3{color:#fff}
.aura-v2 .night h2 em{color:rgba(255,255,255,.42)}
.aura-v2 .night .body, .aura-v2 .night .lede{color:rgba(255,255,255,.62)}
.aura-v2 .night .ctitle{color:rgba(255,255,255,.45)}
.aura-v2 .inst{background:var(--n900);border-radius:24px;padding:24px;color:#fff;position:relative;overflow:hidden; box-shadow:0 44px 84px -44px rgba(15,21,25,.6)}
.aura-v2 .inst::after{content:'';position:absolute;inset:-45% -25% auto auto;width:360px;height:360px;border-radius:50%; background:radial-gradient(circle,rgba(0,206,201,.2),transparent 65%)}
.aura-v2 .inst>*{position:relative;z-index:1}
.aura-v2 .inst .top{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;letter-spacing:.18em; text-transform:uppercase;color:rgba(255,255,255,.45)}
.aura-v2 .tl{display:grid;gap:15px;margin:20px 0 18px}
.aura-v2 .tl li{display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:start;opacity:0;transform:translateY(6px)}
.aura-v2 .tl li.in{opacity:1;transform:none;transition:opacity .5s ease,transform .5s ease}
.aura-v2 .tdot{width:8px;height:8px;border-radius:50%;background:var(--cy);margin-top:6px}
.aura-v2 .tt{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;color:var(--cy-b);display:block;margin-bottom:3px}
.aura-v2 .tx{font-size:14px;line-height:1.5;color:#EEF2F7}
.aura-v2 .agents{display:flex;flex-wrap:wrap;gap:7px}
.aura-v2 .ag{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;padding:7px 10px; border-radius:8px;border:1px solid #26313A;color:rgba(255,255,255,.6)}
.aura-v2 .svc{background:#fff;border:1px solid var(--n200);border-radius:var(--r);padding:24px;display:flex;flex-direction:column; transition:transform .3s cubic-bezier(.2,.7,.3,1),box-shadow .3s}
.aura-v2 .svc:hover{transform:translateY(-4px);box-shadow:0 24px 48px -28px rgba(15,21,25,.26)}
.aura-v2 .svc .no{font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:var(--n400);margin-bottom:14px}
.aura-v2 .st{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-family:var(--mono);font-size:9px;letter-spacing:.16em; text-transform:uppercase;color:var(--n500)}
.aura-v2 .st i{width:16px;height:16px;border-radius:50%;background:var(--n200);display:grid;place-items:center;font-size:9px;color:transparent}
.aura-v2 .st.live i{background:var(--cy);color:#04302F}
.aura-v2 .st.live{color:var(--n700)}
.aura-v2 details.q{border-bottom:1px solid var(--n200)}
.aura-v2 details.q>summary{list-style:none;cursor:pointer;padding:22px 44px 22px 0;position:relative;display:flex;gap:16px;align-items:baseline; font-family:var(--ser);font-size:clamp(20px,2.5vw,29px);line-height:1.18;letter-spacing:-.015em}
.aura-v2 details.q>summary::-webkit-details-marker{display:none}
.aura-v2 details.q>summary .n{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--act);flex:0 0 auto;transform:translateY(-2px)}
.aura-v2 details.q>summary::after{content:'+';position:absolute;right:4px;top:26px;font-size:26px;color:var(--n400);font-weight:300;line-height:1}
.aura-v2 details.q[open]>summary::after{content:'–'}
.aura-v2 details.q .panel{padding:0 44px 24px 40px}
.aura-v2 details.q .panel p{font-size:15.5px;line-height:1.66;color:var(--n700)}
.aura-v2 .ev{margin-top:15px;padding:10px 0 10px 15px;border-left:2px solid rgba(0,128,123,.45);font-family:var(--mono);font-size:10px; letter-spacing:.12em;line-height:1.85;color:var(--cy-t);text-transform:uppercase}
.aura-v2 .cs{font-family:var(--mono);font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;padding:5px 10px;border-radius:999px; border:1px solid var(--n200);color:var(--n500);background:var(--page);white-space:nowrap;align-self:center}
.aura-v2 .faqgrid{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(28px,5vw,60px);align-items:start}
.aura-v2 .help{background:#fff;border:1px solid var(--n200);border-radius:var(--r);padding:24px;margin-top:32px}
.aura-v2 .ledgrid{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(28px,5vw,64px);align-items:start}
.aura-v2 .sheet{background:#fff;border:1px solid var(--n200);border-radius:22px;padding:clamp(22px,3vw,34px)}
.aura-v2 .shead{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:baseline;padding-bottom:16px;border-bottom:2px solid var(--n900)}
.aura-v2 .shead .t{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase}
.aura-v2 .lrow{display:flex;align-items:baseline;gap:12px;padding:17px 0;border-bottom:1px solid var(--n200)}
.aura-v2 .lrow:last-of-type{border-bottom:0}
.aura-v2 .lrow .k{font-family:var(--ser);font-size:clamp(19px,2.2vw,25px);line-height:1.15;letter-spacing:-.015em;white-space:nowrap}
.aura-v2 .lrow .lead{flex:1;border-bottom:1px dotted var(--n300);transform:translateY(-5px);min-width:20px}
.aura-v2 .lrow .v{font-family:var(--mono);font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--n500);text-align:right;max-width:20ch;line-height:1.6}
.aura-v2 .lrow .v.cy{color:var(--cy-t)}
.aura-v2 .sfoot{margin-top:22px;padding-top:18px;border-top:1px solid var(--n200);display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
.aura-v2 .sfoot .s{font-family:var(--ser);font-style:italic;font-size:21px;color:var(--n400)}
.aura-v2 .note{margin-top:26px;padding:14px 0 14px 15px;border-left:2px solid rgba(0,128,123,.4);font-family:var(--mono); font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--cy-t);line-height:1.95;max-width:80ch}
.aura-v2 .crow{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(10px,1.4vw,16px)}
.aura-v2 footer{background:var(--n900);color:#fff;border-radius:44px 44px 0 0;margin-top:clamp(40px,7vw,80px);position:relative; overflow:hidden;padding:clamp(56px,9vw,96px) var(--gut) 100px}
.aura-v2 .wordmark{position:absolute;left:50%;bottom:-3%;transform:translateX(-50%);font-family:var(--ser);letter-spacing:-.04em; font-size:clamp(9rem,28vw,25rem);line-height:.76;white-space:nowrap;color:transparent; -webkit-text-stroke:1px rgba(255,255,255,.055); background:linear-gradient(180deg,rgba(0,206,201,.09),rgba(255,255,255,0));-webkit-background-clip:text;background-clip:text; pointer-events:none;user-select:none}
.aura-v2 .fcta{position:relative;z-index:1;text-align:center;max-width:880px;margin:0 auto}
.aura-v2 .fcta h2{color:#fff}
.aura-v2 .fcta h2 em{color:rgba(255,255,255,.42)}
.aura-v2 .fcta p{color:rgba(255,255,255,.62);margin:18px auto 0;max-width:52ch}
.aura-v2 .fcta .btn{margin:30px auto 0}
.aura-v2 .fcta .mk{width:44px;height:44px;color:#fff;margin:0 auto 22px;display:block}
.aura-v2 .ar{font-family:var(--ar);direction:rtl;line-height:1.9;margin-top:26px;font-size:21px;color:var(--cy-b)}
.aura-v2 .fgrid{position:relative;z-index:1;display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:28px; margin:clamp(64px,11vw,110px) auto 0;max-width:1240px}
.aura-v2 .fgrid h4{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.42);margin-bottom:14px}
.aura-v2 .fgrid a{display:inline-flex;align-items:center;min-height:40px;font-size:15px;color:rgba(255,255,255,.72)}
.aura-v2 .fgrid a:hover{color:#fff}
.aura-v2 .fgrid .body{color:rgba(255,255,255,.5)}
.aura-v2 .socials{display:flex;gap:9px;margin-top:14px}
.aura-v2 .socials a{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.16);display:grid;place-items:center; font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.7);min-height:0}
.aura-v2 .socials a:hover{background:rgba(255,255,255,.08);color:#fff}
.aura-v2 .fbottom{position:relative;z-index:1;max-width:1240px;margin:44px auto 0;padding-top:22px;border-top:1px solid rgba(255,255,255,.1); display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;font-family:var(--mono);font-size:9.5px; letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.38)}
.aura-v2 .seatbar{position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;align-items:center;gap:12px;padding:11px 18px; background:rgba(15,21,25,.95);backdrop-filter:blur(10px);transform:translateY(115%);transition:transform .45s cubic-bezier(.16,1,.3,1)}
.aura-v2 .seatbar.up{transform:none}
.aura-v2 .seatbar .sb{font-family:var(--mono);font-size:11.5px;color:#fff;letter-spacing:.05em}
.aura-v2 .sp{flex:1}
.aura-v2 .strike{position:relative;display:inline-block}
.aura-v2 .strike::after{content:'';position:absolute;left:-2px;right:-2px;top:52%;height:1.5px;background:var(--n300); transform:scaleX(0);transform-origin:left;transition:transform .55s cubic-bezier(.65,0,.35,1) .5s}
.aura-v2 .rv.in .strike::after{transform:scaleX(1)}
.aura-v2 .drawline{position:relative;border-top-color:transparent!important}
.aura-v2 .drawline::before{content:'';position:absolute;left:0;top:-1px;height:1px;width:100%;background:var(--n900); transform:scaleX(0);transform-origin:left;transition:transform .95s cubic-bezier(.2,.7,.3,1)}
.aura-v2 .drawline.thick::before{height:2px;top:-2px}
.aura-v2 .drawline.drawn::before{transform:scaleX(1)}
.aura-v2 .steps{position:relative}
.aura-v2 .steps .railtrack{position:absolute;left:18px;top:0;bottom:0;width:1px;background:var(--n200)}
.aura-v2 .steps .railfill{position:absolute;left:18px;top:0;width:1px;height:0;background:var(--cy); box-shadow:0 0 8px rgba(0,206,201,.55);transition:height .18s linear}
.aura-v2 .step .no{position:relative;z-index:1;transition:color .4s ease}
.aura-v2 .step .no::before{content:'';position:absolute;left:-9px;top:2px;width:15px;height:15px;border-radius:50%; background:var(--page);border:1px solid var(--n200);z-index:-1;transition:border-color .4s ease,background .4s ease}
.aura-v2 .step.lit .no{color:var(--cy-t)}
.aura-v2 .step.lit .no::before{border-color:var(--cy);background:rgba(0,206,201,.12)}
.aura-v2 .step .ttl, .aura-v2 .step .body, .aura-v2 .step .tag{transition:opacity .5s ease}
.aura-v2 .step:not(.lit) .body{opacity:.72}
.aura-v2 .lrow .lead{border-bottom:0;height:1px;align-self:flex-end;margin-bottom:6px; background-image:radial-gradient(circle,var(--n300) .9px,transparent .9px); background-size:6px 1px;background-repeat:repeat-x; transform:scaleX(0);transform-origin:left;transition:transform .8s cubic-bezier(.2,.7,.3,1)}
.aura-v2 .sheet.drawn .lrow .lead, .aura-v2 .night .lrow .lead{transform:scaleX(1)}
.aura-v2 .sheet .lrow:nth-child(2) .lead{transition-delay:.10s}
.aura-v2 .sheet .lrow:nth-child(3) .lead{transition-delay:.20s}
.aura-v2 .sheet .lrow:nth-child(4) .lead{transition-delay:.30s}
.aura-v2 .sheet .lrow:nth-child(5) .lead{transition-delay:.40s}
.aura-v2 .sheet .lrow:nth-child(6) .lead{transition-delay:.50s}
.aura-v2 .night .lrow .lead{background-image:radial-gradient(circle,rgba(255,255,255,.32) .9px,transparent .9px)}
.aura-v2 .night::before{animation:v3aurora 30s ease-in-out infinite alternate;will-change:transform,opacity}
@keyframes v3aurora{0%{transform:translate3d(0,0,0) scale(1);opacity:1} 50%{transform:translate3d(-3%,2%,0) scale(1.09);opacity:.86} 100%{transform:translate3d(2%,-2%,0) scale(1.04);opacity:1}}
.aura-v2 .wordmark{transition:transform .1s linear}
.aura-v2 .btn .a{transition:transform .22s cubic-bezier(.2,.7,.3,1)}
.aura-v2 .btn:hover .a{transform:translate(2px,-2px)}
.aura-v2 .svc, .aura-v2 .card{transition:transform .3s cubic-bezier(.2,.7,.3,1),box-shadow .3s,border-color .3s}
.aura-v2 details.q[open] .panel{animation:v3panelin .4s cubic-bezier(.2,.7,.3,1)}
@keyframes v3panelin{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.aura-v2 .ord{transition:transform .25s cubic-bezier(.2,.7,.3,1),box-shadow .25s}
.aura-v2 .ord:hover{transform:translateY(-2px)}
@media(prefers-reduced-motion:reduce){
.aura-v2 .strike::after, .aura-v2 .drawline::before, .aura-v2 .lrow .lead{transform:scaleX(1)!important;transition:none!important}
.aura-v2 .steps .railfill{display:none}
.aura-v2 .step .no{color:var(--n400)!important}
.aura-v2 .step .no::before{border-color:var(--n200)!important;background:var(--page)!important}
.aura-v2 .night::before{animation:none!important}
.aura-v2 .wordmark{transform:translateX(-50%)!important}
}
.aura-v2 .mini{display:flex;justify-content:space-between;align-items:center;gap:12px; padding:13px 15px;border-radius:12px;background:var(--page);font-size:15.5px}
.aura-v2 .svc.night{background:var(--n900);border:0}
.aura-v2 .svc.night h2, .aura-v2 .svc.night h3{color:#fff}
.aura-v2 .svc.night h2 em{color:rgba(255,255,255,.42)}
.aura-v2 .svc.night .body{color:rgba(255,255,255,.62)}
.aura-v2 .st{margin-top:auto;padding-top:18px}
.aura-v2 .svc>div .st, .aura-v2 .st.inline{margin-top:0;padding-top:0}
.aura-v2 .svc.mine{border-color:rgba(6,112,196,.32);background:linear-gradient(180deg,rgba(6,112,196,.05),#fff 42%)}
.aura-v2 .svc.mine .no{color:var(--act)}
.aura-v2 .tag-you{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;margin-bottom:14px; border:1px solid rgba(6,112,196,.35);background:rgba(6,112,196,.07);border-radius:999px;padding:6px 11px; font-family:var(--mono);font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--act)}
.aura-v2 .tag-you i{width:6px;height:6px;border-radius:50%;background:var(--act)}
@media(min-width:1041px){
.aura-v2 .faqgrid>div:first-child{position:sticky;top:104px}
}
.aura-v2 details.q{transition:background .2s ease}
.aura-v2 details.q:hover{background:rgba(255,255,255,.6)}
.aura-v2 details.q>summary{padding-left:6px;padding-right:52px}
.aura-v2 details.q>summary::after{right:12px}
.aura-v2 details.q[open]{background:#fff;border-radius:14px}
.aura-v2 details.q[open]>summary{padding-left:12px}
.aura-v2 details.q[open] .panel{padding-left:48px}
.aura-v2 .rv{opacity:0;transform:translateY(20px)}
.aura-v2 .rv.in{opacity:1;transform:none;transition:opacity .65s ease,transform .65s cubic-bezier(.2,.7,.3,1)}
@media(max-width:1040px){
.aura-v2 .pair, .aura-v2 .g2, .aura-v2 .g3, .aura-v2 .mathgrid, .aura-v2 .faqgrid, .aura-v2 .ledgrid, .aura-v2 .fgrid{grid-template-columns:1fr}
.aura-v2 .pair>div{border-right:0!important;border-bottom:1px solid var(--n200);padding:26px 0!important}
.aura-v2 .pair>div:last-child{border-bottom:0}
.aura-v2 .step{grid-template-columns:38px 1fr;row-gap:10px}
.aura-v2 .step .tag{grid-column:2;justify-self:start;align-self:start}
.aura-v2 .crow{grid-template-columns:1fr 1fr}
}
@media(max-width:600px){
.aura-v2 .figs, .aura-v2 .crow{grid-template-columns:1fr}
.aura-v2 .lrow{flex-wrap:wrap;gap:6px}
.aura-v2 .lrow .lead{display:none}
.aura-v2 .lrow .v{text-align:left;max-width:none}
}
@media(prefers-reduced-motion:reduce){
.aura-v2 *{animation:none!important;transition:none!important}
.aura-v2 .rv, .aura-v2 .tl li{opacity:1!important;transform:none!important}
.aura-v2{scroll-behavior:auto}
}
`;

const LANDING_V2_HTML = `
<svg style="display:none"><symbol id="m" viewBox="0 0 64 64"><g stroke="currentColor" fill="currentColor" stroke-linecap="round"><circle cx="32" cy="32" r="6.85" stroke="none"/><line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/><line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/><line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/><line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/><line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/><line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/><line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/><line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/><line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/><line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/><line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/></g><g stroke="#00CEC9" fill="#00CEC9" stroke-linecap="round"><line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/><circle cx="49.24" cy="9.94" r="1.61"/></g></symbol></svg>

<div class="navwrap">
  <nav class="nav" id="nav">
    <a class="brand" href="#hero"><svg class="mark"><use href="#m"/></svg><span class="bn">Aura</span></a>
    <div class="readout"><span class="tk"></span><span id="rn">01</span> / <b id="rt2">The order</b></div>
    <div class="links">
      <a href="#order" data-l="order">The order</a>
      <a href="#math" data-l="math">The math</a>
      <a href="#week" data-l="week">Your week</a>
      <a href="#runs" data-l="runs">What runs</a>
      <a href="#questions" data-l="questions">Eight questions</a>
      <a href="#seats" data-l="seats">The seats</a>
    </div>
    <a class="navcta" href="#seat">Request a founder seat <span class="a">↗</span></a>
    <span class="prog" id="prog"></span>
  </nav>
</div>

<section id="hero">
  <div class="wrap">
    <span class="pill rv"><i class="dot"></i> Built from your work, not from a prompt</span>
    <h1 class="rv" style="max-width:15ch">Your name should arrive <em>before you do.</em></h1>

    <div class="pair drawline">
      <div class="off rv">
        <p class="mono">What a chat gives you</p>
        <p class="q">Something written <span class="strike">about</span> your subject.</p>
        <p class="body">Fluent, fast, and indistinguishable from what the person beside you generated this morning. It never read you. It cannot.</p>
      </div>
      <div class="on rv">
        <p class="mono" style="color:var(--cy-t)">What Aura gives you</p>
        <p class="q">Something written <i>from your work.</i></p>
        <p class="body">A professional intelligence that reads you first, then keeps reading — what you read, watch, hear and do — and gets sharper every week it spends with you.</p>
        <div class="order">
          <span class="ord first"><b>01</b> Your profile intelligence — required</span>
          <span class="ord"><b>02</b> Your voice, from your own posts</span>
          <span class="ord"><b>03</b> The night shift</span>
        </div>
      </div>
    </div>

    <div class="ctas rv">
      <a class="btn btn-p" href="#seat">Request a founder seat <span class="a">↗</span></a>
      <a class="btn btn-g" href="#order">See the order it works in</a>
    </div>
    <p class="micro rv">Aura writes nothing until your profile exists <span class="seatline seatsep"></span></p>
  </div>
</section>

<section id="order" data-n="01" data-name="The order">
  <div class="wrap">
    <div class="sechead rv">
      <div class="eyebrow"><span>01 — The order</span></div>
      <h2>Four things happen. <em>The first one is not optional.</em></h2>
      <p class="lede" style="margin-top:20px">Most tools start writing on day one. Aura refuses to — because a draft built on nothing sounds like it was built on nothing.</p>
    </div>

    <div class="steps drawline thick rv">
      <span class="railtrack" aria-hidden="true"></span><span class="railfill" id="railfill" aria-hidden="true"></span>
      <div class="step">
        <span class="no">01</span>
        <div class="ttl">The door <em>— your profile intelligence</em></div>
        <p class="body">A short assessment, your LinkedIn, and everything you have read, read as one thing. Out comes a capability radar, the subjects you genuinely own, your industries, and where the ground is still soft.</p>
        <span class="tag req">Required first</span>
      </div>
      <div class="step">
        <span class="no">02</span>
        <div class="ttl">The source <em>— your own work</em></div>
        <p class="body">What you read, watch, hear and do — set against what the market is actually moving on, and against your own profile. Nothing is invented. Everything traces back.</p>
        <span class="tag">Yours</span>
      </div>
      <div class="step">
        <span class="no">03</span>
        <div class="ttl">The voice <em>— trained on you</em></div>
        <p class="body">Learned from your own posts: how you open, how you cut, how you close. Arabic and English are held apart, never translated across.</p>
        <span class="tag">Trained</span>
      </div>
      <div class="step">
        <span class="no">04</span>
        <div class="ttl">The night <em>— agents and the studio</em></div>
        <p class="body">Between 02:00 and dawn, four agents work on your week. A draft is waiting when you wake, and a studio to finish it in.</p>
        <span class="tag">Nightly</span>
      </div>
    </div>

    <div class="gate rv"><span class="k">✓</span><p>The result: people hear about you from your own work — not from something a chat invented this morning.</p></div>
  </div>
</section>

<section id="math" data-n="02" data-name="The math">
  <div class="wrap">
    <div class="sechead rv">
      <div class="eyebrow"><span>02 — The math</span></div>
      <h2>You are already doing the work. <em>None of it survives.</em></h2>
    </div>
    <div class="mathgrid">
      <div class="card rv">
        <div class="calchead">
          <span class="l"><i class="dot"></i> Your year · live calculation</span>
          <div class="curr" role="group" aria-label="Currency">
            <button type="button" data-curr="SAR" aria-pressed="true">SAR</button>
            <button type="button" data-curr="AED" aria-pressed="false">AED</button>
            <button type="button" data-curr="USD" aria-pressed="false">USD</button>
          </div>
        </div>
        <div class="slider">
          <div class="srow"><label for="hrs">Hours you read / week</label><output id="hrs-o" for="hrs">5</output></div>
          <input id="hrs" type="range" min="1" max="14" step="0.5" value="5" aria-label="Hours you read per week">
        </div>
        <div class="slider">
          <div class="srow"><label for="rt">An hour of yours is worth</label><output id="rt-o" for="rt">SAR 300</output></div>
          <input id="rt" type="range" min="50" max="900" step="25" value="300" aria-label="Value of an hour of your time">
        </div>
        <div class="figs">
          <div class="fig"><span class="k">What you already own</span><p class="v" id="own">260 hrs</p><p class="s">Hours of reading and thinking, every year.</p></div>
          <div class="fig"><span class="k">What survived</span><p class="v">0</p><p class="s">Nothing you can point to a year later.</p></div>
          <div class="fig"><span class="k">It already costs</span><p class="v" id="cost">SAR 78,000</p><p class="s">Time you have already spent, written off.</p></div>
          <div class="fig t"><span class="k">◆ What it becomes</span><p class="v">Top 3</p><p class="s">A named position on the subjects you own.</p></div>
        </div>
        <p class="kicker" id="kick"><strong>Six working weeks</strong> of thinking, written off every year. <strong>One tap to keep it.</strong></p>
        <p class="working">Showing the working — hours you own = hours per week × 52. It already costs = those hours × your hourly worth. Working weeks = annual hours ÷ 40. What survived is zero because nothing you read is written down anywhere you can use it. We do not promise reach, ranking or followers.</p>
      </div>
      <div class="card rv">
        <p class="ctitle">What people pay instead · per month</p>
        <div class="costrow"><span>Ghostwriter</span><span>$50 – $400</span></div>
        <div class="costrow"><span>Positioning consultant</span><span>$30 – $300</span></div>
        <div class="costrow"><span>Scheduling tool</span><span>$20 – $100</span></div>
        <div class="costrow"><span>AI writing assistant</span><span>$20 – $40</span></div>
        <div class="costrow"><span>Designer</span><span>$30 – $160</span></div>
        <div class="costrow total"><span>Total</span><span>~$150 – ~$1,000</span></div>
        <div class="freeblock">
          <p class="f">Free</p>
          <p class="ctitle" style="margin-top:10px">During founding beta</p>
          <p class="ctitle seatline" style="margin-top:6px"></p>
          <a class="btn btn-b" style="margin-top:18px" href="#seat">Request a founder seat</a>
          <p class="ctitle" style="margin-top:14px">No card · No commitment</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section id="week" data-n="03" data-name="Your week">
  <div class="wrap">
    <div class="sechead rv">
      <div class="eyebrow"><span>03 — What's in it for you</span></div>
      <h2>What actually changes <em>about your week.</em></h2>
    </div>
    <div class="g2" style="margin-bottom:clamp(12px,1.6vw,20px)">
      <div class="card rv">
        <p class="ctitle">The one that matters most</p>
        <h3>You publish every week without writing anything</h3>
        <p class="body" style="margin-top:10px">The draft is on your screen before you open your laptop, built from an article you read on Tuesday. Read it, change a line, press publish.</p>
        <p class="foot">Minutes a week — nothing goes out without you</p>
      </div>
      <div class="inst rv">
        <div class="top"><span>Last night</span><span>02:00 → 03:12</span></div>
        <ul class="tl">
          <li><i class="tdot"></i><div><span class="tt">02:04</span><span class="tx">Read 5 captures you saved this week.</span></div></li>
          <li><i class="tdot"></i><div><span class="tt">02:31</span><span class="tx">Found a pattern — 3 of them agree.</span></div></li>
          <li><i class="tdot"></i><div><span class="tt">03:12</span><span class="tx">Built the evidence, in your voice.</span></div></li>
        </ul>
        <div class="agents"><span class="ag">Reader</span><span class="ag">Signal</span><span class="ag">Voice</span><span class="ag">Editor</span></div>
      </div>
    </div>
    <div class="g3">
      <div class="card rv"><p class="ctitle">Nothing is lost</p><h3>Every good idea survives</h3><p class="body" style="margin-top:10px">Everything you capture is broken into usable fragments and kept, so a thought from March is still there in November.</p><p class="foot">~9 fragments from every capture</p></div>
      <div class="card rv"><p class="ctitle">It can be defended</p><h3>Every post carries its receipt</h3><p class="body" style="margin-top:10px">Each claim traces back to the source you captured, so you can stand behind it in a room full of people who will ask.</p>
        <div class="chips"><span class="chip t"><i></i>SDAIA report</span><span class="chip"><i></i>14 Jul</span><span class="chip"><i></i>9 fragments</span></div></div>
      <div class="card rv"><p class="ctitle">You see it moving</p><h3>One number, not a vanity meter</h3><p class="big" style="font-size:42px;margin-top:12px" data-countup="72">72</p><div class="meter"><i></i></div><p class="foot">The imprint · real presence only</p></div>
    </div>
  </div>
</section>

<section id="runs" data-n="04" data-name="What runs">
  <div class="wrap">
    <div class="sechead rv">
      <div class="eyebrow"><span>04 — What runs for you</span></div>
      <h2>Six things run. <em>You do one.</em></h2>
      <p class="lede" style="margin-top:20px">It's the first one, it takes a second, and it's the only thing Aura cannot do for you.</p>
    </div>
    <div class="plateBox">
      <div class="g3" style="margin-bottom:clamp(12px,1.6vw,20px)">
        <div class="svc mine rv"><p class="no">01</p><span class="tag-you"><i></i>Your one job</span><h3>Reading &amp; capture</h3><p class="body" style="margin-top:10px">One tap on anything you're already reading. The substance is kept — the argument, the figures, the source.</p><span class="st live"><i>✓</i>Shipped</span></div>
        <div class="svc rv"><p class="no">02</p><h3>Signals</h3><p class="body" style="margin-top:10px">What keeps coming back across everything you kept, set against what the market is moving on.</p><span class="st live"><i>✓</i>Shipped</span></div>
        <div class="svc rv"><p class="no">03</p><h3>Voice &amp; the studio</h3><p class="body" style="margin-top:10px">A draft in your register, Arabic or English, with its receipts attached — and a studio to finish it in.</p><span class="st live"><i>✓</i>Shipped</span></div>
      </div>
      <div class="g2">
        <div class="svc rv">
          <p class="no">04 · 05 · 06</p>
          <h3>The imprint, the envelope, and Ask Aura</h3>
          <p class="body" style="margin-top:10px">One number that moves only for real presence. A short brief waiting at dawn. And your own material answering back when you question it.</p>
          <div style="margin-top:20px;display:grid;gap:2px">
            <div class="mini"><span>The imprint</span><span class="st live inline"><i>✓</i>Shipped</span></div>
            <div class="mini"><span>The envelope</span><span class="st live inline"><i>✓</i>Shipped</span></div>
            <div class="mini"><span>Ask Aura</span><span class="st live inline"><i>✓</i>Shipped</span></div>
          </div>
          <p class="foot">All six shipped. Nothing on this page is a promise.</p>
        </div>
        <div class="svc night rv" style="justify-content:flex-end;min-height:320px">
          <h2 style="font-size:clamp(26px,3.4vw,40px)">Read once.<br>Notice always.<br><em>Publish as yourself.</em></h2>
          <p class="body" style="margin-top:16px">Founding seats are free through the beta, and members keep the terms they joined on.</p>
          <a class="btn btn-w" style="margin-top:26px;align-self:flex-start" href="#seat">Request a founder seat <span class="a">↗</span></a>
        </div>
      </div>
    </div>
  </div>
</section>

<section id="questions" data-n="05" data-name="Eight questions">
  <div class="wrap faqgrid">
    <div class="rv">
      <div class="eyebrow"><span>05 — What the door finds</span></div>
      <h2>Eight questions, <em>answered from your own material.</em></h2>
      <div class="help">
        <h3>Two of these aren't built yet</h3>
        <p class="body" style="margin-top:10px">Seven and eight are in design, shaped by the founding fifty. We'd rather show you the direction than pretend everything already works.</p>
        <a class="btn btn-g" style="margin-top:18px" href="#seats">See what it's for ↗</a>
      </div>
    </div>
    <div class="rv">
      <details class="q" open><summary><span class="n">01</span> Which subjects do you actually own?</summary><div class="panel"><p>It clusters everything you have captured and published, then names the territories that are genuinely yours — not the ones you wish were.</p><p class="ev">Clustered from your captures · named only where the evidence repeats</p></div></details>
      <details class="q"><summary><span class="n">02</span> What capability can you prove, with evidence?</summary><div class="panel"><p>Each capability is scored against a partner-level benchmark and backed by what you actually read and published, never by self-assessment.</p><p class="ev">Partner-level benchmark · evidence required for every point</p></div></details>
      <details class="q"><summary><span class="n">03</span> Where are you repeating yourself without noticing?</summary><div class="panel"><p>Every new point is checked against everything you have already published, so you stop re-making an argument you made in April.</p><p class="ev">Checked against your full published history</p></div></details>
      <details class="q"><summary><span class="n">04</span> Which of your themes is accelerating right now?</summary><div class="panel"><p>Themes are ranked by movement, not volume — so you can lean into the one that is picking up speed while it still is.</p><p class="ev">38 accelerating of 261 signals · strength = 0.6 × breadth + 0.4 × depth</p></div></details>
      <details class="q"><summary><span class="n">05</span> What does your writing sound like when it is really you?</summary><div class="panel"><p>It learns from every approval and every edit you make, in Arabic and English, until a draft reads like something you already wrote.</p><p class="ev">Learned from approvals and edits · Arabic and English held apart</p></div></details>
      <details class="q"><summary><span class="n">06</span> Which gaps are visible to the market but not to you?</summary><div class="panel"><p>Gaps are sorted largest-gap-first, never by your best score, because the useful list is the uncomfortable one.</p><p class="ev">Sorted largest-gap-first · never by your strongest result</p></div></details>
      <details class="q"><summary><span class="n">07</span> How does your position compare to your peer set? <span class="cs">Coming</span></summary><div class="panel"><p>A read on the market value of the position you have built.</p><p class="ev">In design · shaped by the founding fifty</p></div></details>
      <details class="q"><summary><span class="n">08</span> What would close the distance to the room above? <span class="cs">Coming</span></summary><div class="panel"><p>The capability evidence you are missing for the next seat — and a record assembled from what you proved, not what you claimed.</p><p class="ev">In design · shaped by the founding fifty</p></div></details>
    </div>
  </div>
</section>

<section id="seats" data-n="06" data-name="The seats">
  <div class="wrap ledgrid">
    <div class="rv">
      <div class="eyebrow"><span>06 — What it's actually for</span></div>
      <h2>Presence is not the point. <em>The seat is.</em></h2>
      <p class="lede" style="margin-top:22px">Nobody wants a posting habit. They want the room to already know them when they walk in — and to be asked, not to apply.</p>
      <p class="note">Aura does not sell any of these. It makes you findable and credible on the record. What that opens is between you and the market.</p>
    </div>
    <div class="sheet rv">
      <div class="shead drawline thick"><span class="t">The seats</span><span class="mono">Earned · not bought</span></div>
      <div class="lrow"><span class="k">The client</span><span class="lead"></span><span class="v">Had decided<br>before the call</span></div>
      <div class="lrow"><span class="k">The role</span><span class="lead"></span><span class="v">Found you —<br>you sent no CV</span></div>
      <div class="lrow"><span class="k">The stage</span><span class="lead"></span><span class="v cy">Invited,<br>not applied</span></div>
      <div class="lrow"><span class="k">The table</span><span class="lead"></span><span class="v">Your name raised<br>while you were out</span></div>
      <div class="lrow"><span class="k">The record</span><span class="lead"></span><span class="v cy">Twelve months of<br>your own thinking</span></div>
      <div class="sfoot"><span class="s">You take a seat. It earns you seats.</span><span class="mono">Aura</span></div>
    </div>
  </div>

  <div class="wrap plateBox" style="margin-top:clamp(28px,4vw,44px)">
    <div class="crow">
      <div class="card rv"><p class="ctitle">Where it reads</p><h3>Anything you're already reading</h3><p class="body" style="margin-top:10px">One tap. The substance stays; the tab closes.</p><span class="st live"><i>✓</i>Live</span></div>
      <div class="card rv"><p class="ctitle">Where it thinks</p><h3>Overnight, on your material</h3><p class="body" style="margin-top:10px">Your reading against what the market is moving on.</p><span class="st live"><i>✓</i>Live</span></div>
      <div class="card rv"><p class="ctitle">Where it writes</p><h3>The studio, in your voice</h3><p class="body" style="margin-top:10px">Trained on your own posts. Arabic and English apart.</p><span class="st live"><i>✓</i>Live</span></div>
      <div class="card rv"><p class="ctitle">Where it sits</p><h3>As close as WhatsApp</h3><p class="body" style="margin-top:10px">No app to open. Send it a link, get your draft back.</p><span class="st"><i>✓</i>Coming</span></div>
    </div>
  </div>
</section>

<section id="long" data-n="07" data-name="The long game">
  <div class="wrap card night" style="border-radius:34px;padding:clamp(28px,4vw,52px)">
    <div class="g2" style="align-items:end">
      <div class="rv">
        <div class="eyebrow night"><span>07 — The long game</span></div>
        <h2>It doesn't finish. <em>It compounds.</em></h2>
        <p class="body" style="margin-top:18px;max-width:54ch">Every draft you approve and every line you cut teaches it. Month one it sounds close. Month six it knows which arguments are yours, which ones you have already made, and where your ground is still soft — and it starts telling you where to stand next.</p>
      </div>
      <div class="rv">
        <p class="ctitle">Coming — as it learns you</p>
        <div style="margin-top:14px">
          <div class="lrow" style="border-color:rgba(255,255,255,.12)"><span class="k" style="color:#fff;font-size:21px">Where you stand now</span><span class="lead" style="border-color:rgba(255,255,255,.2)"></span><span class="v" style="color:rgba(255,255,255,.5)">Baselined</span></div>
          <div class="lrow" style="border-color:rgba(255,255,255,.12)"><span class="k" style="color:#fff;font-size:21px">Where you said you're going</span><span class="lead" style="border-color:rgba(255,255,255,.2)"></span><span class="v" style="color:rgba(255,255,255,.5)">Your north star</span></div>
          <div class="lrow" style="border-color:rgba(255,255,255,.12)"><span class="k" style="color:#fff;font-size:21px">The distance between</span><span class="lead" style="border-color:rgba(255,255,255,.2)"></span><span class="v cy" style="color:var(--cy-b)">Named, then closed</span></div>
          <div class="lrow" style="border:0"><span class="k" style="color:#fff;font-size:21px">The record of it</span><span class="lead" style="border-color:rgba(255,255,255,.2)"></span><span class="v" style="color:rgba(255,255,255,.5)">Assembled, not written</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<footer id="seat">
  <div class="wordmark" aria-hidden="true">AURA</div>
  <div class="fcta">
    <svg class="mk"><use href="#m"/></svg>
    <div class="eyebrow night"><span>Founding circle</span></div>
    <h2>Stop being the best-kept secret <em>in your field.</em></h2>
    <p>A professional intelligence that reads you first, works every night on what you already read, and waits for your approval.</p>
    <a class="btn btn-w" href="/request-access">Request a founder seat <span class="a">↗</span></a>
    <p class="micro" style="color:rgba(255,255,255,.5)">Takes 30 seconds · Decision within 24 hours <span class="seatline seatsep"></span></p>
    <p class="ar">حتى السوق يعرفك قبل ما يشوفك ✦</p>
  </div>
  <div class="fgrid">
    <div>
      <div style="display:flex;align-items:center;gap:9px"><svg class="mark"><use href="#m"/></svg><span class="bn" style="font-size:25px">Aura</span></div>
      <p class="body" style="margin-top:12px;max-width:30ch">A personal professional intelligence. Your expertise is invisible. Aura fixes that.</p>
      <div class="socials"><a href="#">in</a><a href="#">@</a><a href="#">✉</a></div>
      <p class="foot" style="color:rgba(255,255,255,.4)">Mohammad Mahafdhah · Aura builder</p>
    </div>
    <div><h4>Product</h4><ul><li><a href="#order">The order</a></li><li><a href="#runs">What runs</a></li><li><a href="#questions">Eight questions</a></li><li><a href="/auth">Log in</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="/our-story">Our story</a></li><li><a href="/guide">The guide</a></li><li><a href="/trust">Security &amp; trust</a></li><li><a href="mailto:support@aura-intel.org">Contact</a></li></ul></div>
    <div><h4>Legal</h4><ul><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li></ul></div>
  </div>
  <div class="fbottom"><span>© 2026 Aura</span><span>aura-intel.org</span><span>Built in Riyadh, for the world</span></div>
</footer>

<div class="seatbar"><i class="dot"></i><span class="sb seatline"></span><span class="sp"></span><a class="btn btn-w" style="min-height:44px;font-size:14px" href="#seat">Request a founder seat ↗</a></div>
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
    title: "Aura — Your name should arrive before you do",
    description:
      "A professional intelligence that reads you first, works every night on what you already read, and waits for your approval.",
    path: "/",
  });

  useEffect(() => setMounted(true), []);

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

  /* ── chapter readout, reveals, and the motion layer ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const cleanups: Array<() => void> = [];

    const nav = root.querySelector<HTMLElement>("#nav");
    const prog = root.querySelector<HTMLElement>("#prog");
    const rn = root.querySelector<HTMLElement>("#rn");
    const rt2 = root.querySelector<HTMLElement>("#rt2");
    const bar = root.querySelector<HTMLElement>(".seatbar");
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(".links a"));
    const steps = root.querySelector<HTMLElement>(".steps");
    const fill = root.querySelector<HTMLElement>("#railfill");
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".step"));
    const wm = root.querySelector<HTMLElement>(".wordmark");

    const onScroll = () => {
      const d = document.documentElement;
      const p = d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight);
      if (prog) prog.style.width = `${Math.min(p * 100, 100)}%`;
      nav?.classList.toggle("tight", d.scrollTop > 430);
      if (bar) {
        if (p > 0.5) bar.classList.add("up");
        else if (p < 0.4) bar.classList.remove("up");
      }
    };

    const rail = () => {
      if (!steps || !fill) return;
      const r = steps.getBoundingClientRect();
      const mid = window.innerHeight * 0.58;
      fill.style.height = `${Math.max(0, Math.min(r.height, mid - r.top))}px`;
      rows.forEach((row) => row.classList.toggle("lit", row.getBoundingClientRect().top < mid));
    };

    const parallax = () => {
      if (!wm || !wm.parentElement) return;
      const r = wm.parentElement.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, 1 - r.top / window.innerHeight));
      wm.style.transform = `translateX(-50%) translateY(${-p * 26}px)`;
    };

    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        onScroll();
        if (!reduced) { rail(); parallax(); }
        ticking = false;
      });
    };
    window.addEventListener("scroll", handler, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", handler));
    onScroll();
    if (!reduced) { rail(); parallax(); }

    const chapters = Array.from(root.querySelectorAll<HTMLElement>("section[data-n]"));
    if (chapters.length) {
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            const el = e.target as HTMLElement;
            if (rn) rn.textContent = el.dataset.n || "";
            if (rt2) rt2.textContent = el.dataset.name || "";
            links.forEach((a) => a.classList.toggle("on", a.dataset.l === el.id));
          }),
        { rootMargin: "-45% 0px -50% 0px" },
      );
      chapters.forEach((s) => io.observe(s));
      cleanups.push(() => io.disconnect());
    }

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

    const drawables = Array.from(root.querySelectorAll<HTMLElement>(".drawline, .sheet"));
    if (reduced) {
      drawables.forEach((el) => el.classList.add("drawn"));
    } else if (drawables.length) {
      const dro = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            dro.unobserve(e.target);
            e.target.classList.add("drawn");
          }),
        { rootMargin: "0px 0px -14% 0px" },
      );
      drawables.forEach((el) => dro.observe(el));
      cleanups.push(() => dro.disconnect());
    }

    const inst = root.querySelector<HTMLElement>(".inst");
    const logs = Array.from(root.querySelectorAll<HTMLElement>(".tl li"));
    if (reduced) {
      logs.forEach((li) => li.classList.add("in"));
    } else if (inst && logs.length) {
      const lo = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            lo.unobserve(e.target);
            logs.forEach((li, i) => {
              const t = window.setTimeout(() => li.classList.add("in"), i * 1000);
              cleanups.push(() => window.clearTimeout(t));
            });
          }),
        { threshold: 0.3 },
      );
      lo.observe(inst);
      cleanups.push(() => lo.disconnect());
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
          const sep = el.classList.contains("seatsep") ? "· " : "";
          el.textContent = `${sep}${claimed} of ${cap} founding seats taken`;
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
