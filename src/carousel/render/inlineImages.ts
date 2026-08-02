/**
 * Inline every remote image inside a mounted slide BEFORE capture.
 *
 * Same lesson as the font-metrics race in P2: anything resolved by the
 * network at capture time makes the export non-deterministic. html2canvas
 * also cannot reliably rasterise cross-origin bitmaps — it silently paints a
 * hole. So each `<img src="http…">` and each `background-image: url(http…)`
 * is fetched once, converted to base64, and written back ONTO THE LIVE NODE.
 *
 * This mutates the same DOM the member is looking at; it never clones. A
 * data: URL renders identically to the URL it replaced, so the preview is
 * unchanged apart from being self-contained.
 *
 * A failure throws. We never export a deck with a missing portrait.
 */

const cache = new Map<string, string>();

function isInline(url: string) {
  return url.startsWith("data:");
}

async function toDataUrl(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`image fetch failed (${res.status}) for ${url}`);
  const blob = await res.blob();
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("FileReader failed"));
    r.readAsDataURL(blob);
  });
  if (!isInline(data)) throw new Error(`image did not encode for ${url}`);
  cache.set(url, data);
  return data;
}

const URL_RE = /url\((['"]?)([^'")]+)\1\)/;

/** Resolves every remote image in `root` to a data URL, in place. */
export async function inlineImages(root: HTMLElement): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (!src || isInline(src)) continue;
    tasks.push(
      toDataUrl(src).then((data) => {
        img.setAttribute("src", data);
      }),
    );
  }

  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of all) {
    const bg = el.style.backgroundImage;
    if (!bg || bg === "none") continue;
    const m = URL_RE.exec(bg);
    if (!m || isInline(m[2])) continue;
    const original = m[2];
    tasks.push(
      toDataUrl(original).then((data) => {
        el.style.backgroundImage = bg.replace(URL_RE, `url("${data}")`);
      }),
    );
  }

  // One rejection aborts the whole export — a hole is worse than a failure.
  await Promise.all(tasks);

  // Decoded, not merely assigned: html2canvas reads intrinsic size.
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((img) =>
      img.decode ? img.decode().catch(() => undefined) : Promise.resolve(),
    ),
  );
}
