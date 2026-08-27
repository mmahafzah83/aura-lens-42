/**
 * avatarStore — a face we own.
 *
 * LinkedIn's photo URLs are signed and expire. Persisting one means the member's
 * face quietly dies a few weeks later. So we fetch the bytes once, at write
 * time, and keep them in our own public `avatars` bucket. What lands in
 * diagnostic_profiles.avatar_url is always a URL we control.
 *
 * Never throws: if the fetch or the upload fails, the caller gets null and
 * leaves avatar_url alone, which falls back cleanly to initials.
 */

const BUCKET = "avatars";
const MAX_BYTES = 5 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** True when this is a URL we already own — nothing to re-store. */
export function isStoredAvatar(url: unknown): boolean {
  const s = String(url ?? "");
  return s.includes(`/storage/v1/object/public/${BUCKET}/`);
}

/**
 * Fetch a remote avatar and put it in our own bucket.
 * Returns the stable public URL, or null when anything at all goes wrong.
 */
export async function storeAvatar(
  admin: any,
  userId: string,
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  const src = String(remoteUrl ?? "").trim();
  if (!src || !/^https?:\/\//i.test(src)) return null;
  if (isStoredAvatar(src)) return src;
  try {
    const res = await fetch(src, { redirect: "follow" });
    if (!res.ok) {
      console.error("[avatarStore] fetch failed", res.status);
      return null;
    }
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = EXT[type];
    if (!ext) {
      console.error("[avatarStore] not an image we accept:", type);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) {
      console.error("[avatarStore] unusable size", bytes.byteLength);
      return null;
    }
    /* One path per member, overwritten on each read: no orphan files, and the
       cache-busting query below is what makes a new photo show up. */
    const path = `${userId}/profile.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: type,
      upsert: true,
      cacheControl: "3600",
    });
    if (error) {
      console.error("[avatarStore] upload failed:", error.message);
      return null;
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    const url = data?.publicUrl as string | undefined;
    if (!url) return null;
    return `${url}?v=${Date.now()}`;
  } catch (e) {
    console.error("[avatarStore] threw:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
