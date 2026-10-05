/** Role versions read major.minor (Chorus 1.0, 1.1, 2.0). Pure. */

/** "1.10" > "1.9" */
export function compareVersions(a: string, b: string): number {
  const [am, an] = a.split(".").map(Number);
  const [bm, bn] = b.split(".").map(Number);
  return am - bm || an - bn;
}

export const isVersion = (v: unknown): v is string => typeof v === "string" && /^\d{1,3}\.\d{1,3}$/.test(v);
