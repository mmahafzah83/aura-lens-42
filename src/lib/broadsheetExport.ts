// Shared SVG→raster export helpers for Broadsheet-family surfaces
// (Carousel Studio, Edition Studio, one-pagers). Fonts are inlined as
// base64 so the offscreen Image() sandbox resolves them without a network
// hop mid-raster.

export const FONT_IMPORT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,600&family=IBM+Plex+Mono:wght@400;500;600&display=block');`;

const FONT_EMBED_CACHE = new Map<string, string>();
const FONT_EMBED_PROMISES = new Map<string, Promise<string>>();

export async function getEmbeddedFontCSS(families: string[]): Promise<string> {
  const key = families.join("|");
  const cached = FONT_EMBED_CACHE.get(key);
  if (cached !== undefined) return cached;
  const pending = FONT_EMBED_PROMISES.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const url =
        "https://fonts.googleapis.com/css2?" +
        families.map((f) => `family=${f}`).join("&") +
        "&display=block";
      const cssRes = await fetch(url);
      const cssText = await cssRes.text();
      const blocks = cssText.split("@font-face").slice(1);
      const out: string[] = [];
      for (const blk of blocks) {
        const famMatch = blk.match(/font-family:\s*['"]([^'"]+)['"]/);
        const wMatch = blk.match(/font-weight:\s*([\d\s]+)/);
        const sMatch = blk.match(/font-style:\s*(\w+)/);
        const uMatch = blk.match(/url\((https:\/\/[^)]+)\)/);
        const fMatch = blk.match(/format\(['"]?([^'")]+)/);
        if (!famMatch || !wMatch || !uMatch) continue;
        const fam = famMatch[1];
        const w = wMatch[1].trim().split(/\s+/)[0];
        const style = sMatch ? sMatch[1] : "normal";
        const srcUrl = uMatch[1];
        const fmt = fMatch ? fMatch[1] : (srcUrl.endsWith(".woff2") ? "woff2" : "truetype");
        const mime = fmt === "woff2" ? "font/woff2" : "font/ttf";
        const fr = await fetch(srcUrl);
        const buf = await fr.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        out.push(
          `@font-face{font-family:'${fam}';font-style:${style};font-weight:${w};font-display:block;src:url(data:${mime};base64,${b64}) format('${fmt}');}`
        );
      }
      const css = out.join("\n");
      FONT_EMBED_CACHE.set(key, css);
      return css;
    } catch (e) {
      console.warn("Font embed failed, falling back to @import", e);
      FONT_EMBED_CACHE.set(key, "");
      return "";
    }
  })();
  FONT_EMBED_PROMISES.set(key, promise);
  return promise;
}

/** Rasterise an SVG to a blob. Use JPEG with quality<1 for PDF embedding to
 *  keep file size well below LinkedIn's 10MB carousel limit. */
export function svgToImageBlob(
  svgEl: SVGSVGElement,
  width: number,
  height: number,
  extraCSS = "",
  mime: "image/png" | "image/jpeg" = "image/png",
  quality = 1,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.setAttribute("type", "text/css");
    styleEl.textContent = (extraCSS ? extraCSS + "\n" : "") + FONT_IMPORT_CSS;
    clone.insertBefore(styleEl, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      setTimeout(() => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        if (mime === "image/jpeg") {
          ctx.fillStyle = "#0F0E0C";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
          mime,
          mime === "image/jpeg" ? quality : undefined,
        );
      }, 500);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export async function ensureFontsReady(lang: "en" | "ar") {
  try {
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
    const families = lang === "ar"
      ? ["16px Cairo", "700 16px Cairo", "800 16px Cairo"]
      : ["16px 'DM Sans'", "16px 'Cormorant Garamond'", "16px 'JetBrains Mono'", "16px Newsreader", "16px 'IBM Plex Mono'"];
    const checks = families.map((f) => {
      try { return (document as any).fonts?.check?.(f); } catch { return true; }
    });
    if (checks.some((c) => !c)) {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;";
      probe.innerHTML = lang === "ar"
        ? `<span style="font-family:'Cairo';font-weight:400">تحميل</span>
           <span style="font-family:'Cairo';font-weight:700">تحميل</span>
           <span style="font-family:'Cairo';font-weight:800">تحميل</span>`
        : `<span style="font-family:'DM Sans'">Aa</span>
           <span style="font-family:'Cormorant Garamond'">Aa</span>
           <span style="font-family:'JetBrains Mono'">Aa</span>
           <span style="font-family:'Newsreader'">Aa</span>
           <span style="font-family:'IBM Plex Mono'">Aa</span>`;
      document.body.appendChild(probe);
      try { await (document as any).fonts?.ready; } catch {}
      document.body.removeChild(probe);
    }
    await new Promise((r) => setTimeout(r, 200));
  } catch {}
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(s: string): string {
  return (s || "asset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}