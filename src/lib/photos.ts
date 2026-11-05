/**
 * Real photographs for activities, from Wikipedia/Wikimedia Commons (free licences).
 * Looks for Wikipedia articles near the activity's position and keeps one only when
 * its title shares a significant word with the activity (no random stock pictures).
 * Results are cached on the phone; no photo is better than a wrong one.
 */
import type { Activity } from "@/lib/engine/types";

export interface Photo {
  url: string;
  page: string;
  title: string;
}

const CACHE_KEY = "wf.photos.v1";
const STOP = new Set([
  "della", "delle", "dello", "degli", "dei", "del", "di", "da", "la", "le", "il", "lo", "gli", "e", "a", "al", "alla", "in", "per", "con", "su",
  "museo", "parco", "festa", "sagra", "teatro", "biblioteca", "chiesa", "parrocchia", "piazza", "via", "giardino", "casa", "palazzo",
  "bologna", "grottammare", "bambini", "ragazzi", "famiglie", "laboratorio", "visita", "mostra", "evento", "san", "santa", "santo",
]);

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Score how well a Wikipedia title matches the activity title (shared distinctive words). */
export function matchScore(activityTitle: string, pageTitle: string): number {
  const a = new Set(words(activityTitle));
  return words(pageTitle).filter((w) => a.has(w)).length;
}

interface WikiPage {
  title: string;
  thumbnail?: { source: string };
  fullurl?: string;
  index?: number;
}

export function pickPhoto(activityTitle: string, pages: WikiPage[]): Photo | null {
  let best: { p: WikiPage; s: number } | null = null;
  for (const p of pages) {
    if (!p.thumbnail?.source) continue;
    const s = matchScore(activityTitle, p.title);
    if (s > 0 && (!best || s > best.s)) best = { p, s };
  }
  if (!best) return null;
  return {
    url: best.p.thumbnail!.source,
    page: best.p.fullurl ?? `https://it.wikipedia.org/wiki/${encodeURIComponent(best.p.title.replace(/ /g, "_"))}`,
    title: best.p.title,
  };
}

function readCache(): Record<string, Photo | null> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeCache(c: Record<string, Photo | null>) {
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage full or unavailable */
  }
}

export function cachedPhoto(slug: string): Photo | null | undefined {
  return readCache()[slug];
}

export async function findPhoto(a: Activity, fetchImpl: typeof fetch = fetch): Promise<Photo | null> {
  const cache = readCache();
  if (a.slug in cache) return cache[a.slug] ?? null;
  if (a.lat == null || a.lng == null) return null;
  const params = new URLSearchParams({
    action: "query",
    generator: "geosearch",
    ggscoord: `${a.lat}|${a.lng}`,
    ggsradius: "800",
    ggslimit: "20",
    prop: "pageimages|info",
    inprop: "url",
    piprop: "thumbnail",
    pithumbsize: "800",
    format: "json",
    origin: "*",
  });
  try {
    const res = await fetchImpl(`https://it.wikipedia.org/w/api.php?${params}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
    const photo = pickPhoto(a.title, Object.values(json.query?.pages ?? {}));
    writeCache({ ...readCache(), [a.slug]: photo });
    return photo;
  } catch {
    return null; // offline: try again next time
  }
}
