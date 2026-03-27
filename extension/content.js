// Aura LinkedIn Capture - Content Script
// Extracts analytics data from LinkedIn pages

(function () {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action !== "capture") return;

    try {
      const url = window.location.href;
      const payload = { type: "full_sync" };

      // Detect page type
      if (url.includes("/analytics/") || url.includes("/dashboard/")) {
        // Analytics dashboard page
        const result = captureAnalyticsDashboard();
        Object.assign(payload, result);
      } else if (url.match(/\/posts\/[^/]+/)) {
        // Single post page
        const result = captureSinglePost(url);
        if (result) {
          payload.type = "posts";
          payload.posts = [result];
        }
      } else if (url.includes("/in/") && url.includes("/recent-activity")) {
        // Activity feed
        const result = captureActivityFeed();
        payload.type = "posts";
        payload.posts = result;
      } else if (url.includes("/feed/")) {
        // Main feed — look for own posts
        const result = captureOwnPostsFromFeed();
        if (result.length > 0) {
          payload.type = "posts";
          payload.posts = result;
        }
      }

      const hasData =
        payload.follower_snapshot ||
        (payload.posts && payload.posts.length > 0) ||
        (payload.post_metrics && payload.post_metrics.length > 0);

      if (!hasData) {
        sendResponse({ success: false, error: "No analytics data found on this page. Try your LinkedIn analytics dashboard or a post page." });
        return;
      }

      sendResponse({ success: true, payload });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  });

  function captureAnalyticsDashboard() {
    const result = {};

    // Try to extract follower count and engagement metrics
    const metricElements = document.querySelectorAll('[data-test-id], .analytics-card, .artdeco-card');
    const allText = document.body.innerText;

    const followerMatch = allText.match(/(\d[\d,]+)\s*(?:followers?|connections?)/i);
    const impressionMatch = allText.match(/(\d[\d,]+)\s*(?:impressions?|views?)/i);
    const reactionsMatch = allText.match(/(\d[\d,]+)\s*(?:reactions?|likes?)/i);

    if (followerMatch) {
      result.follower_snapshot = {
        followers: parseInt(followerMatch[1].replace(/,/g, "")),
        impressions: impressionMatch ? parseInt(impressionMatch[1].replace(/,/g, "")) : 0,
        reactions: reactionsMatch ? parseInt(reactionsMatch[1].replace(/,/g, "")) : 0,
        comments: 0,
        shares: 0,
        saves: 0,
        post_count: 0,
        engagement_rate: 0,
      };
    }

    return result;
  }

  function captureSinglePost(url) {
    const postText = extractPostText();
    if (!postText || postText.length < 20) return null;

    const normalizedUrl = normalizeLinkedInUrl(url);
    return {
      post_url: normalizedUrl,
      post_text: postText.slice(0, 5000),
      title: null,
      hook: postText.split("\n")[0]?.trim().slice(0, 200) || null,
      published_at: extractPublishedDate(),
      media_type: detectMediaType(),
      like_count: extractMetric(/(\d[\d,]*)\s*(?:likes?|reactions?)/i),
      comment_count: extractMetric(/(\d[\d,]*)\s*(?:comments?)/i),
      repost_count: extractMetric(/(\d[\d,]*)\s*(?:reposts?|shares?)/i),
      engagement_score: 0,
    };
  }

  function captureActivityFeed() {
    const posts = [];
    const postElements = document.querySelectorAll('.feed-shared-update-v2, .occludable-update, [data-urn]');

    for (const el of postElements) {
      const linkEl = el.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
      if (!linkEl) continue;

      const url = normalizeLinkedInUrl(linkEl.href);
      const textEl = el.querySelector('.feed-shared-text, .break-words, .update-components-text');
      const text = textEl?.innerText?.trim() || "";

      if (text.length < 20) continue;

      posts.push({
        post_url: url,
        post_text: text.slice(0, 5000),
        hook: text.split("\n")[0]?.trim().slice(0, 200) || null,
        published_at: null,
        media_type: "text",
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
        engagement_score: 0,
      });
    }

    return posts;
  }

  function captureOwnPostsFromFeed() {
    // Look for posts by the logged-in user in the main feed
    return captureActivityFeed();
  }

  function extractPostText() {
    const selectors = [
      '.feed-shared-text',
      '.break-words',
      '.update-components-text',
      '[data-test-id="main-feed-activity-content"]',
      'article .feed-shared-update-v2__description',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim().length > 20) return el.innerText.trim();
    }
    return null;
  }

  function extractPublishedDate() {
    const timeEl = document.querySelector('time, .update-components-actor__sub-description');
    if (timeEl?.dateTime) return timeEl.dateTime;
    const text = timeEl?.innerText || "";
    const relMatch = text.match(/(\d+)\s*(day|week|month|hour|minute)s?\s*ago/i);
    if (!relMatch) return null;
    const num = parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const d = new Date();
    if (unit === "minute") d.setMinutes(d.getMinutes() - num);
    else if (unit === "hour") d.setHours(d.getHours() - num);
    else if (unit === "day") d.setDate(d.getDate() - num);
    else if (unit === "week") d.setDate(d.getDate() - num * 7);
    else if (unit === "month") d.setMonth(d.getMonth() - num);
    return d.toISOString();
  }

  function detectMediaType() {
    if (document.querySelector('.feed-shared-carousel, .carousel')) return "carousel";
    if (document.querySelector('video, .feed-shared-linkedin-video')) return "video";
    if (document.querySelector('.feed-shared-image, img.feed-shared-image__image')) return "image";
    if (document.querySelector('.feed-shared-document')) return "document";
    return "text";
  }

  function extractMetric(pattern) {
    const text = document.body.innerText;
    const m = text.match(pattern);
    return m ? parseInt(m[1].replace(/,/g, "")) : 0;
  }

  function normalizeLinkedInUrl(url) {
    let n = url.replace(/https?:\/\/[a-z]{2,3}\.linkedin\.com/i, "https://www.linkedin.com");
    n = n.replace(/https?:\/\/linkedin\.com/i, "https://www.linkedin.com");
    return n.split("?")[0].replace(/\/+$/, "");
  }
})();
