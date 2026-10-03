/** Where a signed-in user lands when no (valid) `next` is given. */
export const DEFAULT_AFTER_AUTH = "/dashboard";

/**
 * Returns `next` only when it is a same-origin relative path; otherwise the
 * default. Rejects absolute URLs, protocol-relative `//host`, backslash tricks
 * (`/\host`, which some browsers treat as `//host`) and control characters.
 */
export function safeNextPath(
  next: FormDataEntryValue | string | null | undefined,
  fallback: string = DEFAULT_AFTER_AUTH,
): string {
  if (typeof next !== "string") return fallback;
  const value = next.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  return value;
}
