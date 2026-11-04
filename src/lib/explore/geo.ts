/**
 * Where the user is or wants to search: GPS, a typed place, or a favourite.
 * - Typed place → Open-Meteo geocoding (free, no key).
 * - GPS → Capacitor Geolocation in the app, browser geolocation on the web;
 *   the place name comes from BigDataCloud's client-side reverse geocoding (free, no key).
 */

export interface Place {
  name: string;
  /** e.g. "Rimini, Emilia-Romagna" */
  detail: string;
  lat: number;
  lng: number;
}

interface OpenMeteoGeo {
  results?: { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string; country_code?: string }[];
}

export function parseGeocoding(json: OpenMeteoGeo): Place[] {
  return (json.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.admin2, r.admin1].filter((x, i, a) => x && a.indexOf(x) === i && x !== r.name).join(", "),
    lat: r.latitude,
    lng: r.longitude,
  }));
}

export async function searchPlaces(query: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=it&format=json&countryCode=IT`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Ricerca località non riuscita (${res.status})`);
  return parseGeocoding((await res.json()) as OpenMeteoGeo);
}

export async function reverseName(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<Place> {
  const fallback: Place = { name: "Vicino a me", detail: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng };
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=it`;
    const res = await fetchImpl(url);
    if (!res.ok) return fallback;
    const j = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string };
    const name = j.city || j.locality;
    return name ? { name, detail: j.principalSubdivision ?? "", lat, lng } : fallback;
  } catch {
    return fallback;
  }
}

/** Current position: the app's Geolocation plugin when native, the browser API otherwise. */
export async function currentPosition(): Promise<{ lat: number; lng: number }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.requestPermissions();
      if (perm.location === "denied" && perm.coarseLocation === "denied") throw new Error("Permesso posizione negato");
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
      return { lat: p.coords.latitude, lng: p.coords.longitude };
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Permesso")) throw e;
  }
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.geolocation) return reject(new Error("Posizione non disponibile su questo dispositivo"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("Posizione non disponibile: controlla il permesso o scrivi la località")),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}
