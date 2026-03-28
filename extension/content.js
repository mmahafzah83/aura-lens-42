// Aura LinkedIn Capture v2 — Content Script
// Detects LinkedIn page types and extracts analytics data from the DOM.

(function () {
  "use strict";

  /* ═══════════════════════════════════════════
     PAGE TYPE DETECTION
     ═══════════════════════════════════════════ */

  const PAGE_TYPES = {
    CREATOR_ANALYTICS: "creator_analytics",
    AUDIENCE_ANALYTICS: "audience_analytics",
    POST_ANALYTICS: "post_analytics",
    INDIVIDUAL_POST: "individual_post",
    ACTIVITY_FEED: "activity_feed",
    PROFILE_PAGE: "profile_page",
    UNKNOWN: "unknown",
  };

  function detectPageType(url) {
    const u = url || window.location.href;
    if (/\/analytics\/creator/i.test(u) || /\/analytics\/?$/i.test(u) || /\/dashboard\/(?:creator|analytics)/i.test(u))
      return PAGE_TYPES.CREATOR_ANALYTICS;
    if (/\/analytics\/audience/i.test(u))
      return PAGE_TYPES.AUDIENCE_ANALYTICS;
    if (/\/analytics\/(?:content|post)/i.test(u))
      return PAGE_TYPES.POST_ANALYTICS;
    if (/\/(?:posts|feed\/update\/urn)/i.test(u))
      return PAGE_TYPES.INDIVIDUAL_POST;
    if (/\/in\/[^/]+\/recent-activity/i.test(u) || /\/in\/[^/]+\/detail\/recent-activity/i.test(u))
      return PAGE_TYPES.ACTIVITY_FEED;
    if (/\/in\/[^/]+\/?$/i.test(u))
      return PAGE_TYPES.PROFILE_PAGE;
    return PAGE_TYPES.UNKNOWN;
  }

  /* ═══════════════════════════════════════════
     SHARED HELPERS
     ═══════════════════════════════════════════ */

  function parseNumber(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[^0-9.KkMm]/g, "");
    if (/[Kk]$/.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000);
    if (/[Mm]$/.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000000);
    return parseInt(cleaned.replace(/\./g, ""), 10) || 0;
  }

  function extractNumberByPattern(pattern) {
    const text = document.body.innerText;
    const m = text.match(pattern);
    return m ? parseNumber(m[1]) : 0;
  }

  function normalizeUrl(url) {
    let n = url.replace(/https?:\/\/[a-z]{2,3}\.linkedin\.com/i, "https://www.linkedin.com");
    n = n.replace(/https?:\/\/linkedin\.com/i, "https://www.linkedin.com");
    return n.split("?")[0].replace(/\/+$/, "");
  }

  function extractTextBySelectors(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim().length > 10) return el.innerText.trim();
    }
    return null;
  }

  function extractPublishedDate() {
    const timeEl = document.querySelector("time[datetime], .update-components-actor__sub-description time");
    if (timeEl?.getAttribute("datetime")) return timeEl.getAttribute("datetime");
    const text = (timeEl || document.querySelector(".update-components-actor__sub-description"))?.innerText || "";
    const relMatch = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i);
    if (!relMatch) return null;
    const num = parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const d = new Date();
    const offsets = { minute: () => d.setMinutes(d.getMinutes() - num), hour: () => d.setHours(d.getHours() - num), day: () => d.setDate(d.getDate() - num), week: () => d.setDate(d.getDate() - num * 7), month: () => d.setMonth(d.getMonth() - num), year: () => d.setFullYear(d.getFullYear() - num) };
    (offsets[unit] || (() => {}))();
    return d.toISOString();
  }

  function detectMediaType() {
    if (document.querySelector(".feed-shared-carousel, .carousel, [data-carousel]")) return "carousel";
    if (document.querySelector("video, .feed-shared-linkedin-video, .video-js")) return "video";
    if (document.querySelector(".feed-shared-document, .document-s-container")) return "document";
    if (document.querySelector(".feed-shared-image, img.feed-shared-image__image")) return "image";
    return "text";
  }

  /* ═══════════════════════════════════════════
     EXTRACTOR: CREATOR ANALYTICS
     ═══════════════════════════════════════════ */

  function extractCreatorAnalytics() {
    const text = document.body.innerText;
    const followers = extractNumberByPattern(/(\d[\d,. KkMm]*)\s*(?:total\s+)?followers?/i);
    const impressions = extractNumberByPattern(/(\d[\d,. KkMm]*)\s*(?:total\s+)?impressions?/i);
    const reactions = extractNumberByPattern(/(\d[\d,. KkMm]*)\s*(?:total\s+)?reactions?/i);
    const comments = extractNumberByPattern(/(\d[\d,. KkMm]*)\s*(?:total\s+)?comments?(?!\s*ago)/i);
    const engMatch = text.match(/([\d.]+)%\s*(?:engagement|eng\.?\s*rate)/i);
    const engRate = engMatch ? parseFloat(engMatch[1]) : 0;
    const growthMatch = text.match(/([+-]?\d[\d,]*)\s*(?:new\s+)?followers?\s*(?:in|this)/i);
    const growth = growthMatch ? parseInt(growthMatch[1].replace(/,/g, "")) : 0;

    if (followers === 0 && impressions === 0) return null;

    return {
      type: "follower_snapshot",
      follower_snapshot: {
        followers,
        follower_growth: growth,
        impressions,
        reactions,
        comments,
        shares: 0,
        saves: 0,
        post_count: 0,
        engagement_rate: engRate,
      },
    };
  }

  /* ═══════════════════════════════════════════
     EXTRACTOR: AUDIENCE ANALYTICS
     ═══════════════════════════════════════════ */

  function extractAudienceAnalytics() {
    const sections = document.querySelectorAll("section, .artdeco-card, [class*='analytics']");
    const breakdown = {};

    for (const section of sections) {
      const heading = section.querySelector("h2, h3, .t-bold")?.innerText?.trim()?.toLowerCase() || "";
      const category = ["industr", "function", "seniority", "company size", "location", "geograph"].find(k => heading.includes(k));
      if (!category) continue;

      const key = category.startsWith("industr") ? "industries" :
                  category.startsWith("function") ? "functions" :
                  category.startsWith("seniority") ? "seniority" :
                  category.startsWith("company") ? "company_size" :
                  "locations";

      const items = [];
      const rows = section.querySelectorAll("li, tr, [class*='bar'], [class*='row']");
      for (const row of rows) {
        const label = (row.querySelector("[class*='label'], td:first-child, .t-normal") || row)?.innerText?.trim();
        const valueEl = row.querySelector("[class*='value'], [class*='percentage'], td:last-child, .t-bold");
        const value = valueEl?.innerText?.trim();
        if (label && value && label.length < 80) {
          const pctMatch = value.match(/([\d.]+)%/);
          items.push({ label: label.split("\n")[0].trim(), percentage: pctMatch ? parseFloat(pctMatch[1]) : 0 });
        }
      }
      if (items.length > 0) breakdown[key] = items.slice(0, 15);
    }

    if (Object.keys(breakdown).length === 0) return null;

    return {
      type: "follower_snapshot",
      follower_snapshot: {
        followers: 0, // signals audience-only update
        follower_growth: 0,
        impressions: 0,
        reactions: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        post_count: 0,
        engagement_rate: 0,
      },
      audience_breakdown: breakdown,
    };
  }

  /* ═══════════════════════════════════════════
     EXTRACTOR: POST ANALYTICS (TABLE)
     ═══════════════════════════════════════════ */

  function extractPostAnalytics() {
    const posts = [];
    const metrics = [];

    // Try table rows
    const rows = document.querySelectorAll("table tbody tr, [class*='content-analytics'] li, [class*='post-list'] > div");

    for (const row of rows) {
      const linkEl = row.querySelector("a[href*='/posts/'], a[href*='/feed/update/']");
      if (!linkEl) continue;
      const postUrl = normalizeUrl(linkEl.href);
      const cells = row.querySelectorAll("td, [class*='metric'], [class*='stat'], span.t-bold");
      const nums = [];
      for (const cell of cells) {
        const n = parseNumber(cell.innerText);
        if (n > 0 || cell.innerText.trim() === "0") nums.push(n);
      }

      const textEl = row.querySelector("[class*='text'], [class*='title'], .t-normal");
      const text = textEl?.innerText?.trim()?.slice(0, 200) || "";

      posts.push({
        post_url: postUrl,
        post_text: text.length > 20 ? text.slice(0, 5000) : null,
        title: null,
        hook: text.split("\n")[0]?.trim()?.slice(0, 200) || null,
        published_at: null,
        media_type: "text",
        like_count: nums[0] || 0,
        comment_count: nums[1] || 0,
        repost_count: nums[2] || 0,
        engagement_score: 0,
      });

      metrics.push({
        post_url: postUrl,
        impressions: nums[3] || nums[0] || 0,
        reactions: nums[0] || 0,
        comments: nums[1] || 0,
        shares: nums[2] || 0,
        saves: 0,
        engagement_rate: 0,
      });
    }

    // Fallback: scan visible post cards
    if (posts.length === 0) {
      const cards = document.querySelectorAll("[class*='feed-shared-update'], [class*='occludable-update']");
      for (const card of cards) {
        const linkEl = card.querySelector("a[href*='/posts/'], a[href*='/feed/update/']");
        if (!linkEl) continue;
        const postUrl = normalizeUrl(linkEl.href);
        const textEl = card.querySelector(".feed-shared-text, .break-words, .update-components-text");
        const text = textEl?.innerText?.trim() || "";
        if (text.length < 20) continue;

        posts.push({
          post_url: postUrl,
          post_text: text.slice(0, 5000),
          title: null,
          hook: text.split("\n")[0]?.trim()?.slice(0, 200) || null,
          published_at: null,
          media_type: "text",
          like_count: 0,
          comment_count: 0,
          repost_count: 0,
          engagement_score: 0,
        });
      }
    }

    if (posts.length === 0) return null;

    const result = { type: "full_sync", posts };
    if (metrics.length > 0 && metrics.some(m => m.impressions > 0 || m.reactions > 0)) {
      result.post_metrics = metrics;
    }
    return result;
  }

  /* ═══════════════════════════════════════════
     EXTRACTOR: INDIVIDUAL POST
     ═══════════════════════════════════════════ */

  function extractIndividualPost() {
    const url = normalizeUrl(window.location.href);
    const postText = extractTextBySelectors([
      ".feed-shared-update-v2 .feed-shared-text",
      ".feed-shared-text",
      ".break-words",
      ".update-components-text",
      "[data-test-id='main-feed-activity-content']",
      "article .update-components-text",
    ]);

    if (!postText || postText.length < 20) return null;

    const post = {
      post_url: url,
      post_text: postText.slice(0, 5000),
      title: null,
      hook: postText.split("\n")[0]?.trim()?.slice(0, 200) || null,
      published_at: extractPublishedDate(),
      media_type: detectMediaType(),
      like_count: extractNumberByPattern(/(\d[\d,. KkMm]*)\s*(?:reactions?|likes?)/i),
      comment_count: extractNumberByPattern(/(\d[\d,. KkMm]*)\s*comments?(?!\s*ago)/i),
      repost_count: extractNumberByPattern(/(\d[\d,. KkMm]*)\s*(?:reposts?|shares?)/i),
      engagement_score: 0,
    };

    const result = { type: "posts", posts: [post] };

    // Check for private analytics (author view)
    const impressions = extractNumberByPattern(/(\d[\d,. KkMm]*)\s*impressions?/i);
    if (impressions > 0) {
      result.type = "full_sync";
      result.post_metrics = [{
        post_url: url,
        impressions,
        reactions: post.like_count,
        comments: post.comment_count,
        shares: post.repost_count,
        saves: extractNumberByPattern(/(\d[\d,. KkMm]*)\s*saves?/i),
        engagement_rate: 0,
      }];
    }

    return result;
  }

  /* ═══════════════════════════════════════════
     EXTRACTOR: ACTIVITY FEED
     ═══════════════════════════════════════════ */

  function extractActivityFeed() {
    const posts = [];
    const postElements = document.querySelectorAll(
      ".feed-shared-update-v2, .occludable-update, [data-urn], [class*='profile-creator-shared-feed'] li"
    );

    for (const el of postElements) {
      const linkEl = el.querySelector("a[href*='/posts/'], a[href*='/feed/update/']");
      if (!linkEl) continue;

      const url = normalizeUrl(linkEl.href);
      const textEl = el.querySelector(".feed-shared-text, .break-words, .update-components-text");
      const text = textEl?.innerText?.trim() || "";
      if (text.length < 20) continue;

      posts.push({
        post_url: url,
        post_text: text.slice(0, 5000),
        title: null,
        hook: text.split("\n")[0]?.trim()?.slice(0, 200) || null,
        published_at: null,
        media_type: "text",
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
        engagement_score: 0,
      });
    }

    if (posts.length === 0) return null;
    return { type: "posts", posts };
  }

  /* ═══════════════════════════════════════════
     MESSAGE HANDLER
     ═══════════════════════════════════════════ */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "detect_page") {
      sendResponse({ pageType: detectPageType(), url: window.location.href });
      return true;
    }

    // Collect post URLs from activity feed or profile page
    if (msg.action === "collect_post_urls") {
      try {
        const urls = [];
        const seen = new Set();
        const links = document.querySelectorAll(
          "a[href*='/posts/'], a[href*='/feed/update/urn']"
        );
        for (const link of links) {
          const href = normalizeUrl(link.href);
          if (!seen.has(href) && href.includes("linkedin.com")) {
            seen.add(href);
            urls.push(href);
          }
        }
        sendResponse({ success: true, urls });
      } catch (e) {
        sendResponse({ success: false, error: e.message, urls: [] });
      }
      return true;
    }

    // Scroll to load more content
    if (msg.action === "scroll_page") {
      try {
        window.scrollBy(0, window.innerHeight * 2);
        sendResponse({ success: true, scrollY: window.scrollY, docHeight: document.body.scrollHeight });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }

    if (msg.action === "capture") {
      try {
        const pageType = detectPageType();
        let result = null;

        switch (pageType) {
          case PAGE_TYPES.CREATOR_ANALYTICS:
            result = extractCreatorAnalytics();
            break;
          case PAGE_TYPES.AUDIENCE_ANALYTICS:
            result = extractAudienceAnalytics();
            break;
          case PAGE_TYPES.POST_ANALYTICS:
            result = extractPostAnalytics();
            break;
          case PAGE_TYPES.INDIVIDUAL_POST:
            result = extractIndividualPost();
            break;
          case PAGE_TYPES.ACTIVITY_FEED:
            result = extractActivityFeed();
            break;
          case PAGE_TYPES.PROFILE_PAGE:
            result = extractActivityFeed(); // profile pages can have visible posts
            break;
          default:
            sendResponse({ success: false, error: "Not a capturable LinkedIn page. Navigate to your analytics dashboard, a post page, or your activity feed.", pageType });
            return true;
        }

        if (!result) {
          sendResponse({ success: false, error: "No analytics data found on this page. The page may still be loading — try again in a few seconds.", pageType });
          return true;
        }

        // Detect user handle and profile URL
        let detectedHandle = null;
        let authorUrl = null;
        if (result.posts) {
          for (const p of result.posts) {
            const m = p.post_url?.match(/\/posts\/([^_]+)_/);
            if (m) { detectedHandle = m[1]; break; }
          }
        }
        // Try to extract author profile URL from page
        const profileLink = document.querySelector("a[href*='/in/'][class*='app-aware-link']") ||
          document.querySelector(".feed-shared-actor__container-link[href*='/in/']") ||
          document.querySelector("a[href*='/in/'].update-components-actor__container-link");
        if (profileLink) {
          authorUrl = normalizeUrl(profileLink.href);
        } else if (detectedHandle) {
          authorUrl = `https://www.linkedin.com/in/${detectedHandle}`;
        }

        // Attach author_url to the payload for user association
        result._author_url = authorUrl;

        sendResponse({
          success: true,
          payload: result,
          pageType,
          detectedHandle,
          authorUrl,
          extractedAt: new Date().toISOString(),
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message, pageType: "error" });
      }
      return true;
    }
  });

  /* ═══════════════════════════════════════════
     AUTO-DETECT: notify background of page type
     ═══════════════════════════════════════════ */

  function notifyPageType() {
    const pageType = detectPageType();
    if (pageType !== PAGE_TYPES.UNKNOWN) {
      chrome.runtime.sendMessage({ action: "page_detected", pageType, url: window.location.href }).catch(() => {});
    }
  }

  // Notify on load and on SPA navigation
  notifyPageType();
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(notifyPageType, 1500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
