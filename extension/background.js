// Aura LinkedIn Capture v2 — Background Service Worker
// Handles auth refresh, payload delivery, retry queue, guided capture, and badge updates.

const SUPABASE_URL = "https://zddlsztxfzvevzjbuocc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZGxzenR4Znp2ZXZ6amJ1b2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzEwNDEsImV4cCI6MjA4OTU0NzA0MX0.0fovNZRqM3LNAmVgefq6Ph6TJ3FnLrQVun2zzrLSFPI";

/* ── Alarms ── */
chrome.alarms.create("tokenRefresh", { periodInMinutes: 30 });
chrome.alarms.create("processRetryQueue", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tokenRefresh") await refreshToken();
  if (alarm.name === "processRetryQueue") await processRetryQueue();
});

/* ── Token Refresh ── */
async function refreshToken() {
  const { auraRefreshToken } = await chrome.storage.local.get("auraRefreshToken");
  if (!auraRefreshToken) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: auraRefreshToken }),
    });
    const data = await res.json();
    if (data.access_token) {
      await chrome.storage.local.set({
        auraToken: data.access_token,
        auraRefreshToken: data.refresh_token,
      });
    }
  } catch (e) {
    console.error("[Aura] Token refresh failed:", e);
  }
}

/* ── Send payload to Aura ── */
async function sendToAura(payload) {
  const { auraToken } = await chrome.storage.local.get("auraToken");
  if (!auraToken) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/browser-capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auraToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) {
    // Try token refresh and retry once
    await refreshToken();
    const { auraToken: newToken } = await chrome.storage.local.get("auraToken");
    if (!newToken) throw new Error("Session expired. Please log in again.");

    const retry = await fetch(`${SUPABASE_URL}/functions/v1/browser-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!retry.ok) throw new Error(`HTTP ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ── Retry Queue ── */
async function addToRetryQueue(payload) {
  const { retryQueue } = await chrome.storage.local.get("retryQueue");
  const queue = retryQueue || [];
  queue.push({ payload, attempts: 0, addedAt: Date.now() });
  // Keep max 50 items, drop oldest
  if (queue.length > 50) queue.splice(0, queue.length - 50);
  await chrome.storage.local.set({ retryQueue: queue });
}

async function processRetryQueue() {
  const { retryQueue } = await chrome.storage.local.get("retryQueue");
  if (!retryQueue || retryQueue.length === 0) return;

  const remaining = [];
  for (const item of retryQueue) {
    if (item.attempts >= 3) continue; // drop after 3 failures
    if (Date.now() - item.addedAt > 24 * 60 * 60 * 1000) continue; // drop after 24h

    try {
      await sendToAura(item.payload);
      await updateStats(item.payload);
    } catch {
      item.attempts++;
      remaining.push(item);
    }
  }
  await chrome.storage.local.set({ retryQueue: remaining });
}

/* ── Stats Tracking ── */
async function updateStats(payload, result) {
  const { auraStats } = await chrome.storage.local.get("auraStats");
  const stats = auraStats || { lastCapture: null, recordsSent: 0, errors: 0, captures: [] };
  stats.lastCapture = new Date().toISOString();
  const stored = result?.total_stored || (payload.posts?.length || 0) + (payload.post_metrics?.length || 0) + (payload.follower_snapshot ? 1 : 0);
  stats.recordsSent = (stats.recordsSent || 0) + stored;

  // Keep last 10 capture summaries
  if (!stats.captures) stats.captures = [];
  stats.captures.unshift({
    time: stats.lastCapture,
    type: payload.type,
    records: stored,
    pageType: payload._pageType || "unknown",
  });
  if (stats.captures.length > 10) stats.captures.length = 10;

  await chrome.storage.local.set({ auraStats: stats });
}

async function incrementError() {
  const { auraStats } = await chrome.storage.local.get("auraStats");
  const stats = auraStats || { lastCapture: null, recordsSent: 0, errors: 0, captures: [] };
  stats.errors = (stats.errors || 0) + 1;
  await chrome.storage.local.set({ auraStats: stats });
}

/* ── Dedup Hash ── */
async function isDuplicate(payload) {
  const hash = JSON.stringify(payload).length + "_" + (payload.type || "") + "_" + (payload.posts?.length || 0);
  const { captureHashes } = await chrome.storage.local.get("captureHashes");
  const hashes = captureHashes || {};
  const now = Date.now();

  // Clean old hashes (older than 6 hours)
  for (const [k, v] of Object.entries(hashes)) {
    if (now - v > 6 * 60 * 60 * 1000) delete hashes[k];
  }

  if (hashes[hash]) return true;
  hashes[hash] = now;
  await chrome.storage.local.set({ captureHashes: hashes });
  return false;
}

/* ── Badge Updates ── */
const BADGE_MAP = {
  creator_analytics: { text: "A", color: "#3B82F6" },
  audience_analytics: { text: "A", color: "#3B82F6" },
  post_analytics: { text: "P", color: "#22C55E" },
  individual_post: { text: "P", color: "#22C55E" },
  activity_feed: { text: "F", color: "#EAB308" },
  profile_page: { text: "F", color: "#EAB308" },
};

function updateBadge(pageType, tabId) {
  const badge = BADGE_MAP[pageType];
  if (badge && tabId) {
    chrome.action.setBadgeText({ text: badge.text, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badge.color, tabId });
  } else if (tabId) {
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

/* ── Message Handler ── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Content script reports page type
  if (msg.action === "page_detected") {
    updateBadge(msg.pageType, sender.tab?.id);
    return;
  }

  // Popup requests capture
  if (msg.action === "send_to_aura") {
    (async () => {
      try {
        if (await isDuplicate(msg.payload)) {
          sendResponse({ success: true, note: "Already captured recently", total_stored: 0 });
          return;
        }
        const result = await sendToAura(msg.payload);
        await updateStats(msg.payload, result);
        sendResponse(result);
      } catch (e) {
        await addToRetryQueue(msg.payload);
        await incrementError();
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // async
  }

  // Guided capture orchestration
  if (msg.action === "guided_capture") {
    (async () => {
      const results = [];
      const steps = [
        { url: "https://www.linkedin.com/analytics/creator/", label: "Creator Analytics", delay: 4000 },
        { url: "https://www.linkedin.com/analytics/audience/", label: "Audience Analytics", delay: 4000 },
        { url: "https://www.linkedin.com/analytics/content/", label: "Post Analytics", delay: 5000 },
      ];

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        try {
          // Navigate
          await chrome.tabs.update(tab.id, { url: step.url });
          // Wait for page load
          await new Promise(r => setTimeout(r, step.delay));
          // Capture
          const captureResult = await chrome.tabs.sendMessage(tab.id, { action: "capture" });

          if (captureResult?.success && captureResult.payload) {
            const auraResult = await sendToAura(captureResult.payload);
            await updateStats(captureResult.payload, auraResult);
            results.push({
              step: i + 1,
              label: step.label,
              success: true,
              records: auraResult?.total_stored || 0,
              details: auraResult,
            });
          } else {
            results.push({
              step: i + 1,
              label: step.label,
              success: false,
              error: captureResult?.error || "No data extracted",
            });
          }
        } catch (e) {
          results.push({
            step: i + 1,
            label: step.label,
            success: false,
            error: e.message,
          });
        }
      }

      const totalRecords = results.reduce((sum, r) => sum + (r.records || 0), 0);
      const successCount = results.filter(r => r.success).length;
      sendResponse({
        success: successCount > 0,
        steps: results,
        totalRecords,
        summary: `${successCount}/${steps.length} steps completed · ${totalRecords} records captured`,
      });
    })();
    return true; // async
  }
});

/* ── Tab updates: re-detect page type ── */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.includes("linkedin.com")) {
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: "detect_page" }).then(res => {
        if (res?.pageType) updateBadge(res.pageType, tabId);
      }).catch(() => {});
    }, 2000);
  }
});
