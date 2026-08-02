/**
 * Client-side photo preparation.
 *
 * Every path here re-draws the picture onto a canvas before it is uploaded,
 * which is what strips EXIF (including GPS coordinates from site photos).
 * Nothing is sent anywhere to do this — background removal runs in the
 * member's own browser through WASM.
 */

export const MB = 1024 * 1024;

export interface ImageLimits {
  maxBytes: number;
  minWidth: number;
  minHeight: number;
}

export const AVATAR_LIMITS: ImageLimits = { maxBytes: 5 * MB, minWidth: 400, minHeight: 400 };
export const SLIDE_MEDIA_LIMITS: ImageLimits = { maxBytes: 10 * MB, minWidth: 1400, minHeight: 900 };

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function mb(bytes: number): string {
  return `${Math.round((bytes / MB) * 10) / 10}MB`;
}

async function decode(file: File): Promise<ImageBitmap> {
  // `from-image` honours the EXIF orientation flag so the picture is upright
  // once the tag itself is dropped by the canvas re-encode.
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    return await createImageBitmap(file);
  }
}

/** Returns a plain-language problem, or null when the picture is usable. */
export async function checkImage(file: File, limits: ImageLimits): Promise<string | null> {
  if (!ALLOWED.includes(file.type)) {
    return "That file type isn't supported. Please use a JPG, PNG, or WebP picture.";
  }
  if (file.size > limits.maxBytes) {
    return `That picture is ${mb(file.size)}. Please use one under ${mb(limits.maxBytes)}.`;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return "We couldn't open that picture. Please try a different one.";
  }
  const { width, height } = bitmap;
  bitmap.close?.();
  if (width < limits.minWidth || height < limits.minHeight) {
    return `That picture is ${width}×${height}. Please use one at least ${limits.minWidth}×${limits.minHeight} so it stays sharp.`;
  }
  return null;
}

/** Centre-cropped square JPEG. EXIF is gone because the canvas re-encodes. */
export async function toSquareJpeg(file: File, size = 640): Promise<Blob> {
  const bitmap = await decode(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9);
  });
}

/** Re-encode any picture to strip metadata while keeping its dimensions. */
export async function stripMetadata(file: File, mime = "image/jpeg"): Promise<Blob> {
  const bitmap = await decode(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), mime, 0.92);
  });
}

/** True when enough of the picture is actually see-through to be a cut-out. */
async function hasMeaningfulTransparency(blob: Blob): Promise<boolean> {
  const bitmap = await createImageBitmap(blob);
  const w = 96;
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, w, h);
  let clear = 0;
  let solid = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) clear++;
    else if (data[i] > 240) solid++;
  }
  const total = data.length / 4;
  return clear / total > 0.05 && solid / total > 0.15;
}

/**
 * Background-removed PNG, or null when it isn't worth offering.
 * Never throws: a failure here is silent by design.
 */
export async function cutOutBackground(file: File, timeoutMs = 45000): Promise<Blob | null> {
  try {
    const work = (async () => {
      const { removeBackground } = await import("@imgly/background-removal");
      const out = await removeBackground(file, { output: { format: "image/png" } });
      return (await hasMeaningfulTransparency(out)) ? out : null;
    })();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
