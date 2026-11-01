/** Approximate centroids of Bologna quartieri (for distance only; not addresses). */
export const ZONES = {
  "Borgo Panigale-Reno": { lat: 44.505, lng: 11.29 },
  Navile: { lat: 44.518, lng: 11.342 },
  "Porto-Saragozza": { lat: 44.49, lng: 11.32 },
  "San Donato-San Vitale": { lat: 44.5, lng: 11.38 },
  "Santo Stefano": { lat: 44.488, lng: 11.355 },
  Savena: { lat: 44.472, lng: 11.38 },
} as const;

export type ZoneName = keyof typeof ZONES;
export const ZONE_NAMES = Object.keys(ZONES) as ZoneName[];
