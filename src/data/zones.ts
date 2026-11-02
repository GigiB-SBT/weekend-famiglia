/**
 * Areas served and their zones. Coordinates are approximate centroids
 * (for distance only; not addresses).
 */
export const AREAS = {
  bologna: { label: "Bologna", lat: 44.4949, lng: 11.3426 },
  grottammare: { label: "Grottammare", lat: 42.9897, lng: 13.8658 },
} as const;
export type AreaId = keyof typeof AREAS;
export const AREA_IDS = Object.keys(AREAS) as AreaId[];

export const ZONES = {
  // Bologna: quartieri
  "Borgo Panigale-Reno": { lat: 44.505, lng: 11.29, area: "bologna" },
  Navile: { lat: 44.518, lng: 11.342, area: "bologna" },
  "Porto-Saragozza": { lat: 44.49, lng: 11.32, area: "bologna" },
  "San Donato-San Vitale": { lat: 44.5, lng: 11.38, area: "bologna" },
  "Santo Stefano": { lat: 44.488, lng: 11.355, area: "bologna" },
  Savena: { lat: 44.472, lng: 11.38, area: "bologna" },
  // Grottammare and nearby towns
  Grottammare: { lat: 42.9897, lng: 13.8658, area: "grottammare" },
  "San Benedetto del Tronto": { lat: 42.954, lng: 13.881, area: "grottammare" },
  "Cupra Marittima": { lat: 43.025, lng: 13.859, area: "grottammare" },
  Ripatransone: { lat: 42.999, lng: 13.762, area: "grottammare" },
  "Acquaviva Picena": { lat: 42.945, lng: 13.812, area: "grottammare" },
  Monteprandone: { lat: 42.92, lng: 13.836, area: "grottammare" },
} as const satisfies Record<string, { lat: number; lng: number; area: AreaId }>;

export type ZoneName = keyof typeof ZONES;
export const ZONE_NAMES = Object.keys(ZONES) as ZoneName[];

export function zonesOf(area: AreaId): ZoneName[] {
  return ZONE_NAMES.filter((z) => ZONES[z].area === area);
}

export function areaOfZone(zone: string): AreaId {
  return zone in ZONES ? ZONES[zone as ZoneName].area : "bologna";
}
