/**
 * Downloads the latest weekly events straight from the GitHub repository, so the
 * app is up to date without reinstalling the APK or pasting the email code.
 * Works only if the repository is public (raw.githubusercontent.com).
 */
import type { Activity } from "@/lib/engine/types";
import type { ImportedCandidates } from "./store";

export const EVENTS_REPO = "GigiB-SBT/weekend-famiglia";
const BASE = `https://raw.githubusercontent.com/${EVENTS_REPO}/main/src/data/`;

export type RemoteResult =
  | { ok: true; data: ImportedCandidates }
  | { ok: false; reason: "offline" | "private" | "empty" };

async function getJson<T>(name: string, fetchImpl: typeof fetch): Promise<T | null> {
  const res = await fetchImpl(`${BASE}${name}?t=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export async function fetchRemoteEvents(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<RemoteResult> {
  let events: Activity[] | null;
  let adults: Activity[] | null = null;
  let meta: { generatedAt?: string | null } | null = null;
  try {
    [events, adults, meta] = await Promise.all([
      getJson<Activity[]>("event-candidates.json", fetchImpl),
      getJson<Activity[]>("event-adults.json", fetchImpl).catch(() => null),
      getJson<{ generatedAt?: string | null }>("event-candidates-meta.json", fetchImpl).catch(() => null),
    ]);
  } catch {
    return { ok: false, reason: "offline" };
  }
  // A private repository answers 404 to anonymous requests.
  if (events === null) return { ok: false, reason: "private" };
  const ev = Array.isArray(events) ? events.filter((e) => e && typeof e.slug === "string" && e.event) : [];
  const ad = Array.isArray(adults) ? adults.filter((e) => e && typeof e.slug === "string" && e.event) : [];
  if (ev.length + ad.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, data: { generatedAt: meta?.generatedAt ?? now.toISOString(), events: ev, adults: ad } };
}

/** Accept the download only if it is not older than what the phone already has. */
export function isNewer(remote: ImportedCandidates, current: ImportedCandidates): boolean {
  return (remote.generatedAt ?? "") >= (current.generatedAt ?? "");
}
