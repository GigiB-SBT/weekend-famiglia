import { describe, expect, it } from "vitest";
import { buildHtml, escapeHtml } from "./html";
import type { Activity, Family, Recommendation, ScoredActivity } from "@/lib/engine/types";

const act = (slug: string, title: string, url = "https://example.com"): Activity => ({
  slug, title, category: "museo", description: "Descrizione", minAge: 3, maxAge: 14, multiAgeNote: "Nota",
  setting: "indoor", weatherFit: "any", costBand: "free", priceNote: "", durationMin: 60, bookingRequired: false,
  address: "", zone: "Centro", lat: 44.49, lng: 11.34, openingNote: "", sourceUrl: url, status: "published", isDemo: true,
});
const scored = (a: Activity): ScoredActivity => ({
  activity: a, compatibility: "all_children", distanceKm: 1.2, score: 0.9,
  breakdown: { age: 1, weather: 1, distance: 0.8 }, flags: [],
});
const family: Family = {
  id: "f", email: "a@example.com", zone: "Santo Stefano", lat: 44.488, lng: 11.355, radiusKm: 10,
  childrenAges: [11, 5, 9], budget: "upto20", preference: "any", interests: [],
};
const rec: Recommendation = {
  familyId: "f",
  ideas: [scored(act("a", "Uno")), scored(act("b", "Due <b>")), scored(act("c", "Tre", "javascript:alert(1)"))],
  planB: scored(act("d", "Piano B")),
  weather: { rainProbability: 10, rainy: false, tempMax: 12, saturday: "2026-12-05", sunday: "2026-12-06", fetchedAt: "", source: "open-meteo" },
  generatedAt: "", excludedCount: 0,
};

describe("buildHtml", () => {
  const html = buildHtml(family, rec, { replyTo: "luigi@example.com" });
  it("renders 3 ideas, plan B, feedback and ages sorted", () => {
    expect(html).toContain("Uno");
    expect(html).toContain("Piano B");
    expect(html).toContain("Va bene per tutti e tre");
    expect(html).toContain("5, 9 e 11 anni");
    expect(html).toContain("mailto:luigi@example.com");
  });
  it("escapes content and blocks non-http links", () => {
    expect(html).toContain("Due &lt;b&gt;");
    expect(html).not.toContain("javascript:");
  });
  it("escapeHtml handles quotes", () => {
    expect(escapeHtml(`"x'`)).toBe("&quot;x&#39;");
  });
});
