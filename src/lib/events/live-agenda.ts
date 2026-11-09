/**
 * Live read of the Comune di Bologna "Agenda Cultura" (open data, CC BY-SA 4.0)
 * straight from the phone, for the Adulti tab: concerts, shows, exhibitions and
 * talks of the next days appear even if the weekly GitHub run has not happened.
 * Field names are discovered from the first record, as in the weekly reader.
 */
import type { Activity } from "@/lib/engine/types";
import { ZONES, zonesOf } from "@/data/zones";
import { adultCategory, isForKids } from "./classify";

const BASES = ["https://opendata.comune.bologna.it", "https://bologna.opendatasoft.com"];
const DATASET = "eventi-bologna-agenda-cultura";
const ATTRIBUTION = "https://www.culturabologna.it/objects/agenda";
const CACHE_KEY = "wf.live.adults.v1";
const MAX_AGE_MS = 6 * 3600_000;

type Rec = Record<string, unknown>;

export function pick(rec: Rec, patterns: RegExp[]): { key: string; value: unknown } | null {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(rec)) {
      if (re.test(k) && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) return { key: k, value: v };
    }
  }
  return null;
}
const asText = (v: unknown): string =>
  v == null ? "" : Array.isArray(v) ? v.map(asText).join(", ") : typeof v === "object" ? Object.values(v as Rec).map(asText).join(" ") : String(v);

const ROME = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export function local(v: unknown): { day: string | null; time: string | null } {
  const s = asText(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const p = Object.fromEntries(ROME.formatToParts(d).map((x) => [x.type, x.value]));
      const hh = p.hour === "24" ? "00" : p.hour;
      return { day: `${p.year}-${p.month}-${p.day}`, time: hh === "00" && p.minute === "00" ? null : `${hh}:${p.minute}` };
    }
  }
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? { day: `${m[1]}-${m[2]}-${m[3]}`, time: null } : { day: null, time: null };
}

const START = [/data.?inizio|date.?start|start.?date|^dal$|inizio|start/i, /^data$|^date$/i];
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

function position(rec: Rec): [number, number] | null {
  const g = pick(rec, [/geo_point|geopoint|coordinat|posizione|location$/i]);
  if (g && typeof g.value === "object" && g.value) {
    const v = g.value as Rec & unknown[];
    const lat = Number(v.lat ?? v.latitude ?? (Array.isArray(v) ? v[0] : NaN));
    const lon = Number(v.lon ?? v.lng ?? v.longitude ?? (Array.isArray(v) ? v[1] : NaN));
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
  }
  return null;
}

