import { describe, expect, it } from "vitest";
import { compatibility, diversify, haversineKm, recommend, scoreActivities } from "./engine";
import type { Activity, Family, WeekendWeather } from "./types";

const base: Activity = {
  slug: "x",
  title: "X",
  category: "museo",
  description: "",
  minAge: 4,
  maxAge: 14,
  multiAgeNote: "",
  setting: "indoor",
  weatherFit: "any",
  costBand: "free",
  priceNote: "",
  durationMin: 90,
  bookingRequired: false,
  address: "",
  zone: "Santo Stefano",
  lat: 44.494,
  lng: 11.346,
  openingNote: "",
  sourceUrl: "https://example.com",
  status: "published",
  isDemo: true,
};
const act = (o: Partial<Activity>): Activity => ({ ...base, ...o });

const family: Family = {
  id: "f1",
  email: "a@example.com",
  zone: "Santo Stefano",
  lat: 44.488,
  lng: 11.355,
  radiusKm: 10,
  childrenAges: [5, 9, 11],
  budget: "upto20",
  preference: "any",
  interests: [],
};

const dry: WeekendWeather = {
  rainProbability: 10, rainy: false, tempMax: 15,
  saturday: "2026-12-05", sunday: "2026-12-06", fetchedAt: "", source: "open-meteo",
};
const rainy: WeekendWeather = { ...dry, rainProbability: 80, rainy: true };

describe("compatibility — caso 5-9-11", () => {
  const ages = [5, 9, 11];
  it("all_children when every age is in range", () => {
    expect(compatibility(ages, 4, 14)).toBe("all_children");
  });
  it("adaptable when outside by ≤2 years", () => {
    expect(compatibility(ages, 6, 12)).toBe("adaptable");
  });
  it("partial when some ages are far outside", () => {
    expect(compatibility(ages, 9, 16)).toBe("partial");
  });
  it("none when no child fits", () => {
    expect(compatibility(ages, 14, 17)).toBe("none");
    expect(compatibility([], 0, 17)).toBe("none");
  });
});

describe("hard filters", () => {
  it("excludes unverified content unless demo mode", () => {
    const a = [act({ slug: "u", status: "da_verificare" })];
    expect(scoreActivities(family, a, dry).scored).toHaveLength(0);
    expect(scoreActivities(family, a, dry, { allowUnverified: true }).scored).toHaveLength(1);
  });
  it("excludes over budget, out of radius, age none, expired events", () => {
    const a = [
      act({ slug: "budget", costBand: "mid" }),
      act({ slug: "far", lat: 44.8, lng: 11.6 }),
      act({ slug: "teen", minAge: 14, maxAge: 17 }),
      act({ slug: "expired", availableFrom: "2026-11-01", availableTo: "2026-11-30" }),
      act({ slug: "ok" }),
    ];
    const { scored, excluded } = scoreActivities(family, a, dry);
    expect(scored.map((s) => s.activity.slug)).toEqual(["ok"]);
    expect(excluded).toBe(4);
  });
  it("keeps activities without coordinates but flags them", () => {
    const { scored } = scoreActivities(family, [act({ lat: null, lng: null })], dry);
    expect(scored[0].flags).toContain("distanza_non_verificata");
  });
});

describe("weather and ranking", () => {
  const park = act({ slug: "park", category: "natura", setting: "outdoor", weatherFit: "dry_only" });
  const museum = act({ slug: "museum", category: "museo", setting: "indoor" });
  it("prefers outdoor when dry", () => {
    expect(scoreActivities(family, [park, museum], dry).scored[0].activity.slug).toBe("park");
  });
  it("demotes outdoor when rainy", () => {
    expect(scoreActivities(family, [park, museum], rainy).scored[0].activity.slug).toBe("museum");
  });
  it("prefers all_children over adaptable at equal distance/weather", () => {
    const a = [act({ slug: "adapt", minAge: 6, maxAge: 12 }), act({ slug: "all" })];
    expect(scoreActivities(family, a, dry).scored[0].activity.slug).toBe("all");
  });
});

describe("diversify and recommend", () => {
  it("picks distinct categories first", () => {
    const a = [
      act({ slug: "m1" }), act({ slug: "m2" }), act({ slug: "m3" }),
      act({ slug: "n1", category: "natura", setting: "outdoor", lat: 44.52, lng: 11.36 }),
    ];
    const { scored } = scoreActivities(family, a, dry);
    const picks = diversify(scored, 3).map((s) => s.activity.category);
    expect(new Set(picks.slice(0, 2)).size).toBe(2);
  });
  it("returns 3 ideas and a rain-proof plan B not among the ideas", () => {
    const a = [
      act({ slug: "p", category: "natura", setting: "outdoor" }),
      act({ slug: "f", category: "fattoria", setting: "outdoor" }),
      act({ slug: "s", category: "sport", setting: "outdoor" }),
      act({ slug: "m", category: "museo", setting: "indoor", lat: 44.53, lng: 11.4 }),
    ];
    const rec = recommend(family, a, dry);
    expect(rec.ideas).toHaveLength(3);
    expect(rec.planB?.activity.slug).toBe("m");
    expect(rec.ideas.map((s) => s.activity.slug)).not.toContain("m");
  });
});

describe("haversine", () => {
  it("Bologna centre to Casalecchio ≈ 5-7 km", () => {
    const d = haversineKm(44.4939, 11.3426, 44.4757, 11.2765);
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(7);
  });
});
