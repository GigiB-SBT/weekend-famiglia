import { describe, expect, it } from "vitest";
import { eventWhen, formToEvent, mergeCandidates, parseImportCode, pendingCandidates, rejectCandidate, upsertEvent, type EventForm } from "./store";
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
  it("imports the email code (even with the whole email pasted) and merges with the APK list", () => {
    const code = JSON.stringify({ wf: 1, generatedAt: "2026-11-04T06:20:00Z", events: [{ slug: "loc-1", title: "Festa delle castagne", event: { date: "2026-11-08", origin: "agenda" }, lat: 44.497, lng: 11.283 }] });
    const parsed = parseImportCode(`28 eventi da approvare\n## Codice eventi\n${code}\nDettagli`);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.events[0].status).toBe("da_verificare");
    expect(parsed.events[0].costBand).toBe("free");
    const merged = mergeCandidates([{ ...ev, slug: "old" }], "2026-11-01T00:00:00Z", parsed);
    expect(merged.map((m) => m.slug).sort()).toEqual(["loc-1", "old"]);
    const withAdults = parseImportCode(JSON.stringify({ wf: 1, generatedAt: "x", events: [], adults: [["ag-1", "Concerto jazz", "musica", "2026-11-07", null, "21:00", null, "Cantina Bentivoglio", 44.5, 11.35, "https://e.org", "low"]] }));
    if ("error" in withAdults) throw new Error(withAdults.error);
    expect(withAdults.adults?.[0]).toMatchObject({ title: "Concerto jazz", audience: "adulti", event: { startTime: "21:00" } });
    expect("error" in parseImportCode("ciao")).toBe(true);
    expect("error" in parseImportCode('{"wf": 2}')).toBe(true);
  });
});
