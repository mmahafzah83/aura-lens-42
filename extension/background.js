// Aura LinkedIn Capture - Background Service Worker
// Handles token refresh and periodic capture reminders

chrome.alarms.create("tokenRefresh", { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tokenRefresh") {
    await refreshToken();
  }
});

async function refreshToken() {
  const { auraRefreshToken } = await chrome.storage.local.get("auraRefreshToken");
  if (!auraRefreshToken) return;

  try {
    const SUPABASE_URL = "https://zddlsztxfzvevzjbuocc.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZGxzenR4Znp2ZXZ6amJ1b2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzEwNDEsImV4cCI6MjA4OTU0NzA0MX0.0fovNZRqM3LNAmVgefq6Ph6TJ3FnLrQVun2zzrLSFPI";

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
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
