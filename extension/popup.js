// Aura LinkedIn Capture v2 — Popup Script

const SUPABASE_URL = "https://zddlsztxfzvevzjbuocc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZGxzenR4Znp2ZXZ6amJ1b2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzEwNDEsImV4cCI6MjA4OTU0NzA0MX0.0fovNZRqM3LNAmVgefq6Ph6TJ3FnLrQVun2zzrLSFPI";

const $ = (id) => document.getElementById(id);

const PAGE_LABELS = {
  creator_analytics: { icon: "A", cls: "analytics", label: "Creator Analytics", desc: "Followers, impressions, engagement rate" },
  audience_analytics: { icon: "A", cls: "analytics", label: "Audience Analytics", desc: "Industry, seniority, geography breakdown" },
  post_analytics: { icon: "P", cls: "post", label: "Post Analytics", desc: "Per-post impressions, reactions, comments" },
  individual_post: { icon: "P", cls: "post", label: "Individual Post", desc: "Post text, reactions, private analytics if available" },
  activity_feed: { icon: "F", cls: "feed", label: "Activity Feed", desc: "Discover post URLs from visible feed" },
  profile_page: { icon: "F", cls: "feed", label: "Profile Page", desc: "Visible posts on profile" },
  unknown: { icon: "—", cls: "none", label: "Not Capturable", desc: "Navigate to a LinkedIn analytics or post page" },
};

let currentPageType = "unknown";

/* ═══════════════════════════════════════════
   STATE MANAGEMENT
   ═══════════════════════════════════════════ */

async function loadState() {
  const { auraToken, auraStats, auraHandle } = await chrome.storage.local.get(["auraToken", "auraStats", "auraHandle"]);
  const stats = auraStats || { lastCapture: null, recordsSent: 0, errors: 0, captures: [] };

  if (auraToken) {
    $("view-login").style.display = "none";
    $("view-connected").style.display = "block";

    $("lastCapture").textContent = stats.lastCapture
      ? timeAgo(new Date(stats.lastCapture))
      : "—";
    $("recordsSent").textContent = stats.recordsSent || 0;
    $("errorCount").textContent = stats.errors || 0;
    $("errorCount").className = "status-value" + ((stats.errors || 0) > 0 ? " warn" : "");
    $("handleDisplay").textContent = auraHandle ? `@${auraHandle}` : "—";

    // Show recent captures
    if (stats.captures?.length > 0) {
      $("recentCaptures").style.display = "block";
      $("captureHistory").innerHTML = stats.captures.slice(0, 5).map(c =>
        `<div class="history-item">
          <span class="hi-type">${c.pageType || c.type}</span>
          <span>${timeAgo(new Date(c.time))}</span>
          <span class="hi-records">${c.records} rec</span>
        </div>`
      ).join("");
    }

    detectCurrentPage();
  } else {
    $("view-login").style.display = "block";
    $("view-connected").style.display = "none";
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ═══════════════════════════════════════════
   PAGE DETECTION
   ═══════════════════════════════════════════ */

async function detectCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("linkedin.com")) {
      updatePageBadge("unknown");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: "detect_page" });
    currentPageType = response?.pageType || "unknown";
    updatePageBadge(currentPageType);
  } catch {
    updatePageBadge("unknown");
  }
}

function updatePageBadge(pageType) {
  currentPageType = pageType;
  const info = PAGE_LABELS[pageType] || PAGE_LABELS.unknown;
  $("badgeIcon").textContent = info.icon;
  $("badgeIcon").className = `badge-icon ${info.cls}`;
  $("badgeLabel").textContent = info.label;
  $("badgeDesc").textContent = info.desc;
  $("captureBtn").disabled = (pageType === "unknown");
}

/* ═══════════════════════════════════════════
   LOGIN
   ═══════════════════════════════════════════ */

$("connectBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const msgEl = $("loginMsg");

  if (!email || !password) {
    msgEl.innerHTML = '<div class="msg error">Enter email and password</div>';
    return;
  }

  $("connectBtn").disabled = true;
  $("connectBtn").textContent = "Connecting…";

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      msgEl.innerHTML = `<div class="msg error">${data.error_description || data.msg || "Login failed"}</div>`;
      return;
    }

    await chrome.storage.local.set({
      auraToken: data.access_token,
      auraRefreshToken: data.refresh_token,
      auraStats: { lastCapture: null, recordsSent: 0, errors: 0, captures: [] },
    });
    loadState();
  } catch (e) {
    msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
  } finally {
    $("connectBtn").disabled = false;
    $("connectBtn").textContent = "Connect";
  }
});

