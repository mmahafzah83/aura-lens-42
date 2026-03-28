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

  // Guided capture orchestration — profile → activity → individual posts → optional analytics
  if (msg.action === "guided_capture") {
    (async () => {
      const results = [];
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }

      // Resolve profile handle
      const { auraHandle } = await chrome.storage.local.get("auraHandle");
      let handle = msg.handle || auraHandle;

      // Step 1: Open profile page to confirm handle
      const stepProfile = { label: "Profile Page", success: false, records: 0 };
      try {
        if (!handle) {
          // Try to detect from current tab URL
          const currentUrl = tab.url || "";
          const m = currentUrl.match(/linkedin\.com\/in\/([^/]+)/);
          if (m) handle = m[1];
        }

        if (handle) {
          await chrome.tabs.update(tab.id, { url: `https://www.linkedin.com/in/${handle}/` });
          await waitForLoad(tab.id, 4000);
          const profileCapture = await chrome.tabs.sendMessage(tab.id, { action: "capture" });
          if (profileCapture?.success && profileCapture.detectedHandle) {
            handle = profileCapture.detectedHandle;
            await chrome.storage.local.set({ auraHandle: handle });
          }
          stepProfile.success = true;
          stepProfile.records = 0; // profile page itself doesn't produce records
        } else {
          stepProfile.error = "No LinkedIn handle found. Visit your profile first.";
        }
      } catch (e) {
        stepProfile.error = e.message;
      }
      results.push(stepProfile);

      if (!handle) {
        sendResponse({ success: false, error: "Could not determine your LinkedIn profile. Please navigate to your LinkedIn profile first.", steps: results, totalRecords: 0 });
        return;
      }

      // Step 2: Open activity feed, scroll, and collect post URLs
      const stepActivity = { label: "Activity Feed", success: false, records: 0 };
      let postUrls = [];
      try {
        await chrome.tabs.update(tab.id, { url: `https://www.linkedin.com/in/${handle}/recent-activity/all/` });
        await waitForLoad(tab.id, 5000);

        // Scroll 3 times to load more posts
        for (let scroll = 0; scroll < 3; scroll++) {
          await chrome.tabs.sendMessage(tab.id, { action: "scroll_page" });
          await new Promise(r => setTimeout(r, 2000));
        }

        // Collect discovered post URLs
        const collectResult = await chrome.tabs.sendMessage(tab.id, { action: "collect_post_urls" });
        postUrls = collectResult?.urls || [];

        stepActivity.success = true;
        stepActivity.records = postUrls.length;
        stepActivity.detail = `${postUrls.length} post URLs discovered`;
      } catch (e) {
        stepActivity.error = e.message;
      }
      results.push(stepActivity);

      // Step 3: Visit each post and capture content + metrics
      const MAX_POSTS = 15; // cap to avoid long sessions
      const postsToCapture = postUrls.slice(0, MAX_POSTS);
      const stepPosts = { label: "Post Capture", success: false, records: 0 };
      let totalPostRecords = 0;
      let capturedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < postsToCapture.length; i++) {
        try {
          await chrome.tabs.update(tab.id, { url: postsToCapture[i] });
          await waitForLoad(tab.id, 3500);

          const captureResult = await chrome.tabs.sendMessage(tab.id, { action: "capture" });
          if (captureResult?.success && captureResult.payload) {
            const auraResult = await sendToAura(captureResult.payload);
            await updateStats(captureResult.payload, auraResult);
            const stored = auraResult?.total_stored || 0;
            totalPostRecords += stored;
            capturedCount++;
          }
        } catch {
          errorCount++;
        }
      }

      stepPosts.success = capturedCount > 0;
      stepPosts.records = totalPostRecords;
      stepPosts.detail = `${capturedCount}/${postsToCapture.length} posts captured` + (errorCount > 0 ? `, ${errorCount} errors` : "");
      results.push(stepPosts);

      // Step 4 (optional): Creator Analytics for follower snapshot
      const stepAnalytics = { label: "Creator Analytics", success: false, records: 0 };
      try {
        await chrome.tabs.update(tab.id, { url: "https://www.linkedin.com/analytics/creator/" });
        await waitForLoad(tab.id, 4000);
        const analyticsCapture = await chrome.tabs.sendMessage(tab.id, { action: "capture" });
        if (analyticsCapture?.success && analyticsCapture.payload) {
          const auraResult = await sendToAura(analyticsCapture.payload);
          await updateStats(analyticsCapture.payload, auraResult);
          stepAnalytics.success = true;
          stepAnalytics.records = auraResult?.total_stored || 0;
        } else {
          stepAnalytics.error = analyticsCapture?.error || "No analytics data";
        }
      } catch (e) {
        stepAnalytics.error = e.message;
      }
      results.push(stepAnalytics);

      const totalRecords = results.reduce((sum, r) => sum + (r.records || 0), 0);
      const successCount = results.filter(r => r.success).length;
      sendResponse({
        success: successCount > 0,
        steps: results,
        totalRecords,
        summary: `${successCount}/${results.length} steps · ${totalRecords} records · ${capturedCount} posts captured`,
      });
    })();
    return true;
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
