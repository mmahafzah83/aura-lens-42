// Convert any image URL (blob:, https:, data:) into a base64 data URL.
// Required because svgToImageBlob rasterises the SVG through the browser's
// image pipeline, which cannot resolve blob: object URLs embedded inside a
// serialised SVG document. https: URLs also fail if the host doesn't allow
// anonymous CORS-tainted canvas reads, so we always inline to data:.
export async function photoUrlToDataUrl(
  url: string | undefined,
): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}