import { describe, expect, it } from "vitest";
import { parseGeocoding } from "./geo";
import { buildOverpassQuery, parseOverpass, PLACE_KINDS } from "./osm";
import { webSearches, weekendLabel } from "./websearch";
import { placeKey, recordSearch, suggestions } from "./places-store";

const k = (id: string) => PLACE_KINDS.filter((x) => x.id === id);

describe("geocoding", () => {
  it("maps Open-Meteo results to places", () => {
    const places = parseGeocoding({ results: [{ name: "Riccione", latitude: 44.0, longitude: 12.65, admin1: "Emilia-Romagna", admin2: "Rimini" }] });
    expect(places).toEqual([{ name: "Riccione", detail: "Rimini, Emilia-Romagna", lat: 44, lng: 12.65 }]);
  });
});

describe("OpenStreetMap places", () => {
  it("builds an around query for each tag", () => {
    const q = buildOverpassQuery([...k("musei"), ...k("animali")], 44, 12.6, 10);
    expect(q).toContain('nwr["tourism"="museum"]["name"](around:10000,44,12.6);');
    expect(q).toContain('nwr["tourism"="aquarium"]');
  });
  it("parses elements, needs a name, dedupes and sorts by distance", () => {
    const json = {
      elements: [
        { type: "way", id: 2, center: { lat: 44.1, lon: 12.6 }, tags: { name: "Acquario lontano", tourism: "aquarium" } },
        { type: "node", id: 1, lat: 44.001, lon: 12.6, tags: { name: "Museo vicino", tourism: "museum", website: "https://m.it" } },
        { type: "node", id: 3, lat: 44.001, lon: 12.6, tags: { name: "Museo vicino", tourism: "museum" } },
        { type: "node", id: 4, lat: 44.0, lon: 12.6, tags: { tourism: "museum" } },
      ],
    };
    const res = parseOverpass(json, [...k("musei"), ...k("animali")], 44, 12.6);
    expect(res.map((r) => [r.name, r.kind])).toEqual([["Museo vicino", "Musei"], ["Acquario lontano", "Zoo, acquari, fattorie"]]);
    expect(res[0].website).toBe("https://m.it");
    expect(res[0].distanceKm).toBeLessThan(0.2);
  });
});

describe("web searches", () => {
  it("fills place and weekend", () => {
    expect(weekendLabel("2026-11-07", "2026-11-08")).toBe("7-8 novembre");
    expect(weekendLabel("2026-10-31", "2026-11-01")).toBe("31 ottobre-1 novembre");
    const s = webSearches("Riccione", "adulti", "2026-11-07", "2026-11-08");
    expect(s[0].label).toBe("Concerti live");
    expect(decodeURIComponent(s[0].url)).toContain("concerti Riccione 7-8 novembre");
  });
});

describe("favourites from history", () => {
  it("suggests a place searched twice", () => {
    const p = { name: "Riccione", detail: "", lat: 44.0, lng: 12.65 };
    let h = recordSearch([], p);
    expect(suggestions(h, [])).toHaveLength(0);
    h = recordSearch(h, { ...p, lat: 44.001 });
    expect(suggestions(h, []).map((x) => x.name)).toEqual(["Riccione"]);
    expect(suggestions(h, [p])).toHaveLength(0);
    expect(placeKey(p)).toBe("44.00,12.65");
  });
});