/** One agenda record → adult event (null if for kids, out of window or a long exhibition). */
export function toAdult(rec: Rec, from: string, to: string): Activity | null {
  const title = pick(rec, [/^titolo$|^title$/i, /titolo|title|^nome|name/i]);
  const start = pick(rec, START);
  const end = pick(rec, [/data.?fine|date.?end|end.?date|^al$|fine|end/i]);
  if (!title || !start) return null;
  const s = local(start.value);
  const e = local(end?.value);
  const startDay = s.day;
  const endDay = e.day ?? startDay;
  if (!startDay || !endDay || endDay < from || startDay > to) return null;
  if ((Date.parse(endDay) - Date.parse(startDay)) / 86400000 > 21) return null;
  const desc = asText(pick(rec, [/descri|abstract|sottotitolo|subtitle|testo|body/i])?.value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const cats = asText(pick(rec, [/categor|tipolog|tag|target|pubblico|audience|genere/i])?.value);
  const place = asText(pick(rec, [/luogo|venue|sede|location_name|spazio|indirizzo|address|place/i])?.value).trim();
  const url = asText(pick(rec, [/^url$|link|permalink|sito|web/i])?.value).trim();
  const price = asText(pick(rec, [/ingresso|prezzo|costo|price|biglietto|ticket/i])?.value);
  const t = asText(title.value).trim();
  const text = `${t}\n${desc}\n${cats}\n${price}`;
  if (isForKids(text)) return null;
  const pos = position(rec);
  const zones = zonesOf("bologna");
  let zone = zones.find((z) => z === "Santo Stefano") ?? zones[0];
  if (pos) {
    let best = Infinity;
    for (const z of zones) {
      const d = Math.hypot((pos[0] - ZONES[z].lat) * 111, (pos[1] - ZONES[z].lng) * 79);
      if (d < best) { best = d; zone = z; }
    }
    if (best > 35) return null;
  }
  const free = /ingresso (libero|gratuito)|gratuit|gratis/i.test(text);
  return {
    slug: `live-${startDay}-${slugify(t) || "evento"}`,
    title: t.slice(0, 120),
    category: adultCategory(text) as Activity["category"],
    audience: "adulti",
    description: desc.slice(0, 260),
    minAge: 0,
    maxAge: 17,
    multiAgeNote: "",
    setting: "indoor",
    weatherFit: "rain_ok",
    costBand: free ? "free" : "low",
    priceNote: free ? "" : "costo da verificare",
    durationMin: null,
    bookingRequired: /prenotazion|prenotare/i.test(text) ? true : null,
    address: place,
    zone,
    lat: pos ? pos[0] : ZONES[zone].lat,
    lng: pos ? pos[1] : ZONES[zone].lng,
    openingNote: "",
    sourceUrl: /^https?:\/\//.test(url) ? url : ATTRIBUTION,
    status: "da_verificare",
    isDemo: false,
    event: {
      date: startDay,
      endDate: endDay !== startDay ? endDay : null,
      startTime: s.time,
      endTime: e.time,
      organizer: "Agenda Cultura · Comune di Bologna",
      origin: "agenda",
      approxPosition: !pos,
    },
  } as Activity;
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<{ results?: Rec[] }> {
  const res = await fetchImpl(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { results?: Rec[] };
}

/** Adult events of the Bologna agenda between two days (yyyy-mm-dd), up to 300 records. */
export async function fetchLiveAdults(from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<Activity[] | null> {
  for (const base of BASES) {
    const api = `${base}/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
    try {
      const probe = await getJson(`${api}?limit=1`, fetchImpl);
      const first = probe.results?.[0];
      const startKey = first ? pick(first, START)?.key : null;
      if (!startKey) return [];
      const out: Activity[] = [];
      const seen = new Set<string>();
      // Events that started up to 21 days before the window can still be running.
      const since = new Date(Date.parse(from) - 21 * 86400000).toISOString().slice(0, 10);
      const readPages = async (params: Record<string, string>) => {
        for (let offset = 0; offset < 300; offset += 100) {
          const q = new URLSearchParams({ ...params, limit: "100", offset: String(offset) });
          const rows = (await getJson(`${api}?${q}`, fetchImpl)).results ?? [];
          for (const r of rows) {
            const a = toAdult(r, from, to);
            if (a && !seen.has(a.slug)) { seen.add(a.slug); out.push(a); }
          }
          if (rows.length < 100) break;
        }
      };
      try {
        await readPages({ where: `${startKey} >= date'${since}' AND ${startKey} <= date'${to}'`, order_by: startKey });
      } catch {
        // Date filter not supported for this field: newest records, filtered here.
        await readPages({ order_by: `${startKey} DESC` });
      }
      return out;
    } catch {
      /* try the next base */
    }
  }
  return null;
}

interface Cache { at: number; from: string; events: Activity[] }

/** Cached for 6 hours; returns the last good list when offline. */
export async function liveAdults(from: string, to: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Activity[]> {
  let cache: Cache | null = null;
  try {
    cache = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) ?? "null");
  } catch { /* ignore */ }
  if (cache && cache.from === from && now - cache.at < MAX_AGE_MS) return cache.events;
  const fresh = await fetchLiveAdults(from, to, fetchImpl);
  if (fresh) {
    try { globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({ at: now, from, events: fresh })); } catch { /* full */ }
    return fresh;
  }
  return cache?.events.filter((e) => (e.event?.endDate ?? e.event?.date ?? "") >= from) ?? [];
}
