/**
 * Favourite places and search history (kept durably on the phone).
 * A place searched at least twice and not yet a favourite is suggested as one.
 */
import { durableSet, localGet } from "@/lib/persist";
import type { Place } from "./geo";

const FAV_KEY = "wf.places.fav.v1";
const HIST_KEY = "wf.places.history.v1";
export const SUGGEST_AFTER = 2;

export interface HistoryEntry extends Place {
  count: number;
  last: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const placeKey = (p: Pick<Place, "lat" | "lng">) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;

export function loadFavourites(): Place[] {
  return read<Place[]>(FAV_KEY, []);
}
export function saveFavourites(list: Place[]) {
  durableSet(FAV_KEY, JSON.stringify(list));
}
export function loadHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HIST_KEY, []);
}

export function recordSearch(history: HistoryEntry[], p: Place, now = new Date()): HistoryEntry[] {
  const k = placeKey(p);
  const found = history.find((h) => placeKey(h) === k);
  const next = found
    ? history.map((h) => (placeKey(h) === k ? { ...h, count: h.count + 1, last: now.toISOString() } : h))
    : [...history, { ...p, count: 1, last: now.toISOString() }];
  const trimmed = next.sort((a, b) => b.last.localeCompare(a.last)).slice(0, 30);
  durableSet(HIST_KEY, JSON.stringify(trimmed));
  return trimmed;
}

/** Most searched places that are not favourites yet. */
export function suggestions(history: HistoryEntry[], favourites: Place[]): HistoryEntry[] {
  const fav = new Set(favourites.map(placeKey));
  return history.filter((h) => h.count >= SUGGEST_AFTER && !fav.has(placeKey(h))).sort((a, b) => b.count - a.count).slice(0, 3);
}
