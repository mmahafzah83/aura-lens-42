import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { signOutAndLand } from "@/lib/signOut";
import { SEAT_PATH } from "@/lib/seatCopy";

/* ────────────────────────────────────────────────────────────────
   LandingV2 — one continuous story, top to bottom.
   Eight bands: hero, mirror, six moves, refusal, worth + price,
   timeline, questions, close. System-B tokens only.
   ──────────────────────────────────────────────────────────────── */

const CSS = `
.aura-v2 *{box-sizing:border-box;margin:0;padding:0}
.aura-v2{--ink:#0F1519;--ink2:#37424F;--ink3:#5B6673;--ink4:#98A2AE;--line:#E2E7EE;--line2:#D2D8E0;--white:#FFF;--canvas:#F2F5F9;--tint:#EFF4FA;--blue:#0670C4;--blue2:#04477C;--bluetint:#E7F1FB;--cyan:#00CEC9;--cyanT:#00807B;--cyantint:#E0F7F6;--amber:#E0A82E;--amberT:#9A6F12;--ambertint:#FDF3DF;--ui:"Inter",system-ui,sans-serif;--mono:"IBM Plex Mono",monospace;--sp:cubic-bezier(.16,1,.3,1);font-family:var(--ui);background:var(--canvas);color:var(--ink);-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh}
.aura-v2 a{text-decoration:none}
.aura-v2 :focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:8px}
.aura-v2 .navshell{position:sticky;top:0;z-index:60;padding:14px 18px;display:flex;justify-content:center;pointer-events:none;background:linear-gradient(var(--canvas) 55%,rgba(242,245,249,0))}
.aura-v2 .nav{pointer-events:auto;display:flex;align-items:center;gap:8px;background:var(--ink);border-radius:999px;padding:7px 7px 7px 18px;box-shadow:0 20px 46px -20px rgba(15,21,25,.55);max-width:calc(100vw - 36px)}
.aura-v2 .brand{display:flex;align-items:center;gap:9px;margin-right:6px}
.aura-v2 .mark{width:24px;height:24px;flex:0 0 24px;color:#fff}
.aura-v2 .bn{font-weight:700;color:#fff;font-size:19px;letter-spacing:-.02em;line-height:1}
.aura-v2 .navalt{display:inline-flex;align-items:center;min-height:44px;background:rgba(255,255,255,.12);color:#fff;border:0;cursor:pointer;font-family:var(--ui);border-radius:999px;padding:11px 15px;font-size:13.5px;font-weight:600;white-space:nowrap;transition:.2s}
.aura-v2 .navalt:hover{background:rgba(255,255,255,.2)}
.aura-v2 .navcta{display:inline-flex;align-items:center;min-height:44px;gap:9px;background:#fff;color:var(--ink);border-radius:999px;padding:11px 17px;font-size:14px;font-weight:600;white-space:nowrap;transition:.2s}
.aura-v2 .navcta:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(0,0,0,.45)}
.aura-v2 .stage{max-width:1080px;margin:0 auto;padding:20px 22px 70px}
.aura-v2 section{margin-top:76px}
.aura-v2 .band{border-radius:24px;padding:clamp(30px,4.4vw,58px)}
.aura-v2 .band.white{background:var(--white);border:1px solid var(--line)}
.aura-v2 .band.night{background:var(--ink);color:#fff}
.aura-v2 .chip{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);background:var(--white);border:1px solid var(--line);padding:8px 14px;border-radius:999px}
.aura-v2 .cdot{width:7px;height:7px;border-radius:999px;background:var(--cyan);display:inline-block}
.aura-v2 h1{font-size:clamp(36px,5.4vw,60px);font-weight:700;letter-spacing:-.035em;line-height:1.04;margin-top:22px;max-width:16ch}
.aura-v2 h2{font-size:clamp(27px,3.6vw,42px);font-weight:700;letter-spacing:-.032em;line-height:1.1;max-width:20ch}
.aura-v2 .band.night h2{color:#fff}
.aura-v2 .sub{font-size:clamp(16px,1.7vw,18.5px);color:var(--ink3);line-height:1.6;margin-top:20px;max-width:56ch}
.aura-v2 .eyebrow{font-family:var(--mono);font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink4);margin-bottom:14px}
.aura-v2 .btn{font-family:var(--ui);font-weight:600;font-size:15px;min-height:50px;padding:14px 26px;border:none;border-radius:8px;cursor:pointer;transition:200ms var(--sp);display:inline-flex;align-items:center;justify-content:center}
.aura-v2 .bp{background:var(--blue);color:#fff}
.aura-v2 .bp:hover{background:var(--blue2);transform:translateY(-2px)}
.aura-v2 .bout{background:var(--white);color:var(--ink);border:1px solid var(--line2)}
.aura-v2 .bout:hover{border-color:var(--ink)}
.aura-v2 .bwhite{background:#fff;color:var(--ink)}
.aura-v2 .bwhite:hover{transform:translateY(-2px)}
.aura-v2 .quiet{font-size:13.5px;color:var(--ink3);margin-top:14px}
.aura-v2 .band.night .quiet{color:#A7B0BC}
.aura-v2 .hrow{padding:22px 0;border-bottom:1px solid var(--line)}
.aura-v2 .hrow:last-of-type{border-bottom:none}
.aura-v2 .hrow .s{font-size:clamp(18px,2.2vw,22px);font-weight:650;letter-spacing:-.02em;line-height:1.3}
.aura-v2 .hrow .e{font-size:15px;color:var(--ink3);line-height:1.6;margin-top:7px}
.aura-v2 .close-p{font-size:16px;color:var(--ink3);line-height:1.65;margin-top:26px;max-width:60ch}
.aura-v2 .moves{margin-top:34px;display:grid;gap:0;position:relative}
.aura-v2 .move{display:grid;grid-template-columns:34px 1fr;gap:18px;padding:0 0 26px;position:relative}
.aura-v2 .move::after{content:"";position:absolute;left:17px;top:34px;bottom:0;width:1px;background:var(--line)}
.aura-v2 .move:last-child{padding-bottom:0}
.aura-v2 .move:last-child::after{display:none}
.aura-v2 .num{width:34px;height:34px;border-radius:999px;background:var(--ink);color:#fff;font-family:var(--mono);font-size:13px;display:grid;place-items:center;position:relative;z-index:1}
.aura-v2 .move h3{font-size:18.5px;font-weight:650;letter-spacing:-.02em;line-height:1.3;margin-top:5px}
.aura-v2 .move p{font-size:15px;color:var(--ink3);line-height:1.62;margin-top:8px;max-width:62ch}
.aura-v2 .segs{display:flex;gap:8px;margin-top:30px;max-width:420px}
.aura-v2 .segs i{height:10px;flex:1;border-radius:999px;background:#2A333C;display:block}
.aura-v2 .segs i.on{background:var(--cyan)}
.aura-v2 .cap{font-family:var(--mono);font-size:12.5px;letter-spacing:.06em;color:#A7B0BC;margin-top:14px}
.aura-v2 .band.night p{color:#A7B0BC}
.aura-v2 .worth b{color:var(--ink);font-weight:650}
.aura-v2 .wline{font-size:clamp(16px,1.9vw,19px);color:var(--ink3);line-height:1.55;padding:20px 0;border-bottom:1px solid var(--line)}
.aura-v2 .wline:last-of-type{border-bottom:none}
.aura-v2 .pricegrid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px;align-items:stretch}
.aura-v2 .card{border-radius:20px;padding:30px 26px;display:flex;flex-direction:column;position:relative;background:var(--white);border:1px solid var(--line)}
.aura-v2 .card.night{background:var(--ink);border-color:#28313A;color:#fff}
.aura-v2 .card .kick{font-family:var(--mono);font-size:12.5px;letter-spacing:.15em;color:var(--ink4)}
.aura-v2 .card.night .kick{color:#A7B0BC}
.aura-v2 .achip{display:inline-flex;align-items:center;font-family:var(--mono);font-size:12.5px;letter-spacing:.1em;padding:6px 11px;border-radius:999px;background:var(--ambertint);color:var(--amberT);margin-left:10px}
.aura-v2 .card.night .achip{background:rgba(224,168,46,.16);color:var(--amber)}
.aura-v2 .card .who{font-size:15.5px;line-height:1.5;margin-top:14px;color:var(--ink2);max-width:30ch}
.aura-v2 .card.night .who{color:#C7CFD8}
.aura-v2 .prc{display:flex;align-items:baseline;gap:8px;margin-top:20px}
.aura-v2 .prc .p{font-family:var(--mono);font-size:clamp(30px,4vw,40px);font-weight:600;letter-spacing:-.03em;line-height:1}
.aura-v2 .card .pn{font-size:13.5px;color:var(--ink3);line-height:1.55;margin-top:9px}
.aura-v2 .card.night .pn{color:#8E99A6}
.aura-v2 .card ul{list-style:none;display:grid;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}
.aura-v2 .card.night ul{border-top-color:rgba(255,255,255,.14)}
.aura-v2 .card li{font-size:14px;line-height:1.55;color:var(--ink2);padding-left:18px;position:relative}
.aura-v2 .card.night li{color:#C7CFD8}
.aura-v2 .card li::before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:999px;background:var(--cyan)}
.aura-v2 .card .cta{margin-top:auto;padding-top:24px}
.aura-v2 .card .cta .btn{width:100%}
.aura-v2 .foot-note{font-size:12.5px;color:var(--ink3);line-height:1.6;margin-top:14px}
.aura-v2 .card.night .foot-note{color:#8E99A6}
.aura-v2 .tl{margin-top:30px;display:grid;gap:0}
.aura-v2 .tli{display:grid;grid-template-columns:88px 1fr;gap:20px;padding:20px 0;border-bottom:1px solid var(--line);align-items:start}
.aura-v2 .tli:last-child{border-bottom:none}
.aura-v2 .tli .k{font-family:var(--mono);font-size:12.5px;letter-spacing:.13em;color:var(--cyanT);padding-top:3px}
.aura-v2 .tli .t{font-size:16.5px;font-weight:650;letter-spacing:-.018em;line-height:1.35}
.aura-v2 .tli .d{font-size:14.5px;color:var(--ink3);line-height:1.6;margin-top:6px}
.aura-v2 details{background:var(--white);border:1px solid var(--line);border-radius:12px;padding:17px 20px;margin-bottom:10px}
.aura-v2 details[open]{border-color:var(--line2)}
.aura-v2 summary{font-size:16px;font-weight:600;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px;min-height:44px}
.aura-v2 summary::-webkit-details-marker{display:none}
.aura-v2 summary::after{content:"";width:11px;height:11px;border-right:2px solid var(--blue);border-bottom:2px solid var(--blue);transform:rotate(45deg);transition:220ms var(--sp);flex-shrink:0;margin-top:-4px}
.aura-v2 details[open] summary::after{transform:rotate(-135deg);margin-top:2px}
.aura-v2 details p{font-size:15px;color:var(--ink3);line-height:1.65;margin-top:12px}
.aura-v2 .terms{display:grid;gap:12px;margin-top:26px;list-style:none}
.aura-v2 .terms li{display:grid;grid-template-columns:20px 1fr;gap:11px;font-size:14.5px;color:var(--ink2);line-height:1.6}
.aura-v2 .tick{width:19px;height:19px;border-radius:999px;background:var(--cyantint);color:var(--cyanT);display:grid;place-items:center;margin-top:2px;font-size:12.5px;font-family:var(--mono)}
.aura-v2 .foot{border-top:1px solid var(--line);margin-top:60px;padding:20px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.aura-v2 .foot span,.aura-v2 .foot a{font-family:var(--mono);font-size:12.5px;color:var(--ink4);letter-spacing:.07em}
.aura-v2 .foot a{display:inline-flex;align-items:center;min-height:44px;padding:0 2px}
.aura-v2 .foot a:hover{color:var(--blue)}
.aura-v2 .rv{opacity:0;transform:translateY(16px);transition:700ms var(--sp)}
.aura-v2 .rv.in{opacity:1;transform:none}
@media(max-width:860px){
 .aura-v2 .pricegrid{grid-template-columns:1fr}
 .aura-v2 .tli{grid-template-columns:1fr;gap:6px}
 .aura-v2 .stage{padding:16px 16px 50px}
 .aura-v2 section{margin-top:52px}
 .aura-v2 .bn{font-size:17px}
 .aura-v2 .navalt,.aura-v2 .navcta{padding:11px 13px;font-size:13px}
}
@media(prefers-reduced-motion:reduce){.aura-v2 .rv{opacity:1;transform:none;transition:none}}
`;