/* ═══════════════════════════════════════════
   DISCONNECT
   ═══════════════════════════════════════════ */

$("disconnectBtn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["auraToken", "auraRefreshToken", "auraStats", "auraHandle", "captureHashes"]);
  loadState();
});

/* ═══════════════════════════════════════════
   CAPTURE THIS PAGE
   ═══════════════════════════════════════════ */

$("captureBtn").addEventListener("click", async () => {
  const btn = $("captureBtn");
  const msgEl = $("captureMsg");
  btn.disabled = true;
  $("captureBtnText").textContent = "Capturing…";
  msgEl.innerHTML = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("linkedin.com")) {
      msgEl.innerHTML = '<div class="msg error">Navigate to LinkedIn first</div>';
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: "capture" });
    if (!response?.success) {
      msgEl.innerHTML = `<div class="msg error">${response?.error || "Capture failed"}</div>`;
      return;
    }

    // Store detected handle
    if (response.detectedHandle) {
      await chrome.storage.local.set({ auraHandle: response.detectedHandle });
    }

    // Send via background
    const result = await chrome.runtime.sendMessage({
      action: "send_to_aura",
      payload: { ...response.payload, _pageType: response.pageType },
    });

    if (result?.error) {
      msgEl.innerHTML = `<div class="msg error">${result.error}</div>`;
      return;
    }

    const stored = result?.total_stored || 0;
    const details = [];
    if (result?.follower_snapshot) details.push("followers updated");
    if (result?.posts?.inserted) details.push(`${result.posts.inserted} new posts`);
    if (result?.posts?.enriched) details.push(`${result.posts.enriched} enriched`);
    if (result?.post_metrics?.inserted) details.push(`${result.post_metrics.inserted} metrics`);

    msgEl.innerHTML = `<div class="msg success">✓ ${stored} record${stored !== 1 ? "s" : ""} captured${details.length ? " · " + details.join(", ") : ""}</div>`;
    loadState();
  } catch (e) {
    msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
  } finally {
    btn.disabled = false;
    $("captureBtnText").textContent = "Capture This Page";
  }
});

/* ═══════════════════════════════════════════
   GUIDED CAPTURE
   ═══════════════════════════════════════════ */

$("guidedBtn").addEventListener("click", async () => {
  const btn = $("guidedBtn");
  const msgEl = $("captureMsg");
  btn.disabled = true;
  $("guidedBtnText").textContent = "Running…";
  msgEl.innerHTML = "";

  const progressEl = $("guidedProgress");
  const stepsEl = $("guidedSteps");
  const fillEl = $("progressFill");
  const labelEl = $("progressLabel");

  progressEl.style.display = "block";

  const stepLabels = ["Profile Page", "Activity Feed", "Post Capture", "Creator Analytics"];
  stepsEl.innerHTML = stepLabels.map((label, i) =>
    `<div class="guided-step" id="gstep-${i}">
      <span class="step-icon pending" id="gicon-${i}">○</span>
      <span class="step-label" id="glabel-${i}">${label}</span>
      <span class="step-detail" id="gdetail-${i}">—</span>
    </div>`
  ).join("");

  fillEl.style.width = "0%";
  labelEl.textContent = "Starting guided capture…";

  try {
    const result = await chrome.runtime.sendMessage({ action: "guided_capture" });

    if (result?.steps) {
      result.steps.forEach((step, i) => {
        const icon = $(`gicon-${i}`);
        const label = $(`glabel-${i}`);
        const detail = $(`gdetail-${i}`);

        if (step.success) {
          icon.className = "step-icon done";
          icon.textContent = "✓";
          label.className = "step-label done";
          detail.textContent = `${step.records} records`;
        } else {
          icon.className = "step-icon failed";
          icon.textContent = "✗";
          label.className = "step-label";
          detail.textContent = step.error?.slice(0, 30) || "failed";
        }
      });

      fillEl.style.width = "100%";
      labelEl.textContent = result.summary || "Complete";

      if (result.totalRecords > 0) {
        msgEl.innerHTML = `<div class="msg success">✓ Guided capture complete · ${result.totalRecords} records</div>`;
      } else {
        msgEl.innerHTML = '<div class="msg info">Guided capture finished. Some pages may not have had extractable data.</div>';
      }
    } else {
      msgEl.innerHTML = `<div class="msg error">${result?.error || "Guided capture failed"}</div>`;
    }

    loadState();
  } catch (e) {
    msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
  } finally {
    btn.disabled = false;
    $("guidedBtnText").textContent = "Run Guided Capture";
  }
});

/* ═══════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════ */

loadState();
