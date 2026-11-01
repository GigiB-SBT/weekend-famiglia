import { describe, expect, it } from "vitest";
import { eventWhen, formToEvent, pendingCandidates, rejectCandidate, upsertEvent, type EventForm } from "./store";
import { isAvailable, recommend } from "@/lib/engine/engine";
import type { Family, WeekendWeather } from "@/lib/engine/types";

const form: EventForm = {
  title: "Castagnata in parrocchia",
  description: "Caldarroste e giochi",
  date: "2026-11-08",
  startTime: "15:00",
  endTime: "18:00",
  place: "Parrocchia, Castel Debole",
  zone: "Borgo Panigale-Reno",
  minAge: 0,
  maxAge: 17,
  costBand: "free",
  setting: "outdoor",
  category: "festa",
  sourceUrl: "",
  organizer: "Parrocchia",
};

const family: Family = {
  id: "f", email: "a@example.com", zone: "Borgo Panigale-Reno", lat: 44.505, lng: 11.29, radiusKm: 10,
  childrenAges: [5, 9, 11], budget: "upto20", preference: "any", interests: [],
};
const weather = (sat: string, sun: string): WeekendWeather => ({
  rainProbability: 10, rainy: false, tempMax: 12, saturday: sat, sunday: sun, fetchedAt: "", source: "open-meteo",
});

describe("events", () => {
  const ev = formToEvent(form);
  it("builds a published manual event with a stable slug", () => {
    expect(ev.slug).toBe("ev-2026-11-08-castagnata-in-parrocchia");
    expect(ev.status).toBe("published");
    expect(ev.event?.origin).toBe("manuale");
    expect(eventWhen(ev)).toMatch(/8 nov.*15:00–18:00/);
  });
  it("is available only on its weekend", () => {
    expect(isAvailable(ev, "2026-11-07", "2026-11-08")).toBe(true);
    expect(isAvailable(ev, "2026-11-14", "2026-11-15")).toBe(false);
  });
  it("outranks an equivalent evergreen activity on its weekend", () => {
    const evergreen = { ...ev, slug: "parco", title: "Parco", event: null, category: "natura" as const };
    const rec = recommend(family, [evergreen, ev], weather("2026-11-07", "2026-11-08"));
    expect(rec.ideas[0].activity.slug).toBe(ev.slug);
    expect(rec.ideas[0].flags).toContain("evento");
    const next = recommend(family, [evergreen, ev], weather("2026-11-14", "2026-11-15"));
    expect(next.ideas.map((i) => i.activity.slug)).not.toContain(ev.slug);
  });
  it("tracks pending candidates", () => {
    const cand = { ...ev, slug: "cand-1", status: "da_verificare" as const };
    let store = { events: [], rejected: [] } as { events: typeof ev[]; rejected: string[] };
    expect(pendingCandidates([cand], store, "2026-11-01")).toHaveLength(1);
    store = rejectCandidate(store, "cand-1");
    expect(pendingCandidates([cand], store, "2026-11-01")).toHaveLength(0);
    store = upsertEvent({ events: [], rejected: [] }, { ...cand, status: "published" });
    expect(pendingCandidates([cand], store, "2026-11-01")).toHaveLength(0);
    expect(pendingCandidates([cand], { events: [], rejected: [] }, "2026-11-09")).toHaveLength(0);
  });
});
