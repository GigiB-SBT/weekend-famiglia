import type { WeekendWeather } from "@/lib/engine/types";

export const BOLOGNA = { lat: 44.4949, lng: 11.3426 } as const;
const RAIN_THRESHOLD = 50;

/** Returns ISO dates (YYYY-MM-DD, Europe/Rome) of the next Saturday and Sunday. */
export function nextWeekend(now: Date = new Date()): { saturday: string; sunday: string } {
  const rome = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const dow = rome.getDay(); // 0 Sun .. 6 Sat
  const daysToSat = dow === 0 ? 6 : (6 - dow + 7) % 7;
  const sat = new Date(rome);
  sat.setDate(rome.getDate() + daysToSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return { saturday: iso(sat), sunday: iso(sun) };
}

export function fallbackWeather(now: Date = new Date()): WeekendWeather {
  const { saturday, sunday } = nextWeekend(now);
  return {
    rainProbability: null,
    rainy: false,
    tempMax: null,
    saturday,
    sunday,
    fetchedAt: now.toISOString(),
    source: "fallback",
  };
}

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    precipitation_probability_max?: (number | null)[];
    temperature_2m_max?: (number | null)[];
  };
}

export function parseOpenMeteo(json: OpenMeteoDaily, now: Date = new Date()): WeekendWeather {
  const { saturday, sunday } = nextWeekend(now);
  const d = json.daily;
  if (!d?.time || !d.precipitation_probability_max) return fallbackWeather(now);
  const idx = [saturday, sunday].map((day) => d.time!.indexOf(day)).filter((i) => i >= 0);
  if (idx.length === 0) return fallbackWeather(now);
  const probs = idx.map((i) => d.precipitation_probability_max![i]).filter((p): p is number => p != null);
  const temps = idx.map((i) => d.temperature_2m_max?.[i]).filter((t): t is number => t != null);
  const rainProbability = probs.length ? Math.max(...probs) : null;
  return {
    rainProbability,
    rainy: rainProbability != null && rainProbability >= RAIN_THRESHOLD,
    tempMax: temps.length ? Math.round(Math.max(...temps)) : null,
    saturday,
    sunday,
    fetchedAt: now.toISOString(),
    source: "open-meteo",
  };
}

/** Fetches weekend forecast from Open-Meteo (no API key). Never throws: falls back on error/timeout. */
export async function getWeekendWeather(
  opts: { lat?: number; lng?: number; timeoutMs?: number; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<WeekendWeather> {
  const { lat = BOLOGNA.lat, lng = BOLOGNA.lng, timeoutMs = 4000, fetchImpl = fetch, now = new Date() } = opts;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_probability_max,temperature_2m_max&timezone=Europe%2FRome&forecast_days=8`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) return fallbackWeather(now);
    return parseOpenMeteo((await res.json()) as OpenMeteoDaily, now);
  } catch {
    return fallbackWeather(now);
  } finally {
    clearTimeout(timer);
  }
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
