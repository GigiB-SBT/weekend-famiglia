import type {
  Activity,
  Compatibility,
  CostBand,
  Family,
  FamilyBudget,
  Recommendation,
  ScoredActivity,
  WeekendWeather,
} from "./types";

/** Years of tolerance outside the declared age range for "adaptable". */
const ADAPT_MARGIN = 2;

const WEIGHTS = { age: 0.5, weather: 0.3, distance: 0.2 } as const;
/** Dated events happen only this weekend: they outrank evergreen activities at equal fit. */
const EVENT_BONUS = 0.12;

const AGE_SCORE: Record<Compatibility, number> = {
  all_children: 1,
  adaptable: 0.6,
  partial: 0.2,
  none: 0,
};

const ALLOWED_BANDS: Record<FamilyBudget, CostBand[]> = {
  free: ["free"],
  upto20: ["free", "low"],
  "20to50": ["free", "low", "mid"],
  over50: ["free", "low", "mid", "high"],
};

export function compatibility(ages: number[], minAge: number, maxAge: number): Compatibility {
  if (ages.length === 0) return "none";
  const inRange = ages.filter((a) => a >= minAge && a <= maxAge).length;
  if (inRange === ages.length) return "all_children";
  const nearRange = ages.every((a) => a >= minAge - ADAPT_MARGIN && a <= maxAge + ADAPT_MARGIN);
  if (nearRange) return "adaptable";
  if (inRange > 0) return "partial";
  return "none";
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function weatherScore(a: Activity, w: WeekendWeather): number {
  if (w.source === "fallback") return a.setting === "outdoor" ? 0.7 : 0.8;
  if (w.rainy) {
    if (a.setting === "indoor" || a.weatherFit === "rain_ok") return 1;
    if (a.setting === "mixed") return 0.5;
    return a.weatherFit === "dry_only" ? 0 : 0.3;
  }
  if (a.setting === "outdoor") return 1;
  if (a.setting === "mixed") return 0.9;
  return 0.7;
}

/** True when the activity is usable on the given weekend dates. */
export function isAvailable(a: Activity, saturday: string | null, sunday: string | null): boolean {
  const from = a.event ? a.event.date : a.availableFrom;
  const to = a.event ? (a.event.endDate ?? a.event.date) : a.availableTo;
  if (!from && !to) return true;
  const days = [saturday, sunday].filter((d): d is string => Boolean(d));
  if (days.length === 0) return true;
  return days.some((d) => (!from || d >= from) && (!to || d <= to));
}

export interface EngineOptions {
  /** Allow `da_verificare` content (demo mode). Production uses only `published`. */
  allowUnverified?: boolean;
  now?: Date;
}

export function scoreActivities(
  family: Family,
  activities: Activity[],
  weather: WeekendWeather,
  opts: EngineOptions = {},
): { scored: ScoredActivity[]; excluded: number } {
  const allowedStatus = opts.allowUnverified ? ["published", "da_verificare"] : ["published"];
  const bands = ALLOWED_BANDS[family.budget];
  const scored: ScoredActivity[] = [];
  let excluded = 0;

  for (const a of activities) {
    const flags: string[] = [];
    // Hard filters
    if (!allowedStatus.includes(a.status)) { excluded++; continue; }
    if (!isAvailable(a, weather.saturday, weather.sunday)) { excluded++; continue; }
    if (!bands.includes(a.costBand)) { excluded++; continue; }
    const compat = compatibility(family.childrenAges, a.minAge, a.maxAge);
    if (compat === "none") { excluded++; continue; }
    if (family.preference === "indoor" && a.setting === "outdoor" && !weather.rainy) {
      // soft: indoor-lovers can still get outdoor, but not as hard filter
      flags.push("preferenza_indoor");
    }

    let distanceKm: number | null = null;
    let distanceScore = 0.3;
    if (a.lat != null && a.lng != null) {
      distanceKm = haversineKm(family.lat, family.lng, a.lat, a.lng);
      if (distanceKm > family.radiusKm) { excluded++; continue; }
      distanceScore = 1 - distanceKm / family.radiusKm;
    } else {
      flags.push("distanza_non_verificata");
    }

    if (a.status !== "published") flags.push("da_verificare");
    if (a.bookingRequired) flags.push("prenotazione");

    const breakdown = {
      age: AGE_SCORE[compat],
      weather: weatherScore(a, weather),
      distance: Math.max(0, distanceScore),
    };
    let score =
      WEIGHTS.age * breakdown.age + WEIGHTS.weather * breakdown.weather + WEIGHTS.distance * breakdown.distance;
    if (flags.includes("preferenza_indoor")) score -= 0.05;
    if (family.preference === "outdoor" && a.setting === "indoor" && !weather.rainy) score -= 0.05;
    if (a.event) {
      score += EVENT_BONUS;
      flags.push("evento");
    }

    scored.push({ activity: a, compatibility: compat, distanceKm, score: round(score), breakdown, flags });
  }

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    // Tie-breaker: declared interests, then shorter distance
    const xi = family.interests.includes(x.activity.category) ? 1 : 0;
    const yi = family.interests.includes(y.activity.category) ? 1 : 0;
    if (yi !== xi) return yi - xi;
    return (x.distanceKm ?? 99) - (y.distanceKm ?? 99);
  });

  return { scored, excluded };
}

/** Pick N ideas maximising category diversity, then fill remaining slots by score. */
export function diversify(scored: ScoredActivity[], n = 3): ScoredActivity[] {
  const picked: ScoredActivity[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (picked.length >= n) break;
    if (seen.has(s.activity.category)) continue;
    picked.push(s);
    seen.add(s.activity.category);
  }
  for (const s of scored) {
    if (picked.length >= n) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked;
}

export function recommend(
  family: Family,
  activities: Activity[],
  weather: WeekendWeather,
  opts: EngineOptions = {},
): Recommendation {
  const { scored, excluded } = scoreActivities(family, activities, weather, opts);
  const ideas = diversify(scored, 3);
  const planB =
    scored.find(
      (s) =>
        !ideas.includes(s) && (s.activity.setting === "indoor" || s.activity.weatherFit === "rain_ok"),
    ) ?? null;
  return {
    familyId: family.id,
    ideas,
    planB,
    weather,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    excludedCount: excluded,
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
