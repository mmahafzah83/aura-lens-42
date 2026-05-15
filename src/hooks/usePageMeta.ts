import { useEffect } from "react";

const SITE_URL = "https://www.aura-intel.org";

interface PageMeta {
  title: string;
  description?: string;
  path?: string; // canonical path, e.g. "/auth"
  ogImage?: string; // absolute URL
  jsonLd?: Record<string, any> | Record<string, any>[];
}

/**
 * Sets per-route SEO tags: <title>, meta description, canonical,
 * og:title/description/url, and optional JSON-LD. Restores previous
 * values on unmount so navigation between routes stays clean.
 */
export function usePageMeta({ title, description, path, ogImage, jsonLd }: PageMeta) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const url = path ? `${SITE_URL}${path}` : SITE_URL;

    const setMeta = (selector: string, attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute("content", prev);
      };
    };

    const restorers: Array<() => void> = [];
    if (description) {
      restorers.push(setMeta('meta[name="description"]', "name", "description", description));
      restorers.push(setMeta('meta[property="og:description"]', "property", "og:description", description));
      restorers.push(setMeta('meta[name="twitter:description"]', "name", "twitter:description", description));
    }
    restorers.push(setMeta('meta[property="og:title"]', "property", "og:title", title));
    restorers.push(setMeta('meta[name="twitter:title"]', "name", "twitter:title", title));
    restorers.push(setMeta('meta[property="og:url"]', "property", "og:url", url));
    if (ogImage) {
      restorers.push(setMeta('meta[property="og:image"]', "property", "og:image", ogImage));
      restorers.push(setMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage));
    }

    // Canonical link
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonical;
    const prevCanonical = canonical?.getAttribute("href") || null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    // JSON-LD
    let ldScript: HTMLScriptElement | null = null;
    if (jsonLd) {
      ldScript = document.createElement("script");
      ldScript.type = "application/ld+json";
      ldScript.setAttribute("data-page-meta", "1");
      ldScript.text = JSON.stringify(jsonLd);
      document.head.appendChild(ldScript);
    }

    return () => {
      document.title = prevTitle;
      restorers.forEach((r) => r());
      if (canonical) {
        if (canonicalCreated) canonical.remove();
        else if (prevCanonical) canonical.setAttribute("href", prevCanonical);
      }
      if (ldScript) ldScript.remove();
    };
  }, [title, description, path, ogImage, JSON.stringify(jsonLd)]);
}

export default usePageMeta;