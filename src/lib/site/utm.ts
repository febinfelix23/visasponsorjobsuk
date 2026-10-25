/** The UTM tags a post's link carries, kept only while they look like tags (letters, digits, - _ .). */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

const clean = (v: string | null | undefined) => (v && /^[\w.-]{1,40}$/.test(v) ? v : null);

/** "utm_source=telegram&utm_medium=social…", or "" when the visit didn't come from a tagged link. */
export function utmQuery(params: { get(key: string): string | null }): string {
  if (!clean(params.get("utm_source"))) return "";
  const kept = new URLSearchParams();
  for (const k of UTM_KEYS) {
    const v = clean(params.get(k));
    if (v) kept.set(k, v);
  }
  return kept.toString();
}
