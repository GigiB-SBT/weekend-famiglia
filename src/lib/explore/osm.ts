/**
 * Places around any location from OpenStreetMap (Overpass API, free, worldwide).
 * Each kind maps to OSM tags; only named places are returned, nearest first.
 * Data © OpenStreetMap contributors (ODbL).
 */
import { haversineKm } from "@/lib/engine/engine";

export type Mode = "famiglia" | "adulti";

export interface PlaceKind {
  id: string;
  label: string;
  mode: Mode | "tutti";
  /** Overpass selectors (without area filter), e.g. ["tourism=museum"]. */
  tags: string[];
}

export const PLACE_KINDS: PlaceKind[] = [
  { id: "musei", label: "Musei", mode: "tutti", tags: ["tourism=museum"] },
  { id: "parchi", label: "Parchi", mode: "famiglia", tags: ["leisure=park"] },
  { id: "giochi", label: "Parchi giochi", mode: "famiglia", tags: ["leisure=playground"] },
  { id: "animali", label: "Zoo, acquari, fattorie", mode: "famiglia", tags: ["tourism=zoo", "tourism=aquarium", "tourism=theme_park"] },
  { id: "castelli", label: "Castelli e borghi", mode: "tutti", tags: ["historic=castle", "historic=fort"] },
  { id: "natura", label: "Natura e panorami", mode: "tutti", tags: ["leisure=nature_reserve", "tourism=viewpoint"] },
  { id: "biblioteche", label: "Biblioteche", mode: "famiglia", tags: ["amenity=library"] },
  { id: "piscine", label: "Piscine e parchi acquatici", mode: "famiglia", tags: ["leisure=water_park", "sport=swimming"] },
  { id: "teatri", label: "Teatri", mode: "adulti", tags: ["amenity=theatre"] },
  { id: "cinema", label: "Cinema", mode: "adulti", tags: ["amenity=cinema"] },
  { id: "live", label: "Musica dal vivo", mode: "adulti", tags: ["amenity=music_venue", "live_music=yes"] },
  { id: "club", label: "Club e discoteche", mode: "adulti", tags: ["amenity=nightclub"] },
  { id: "vino", label: "Cantine ed enoteche", mode: "adulti", tags: ["craft=winery", "shop=wine"] },
  { id: "gallerie", label: "Gallerie d'arte", mode: "adulti", tags: ["tourism=gallery"] },
];

export interface OsmPlace {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  distanceKm: number;
  website: string | null;
  openingHours: string | null;
  mapsUrl: string;
}

export function buildOverpassQuery(kinds: PlaceKind[], lat: number, lng: number, radiusKm: number): string {
  const r = Math.round(Math.min(radiusKm, 50) * 1000);
  const parts = kinds.flatMap((k) =>
    k.tags.map((t) => {
      const [key, value] = t.split("=");
      return `nwr["${key}"="${value}"]["name"](around:${r},${lat},${lng});`;
    }),
  );
  return `[out:json][timeout:25];(${parts.join("")});out center 200;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

export function parseOverpass(json: { elements?: OverpassElement[] }, kinds: PlaceKind[], lat: number, lng: number): OsmPlace[] {
  const seen = new Set<string>();
  const out: OsmPlace[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    const plat = e.lat ?? e.center?.lat;
    const plng = e.lon ?? e.center?.lon;
    if (!t.name || plat == null || plng == null) continue;
    const kind = kinds.find((k) => k.tags.some((tag) => { const [key, value] = tag.split("="); return t[key] === value; }));
    if (!kind) continue;
    const key = `${t.name.toLowerCase()}|${plat.toFixed(3)}|${plng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${e.type}/${e.id}`,
      name: t.name,
      kind: kind.label,
      lat: plat,
      lng: plng,
      distanceKm: haversineKm(lat, lng, plat, plng),
      website: t.website ?? t["contact:website"] ?? null,
      openingHours: t.opening_hours ?? null,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${plat},${plng}`,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function findPlaces(
  kinds: PlaceKind[],
  lat: number,
  lng: number,
  radiusKm: number,
  fetchImpl: typeof fetch = fetch,
): Promise<OsmPlace[]> {
  if (kinds.length === 0) return [];
  const body = new URLSearchParams({ data: buildOverpassQuery(kinds, lat, lng, radiusKm) });
  const res = await fetchImpl("https://overpass-api.de/api/interpreter", { method: "POST", body });
  if (!res.ok) throw new Error(res.status === 429 ? "Troppe ricerche ravvicinate: riprova tra un minuto" : `Ricerca luoghi non riuscita (${res.status})`);
  return parseOverpass(await res.json(), kinds, lat, lng);
}
