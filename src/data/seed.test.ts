import { describe, expect, it } from "vitest";
import seed from "./seed-activities.json";
import { DEMO_FAMILIES } from "./demo-families";
import { recommend } from "@/lib/engine/engine";
import type { Activity, WeekendWeather } from "@/lib/engine/types";

const activities = seed as Activity[];
const base: WeekendWeather = {
  rainProbability: 10, rainy: false, tempMax: 12,
  saturday: "2026-12-05", sunday: "2026-12-06", fetchedAt: "2026-12-04T08:00:00Z", source: "open-meteo",
};

describe("seed catalogue", () => {
  it("has 30 valid activities with coordinates and source", () => {
    expect(activities).toHaveLength(30);
    for (const a of activities) {
      expect(a.minAge).toBeLessThanOrEqual(a.maxAge);
      expect(a.lat).not.toBeNull();
      expect(a.sourceUrl).toMatch(/^https?:\/\//);
      expect(["free", "low", "mid", "high"]).toContain(a.costBand);
    }
  });

  for (const weather of [base, { ...base, rainy: true, rainProbability: 85 }]) {
    for (const f of DEMO_FAMILIES) {
      it(`${f.id} gets 3 distinct-category ideas and a plan B (${weather.rainy ? "pioggia" : "sole"})`, () => {
        const rec = recommend(f, activities, weather, { allowUnverified: true });
        expect(rec.ideas).toHaveLength(3);
        expect(new Set(rec.ideas.map((i) => i.activity.category)).size).toBe(3);
        expect(rec.planB).not.toBeNull();
        expect(rec.ideas.every((i) => i.activity.status !== "draft")).toBe(true);
        if (weather.rainy) expect(rec.ideas[0].activity.setting).not.toBe("outdoor");
      });
    }
  }
});