const HTML = `
<svg style="display:none"><symbol id="m" viewBox="0 0 64 64"><g stroke="currentColor" fill="currentColor" stroke-linecap="round"><circle cx="32" cy="32" r="6.85" stroke="none"/><line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/><line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/><line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/><line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/><line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/><line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/><line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/><line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/><line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/><line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/><line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/></g><g stroke="#00CEC9" fill="#00CEC9" stroke-linecap="round"><line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/><circle cx="49.24" cy="9.94" r="1.61"/></g></symbol></svg>

<div class="navshell">
  <nav class="nav">
    <a class="brand" href="/"><svg class="mark"><use href="#m"/></svg><span class="bn">Aura</span></a>
    <a class="navalt" id="navalt" href="/auth">Sign in</a>
    <a class="navcta" id="navcta" href="/assessment">Read me free</a>
  </nav>
</div>

<main class="stage">

  <!-- 1 · HERO -->
  <section style="margin-top:34px" class="rv">
    <span class="chip"><i class="cdot"></i> AI Professional Identity Platform</span>
    <h1>Your experience is worth more than your profile shows.</h1>
    <p class="sub">Twenty years of knowing things. A page that says almost none of it. Aura reads you the way the market does — and shows you the gap, free.</p>
    <p style="margin-top:28px"><a class="btn bp" id="heropri" href="/assessment">Read me free</a></p>
    <p class="quiet">No card. No account needed to look.</p>
  </section>

  <!-- 2 · THE MIRROR -->
  <section class="band white rv">
    <h2>You already do the work.</h2>
    <div style="margin-top:20px">
      <div class="hrow"><div class="s">You read for two hours a day.</div><div class="e">Reports, articles, the things your field argues about.</div></div>
      <div class="hrow"><div class="s">You know things your market would pay to hear.</div><div class="e">You say them in meetings, and they vanish.</div></div>
      <div class="hrow"><div class="s">Your profile says none of it.</div><div class="e">And it is the first thing anyone checks.</div></div>
    </div>
    <p class="close-p">Most senior people have never once been told how they come across. That is the first thing Aura fixes — before any writing, before anything.</p>
  </section>

  <!-- 3 · THE SIX MOVES -->
  <section class="rv">
    <p class="eyebrow">What a seat gives you</p>
    <h2>The week you already live, made visible.</h2>
    <div class="moves">
      <div class="move"><span class="num">1</span><div><h3>See yourself the way the market does.</h3><p>What is public about you, read against what you actually know. The gap, named in plain words. This part is free, and stays free.</p></div></div>
      <div class="move"><span class="num">2</span><div><h3>Stop losing what you read.</h3><p>The article at 6am. The board paper. The thing you worked out in a meeting. Keep it once and it is yours for good — with its source attached, findable years later.</p></div></div>
      <div class="move"><span class="num">3</span><div><h3>Find the position only you can take.</h3><p>Aura reads your sector and your own material together, and shows you where you already have a point of view — with the evidence behind it, so it holds up in the room, not just online.</p></div></div>
      <div class="move"><span class="num">4</span><div><h3>Sound like you. Not like a machine.</h3><p>It learns how you write from what you have already written — how you open, how long your sentences run, how you land a point. English or Arabic, written rather than translated.</p></div></div>
      <div class="move"><span class="num">5</span><div><h3>Wake up to a draft.</h3><p>While you sleep, Aura reads what moved in your field and matches it to what you know. In the morning a draft is waiting. You read it over coffee and decide. Nothing goes out unless you press it.</p></div></div>
      <div class="move"><span class="num">6</span><div><h3>Every week, it knows you better.</h3><p>What you keep, what you change, what you throw away — all of it teaches next week. Six months in, you own something nobody can buy off a shelf.</p></div></div>
    </div>
  </section>

  <!-- 4 · THE REFUSAL -->
  <section class="band night rv">
    <h2>It throws away most of what it writes.</h2>
    <p style="font-size:16px;line-height:1.65;margin-top:18px;max-width:60ch">Every draft is judged before you see it — against what you actually said, in your own register, with a real ending. Most do not survive. You only meet the ones that did.</p>
    <div class="segs"><i></i><i></i><i></i><i></i><i class="on"></i></div>
    <p class="cap">Written five times. Shown once. That is the point.</p>
  </section>

  <!-- 5 · WORTH + PRICE -->
  <section class="rv worth">
    <p class="eyebrow">What it costs</p>
    <h2>What this is worth against what it costs.</h2>
    <div style="margin-top:18px">
      <p class="wline">A ghostwriter who learns your field charges <b>$1,500 a month</b> — and still isn't you.</p>
      <p class="wline"><b>One hour of your own time</b> is worth more than this whole month costs.</p>
      <p class="wline">And the reading you already do earns your name <b>nothing</b>.</p>
    </div>

    <div class="pricegrid">
      <div class="card">
        <div><span class="kick">THE READ</span></div>
        <p class="who">See how you come across, before you change anything.</p>
        <div class="prc"><span class="p">Free</span></div>
        <p class="pn">Free, and it stays free.</p>
        <ul>
          <li>What your profile says about you, in plain words</li>
          <li>Your CV against what the market can see</li>
          <li>A paper you can keep, or send to someone</li>
        </ul>
        <div class="cta"><a class="btn bout" href="/assessment">Read me free</a></div>
      </div>

      <div class="card night">
        <div><span class="kick">THE LOOP</span><span class="achip">Founding seats open</span></div>
        <p class="who">For someone who reads all week and has nothing to show for it.</p>
        <div class="prc"><span class="p">$35/month</span></div>
        <p class="pn">Stop any month. Everything you made stays yours.</p>
        <ul>
          <li>Everything you read, kept and searchable for good</li>
          <li>Your point of view found for you, evidence attached</li>
          <li>Written in your register, English or Arabic</li>
          <li>A draft every morning — nothing posts without you</li>
        </ul>
        <div class="cta"><a class="btn bwhite" href="SEAT_PATH_TOKEN">Take a founding seat</a></div>
        <p class="foot-note">A founding seat keeps this price for as long as you stay. It is not a discount.</p>
      </div>
    </div>
  </section>

  <!-- 6 · TIMELINE -->
  <section class="band white rv">
    <h2>What happens after you sit down.</h2>
    <div class="tl">
      <div class="tli"><div class="k">MIN 1</div><div><div class="t">You paste your LinkedIn address.</div><div class="d">That's all Aura asks for.</div></div></div>
      <div class="tli"><div class="k">MIN 3</div><div><div class="t">It reads you back to yourself.</div><div class="d">Most people stop here and just look.</div></div></div>
      <div class="tli"><div class="k">DAY 1</div><div><div class="t">You keep the first three things you read.</div><div class="d">They stop disappearing.</div></div></div>
      <div class="tli"><div class="k">WEEK 1</div><div><div class="t">The first draft waits with your coffee.</div><div class="d">You change two lines and post it — or you don't.</div></div></div>
      <div class="tli"><div class="k">MONTH 2</div><div><div class="t">Someone you respect says</div><div class="d">"I've been seeing your posts."</div></div></div>
    </div>
  </section>

  <!-- 7 · QUESTIONS -->
  <section class="rv">
    <h2>Fair questions.</h2>
    <div style="margin-top:26px">
      <details open><summary>Does the free read really stay free?</summary><p>Yes. It does not run out and it does not turn into a trial. If we say free, it is free.</p></details>
      <details><summary>Will it post as me?</summary><p>Never. Nothing leaves your hands unless you press the button yourself.</p></details>
      <details><summary>Will it sound like AI?</summary><p>It learns from what you have already written, and it deletes its own drafts that don't pass as you. If one still gets through, you say so — and it learns.</p></details>
      <details><summary>What happens to my CV?</summary><p>Read and destroyed, unless you make an account. Then it is yours, and you can remove it any time.</p></details>
      <details><summary>Can I stop?</summary><p>Any month. Everything you kept and everything you wrote stays yours.</p></details>
      <details><summary>What is a founding seat?</summary><p>The price you join at, held for as long as you stay, and set up with you personally. It is not a discount.</p></details>
    </div>
    <ul class="terms">
      <li><span class="tick">✓</span><span>Looking costs nothing and asks for no card.</span></li>
      <li><span class="tick">✓</span><span>Stop any month. You keep what you made.</span></li>
      <li><span class="tick">✓</span><span>Nothing is posted for you, ever.</span></li>
    </ul>
  </section>

  <!-- 8 · CLOSE -->
  <section class="band night rv">
    <h2>Be known for what you already know.</h2>
    <p style="font-size:16px;line-height:1.65;margin-top:18px;max-width:58ch">Not a creator. Not a brand. The person people think of when your subject comes up — because your name finally says what your experience earned.</p>
    <p style="margin-top:28px"><a class="btn bwhite" href="/assessment">Read me free</a></p>
  </section>

  <div class="foot">
    <span>AURA · AURA-INTEL.ORG · BUILT IN RIYADH</span>
    <span><a href="/our-story">Our story</a> · <a href="/guide">Guide</a> · <a href="/trust">Security and trust</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
  </div>
</main>
`.replace("SEAT_PATH_TOKEN", SEAT_PATH);

const LandingV2 = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  usePageMeta({
    title: "Aura — your experience is worth more than your profile shows",
    description:
      "Aura reads you the way the market does and shows you the gap, free. Keep what you read, find your position, and wake up to a draft in your own words.",
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
      cta.textContent = signedIn ? "Open Aura" : "Read me free";
      cta.setAttribute("href", signedIn ? "/home" : "/assessment");
    }
    if (hero) {
      hero.textContent = signedIn ? "Open Aura" : "Read me free";
      hero.setAttribute("href", signedIn ? "/home" : "/assessment");
    }
  }, [signedIn, mounted]);

  /* ── in-app link interception ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      if ((a as HTMLAnchorElement).dataset.signout === "1") {
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
    return () => root.removeEventListener("click", onClick);
  }, [mounted, navigate]);

  /* ── reveals ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const items = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
    if (reduced) { items.forEach((el) => el.classList.add("in")); return; }
    const ro = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        ro.unobserve(e.target);
        e.target.classList.add("in");
      }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [mounted]);

  return (
    <>
      <style>{CSS}</style>
      <div ref={rootRef} className="aura-v2" dangerouslySetInnerHTML={{ __html: HTML }} />
    </>
  );
};

export default LandingV2;
