// Aura LinkedIn Capture - Popup Script

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZGxzenR4Znp2ZXZ6amJ1b2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzEwNDEsImV4cCI6MjA4OTU0NzA0MX0.0fovNZRqM3LNAmVgefq6Ph6TJ3FnLrQVun2zzrLSFPI";
const SUPABASE_URL = "https://zddlsztxfzvevzjbuocc.supabase.co";

async function loadState() {
  const { auraToken, auraStats } = await chrome.storage.local.get(["auraToken", "auraStats"]);
  const stats = auraStats || { lastCapture: null, recordsSent: 0, errors: 0 };

  if (auraToken) {
    document.getElementById("setup").style.display = "none";
    document.getElementById("connected").style.display = "block";
    document.getElementById("lastCapture").textContent = stats.lastCapture
      ? new Date(stats.lastCapture).toLocaleString()
      : "—";
    document.getElementById("recordsSent").textContent = stats.recordsSent;
    document.getElementById("errorCount").textContent = stats.errors;
    document.getElementById("errorCount").className =
      "status-value" + (stats.errors > 0 ? " warn" : "");
  } else {
    document.getElementById("setup").style.display = "block";
    document.getElementById("connected").style.display = "none";
  }
}

document.getElementById("connectBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msgEl = document.getElementById("setupMsg");

  if (!email || !password) {
    msgEl.innerHTML = '<div class="msg error">Enter email and password</div>';
    return;
  }

  document.getElementById("connectBtn").disabled = true;
  document.getElementById("connectBtn").textContent = "Connecting…";

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
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
      auraStats: { lastCapture: null, recordsSent: 0, errors: 0 },
    });
    loadState();
  } catch (e) {
    msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
  } finally {
    document.getElementById("connectBtn").disabled = false;
    document.getElementById("connectBtn").textContent = "Connect";
  }
});

document.getElementById("disconnectBtn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["auraToken", "auraRefreshToken", "auraStats"]);
  loadState();
});

document.getElementById("captureBtn").addEventListener("click", async () => {
  const btn = document.getElementById("captureBtn");
  const msgEl = document.getElementById("captureMsg");
  btn.disabled = true;
  btn.textContent = "Capturing…";
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

    // Send to Aura
    const { auraToken } = await chrome.storage.local.get("auraToken");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/browser-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auraToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(response.payload),
    });

    const result = await res.json();
    if (!res.ok || result.error) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    const { auraStats } = await chrome.storage.local.get("auraStats");
    const stats = auraStats || { lastCapture: null, recordsSent: 0, errors: 0 };
    stats.lastCapture = new Date().toISOString();
    stats.recordsSent += result.total_stored || 0;
    await chrome.storage.local.set({ auraStats: stats });

    msgEl.innerHTML = `<div class="msg success">Captured ${result.total_stored || 0} records</div>`;
    loadState();
  } catch (e) {
    const { auraStats } = await chrome.storage.local.get("auraStats");
    const stats = auraStats || { lastCapture: null, recordsSent: 0, errors: 0 };
    stats.errors++;
    await chrome.storage.local.set({ auraStats: stats });
    msgEl.innerHTML = `<div class="msg error">${e.message}</div>`;
    loadState();
  } finally {
    btn.disabled = false;
    btn.textContent = "Capture Current Page";
  }
});

loadState();
