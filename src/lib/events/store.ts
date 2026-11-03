import type { Activity, Category, CostBand, Setting } from "@/lib/engine/types";
import { ZONES, type ZoneName } from "@/data/zones";
import { durableSet, localGet } from "@/lib/persist";

/**
 * Founder-only event store, kept on the device (localStorage inside the app).
 * Phase E2 moves it to Supabase so the web tool and the Friday email share it.
 */

const KEY = "wf.events.v1";
const REJECTED_KEY = "wf.events.rejected.v1";
const IMPORTED_KEY = "wf.events.imported.v1";

export interface EventStoreData {
  events: Activity[];
  rejected: string[];
}

// Durable: mirrored to Android Preferences so updates keep the data (see lib/persist.ts).
const safeGet = localGet;
const safeSet = durableSet;

export function loadStore(): EventStoreData {
  const parse = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };
  const events = parse<Activity[]>(safeGet(KEY), []).filter((e) => e && e.slug && e.event);
  const rejected = parse<string[]>(safeGet(REJECTED_KEY), []);
  return { events, rejected };
}

export function saveStore(data: EventStoreData) {
  safeSet(KEY, JSON.stringify(data.events));
  safeSet(REJECTED_KEY, JSON.stringify(data.rejected));
}

/** Candidates imported from the weekly email ("codice eventi"), kept on the phone. */
export interface ImportedCandidates {
  generatedAt: string | null;
  events: Activity[];
}

export function loadImported(): ImportedCandidates {
  try {
    const raw = safeGet(IMPORTED_KEY);
    if (!raw) return { generatedAt: null, events: [] };
    const v = JSON.parse(raw) as ImportedCandidates;
    return { generatedAt: v.generatedAt ?? null, events: Array.isArray(v.events) ? v.events : [] };
  } catch {
    return { generatedAt: null, events: [] };
  }
}

export function saveImported(v: ImportedCandidates) {
  safeSet(IMPORTED_KEY, JSON.stringify(v));
}

/**
 * Reads the "codice eventi" pasted from the email. Accepts the whole email text too:
 * it looks for the JSON object between the first "{" and the last "}".
 */
export function parseImportCode(text: string): ImportedCandidates | { error: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { error: "Non trovo il codice: copia tutto il riquadro «Codice eventi» della mail." };
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { error: "Il codice è incompleto: copialo di nuovo con il pulsante copia del riquadro." };
  }
  const d = data as { wf?: number; generatedAt?: string; events?: Partial<Activity>[] };
  if (d.wf !== 1 || !Array.isArray(d.events)) return { error: "Questo non è un codice eventi di Weekend in Famiglia." };
  const events: Activity[] = d.events
    .filter((e) => e && typeof e.slug === "string" && typeof e.title === "string" && e.event?.date)
    .map((e) => ({
      category: "festa",
      description: "",
      minAge: 0,
      maxAge: 17,
      multiAgeNote: "",
      setting: "mixed",
      weatherFit: "any",
      costBand: "free",
      priceNote: "",
      durationMin: null,
      bookingRequired: null,
      address: "",
      zone: "",
      lat: null,
      lng: null,
      openingNote: "",
      sourceUrl: "",
      isDemo: false,
      ...e,
      status: "da_verificare",
    }) as Activity);
  return { generatedAt: d.generatedAt ?? null, events };
}

/** Bundled candidates (from the APK) + imported ones; the newer list wins on the same event. */
export function mergeCandidates(bundled: Activity[], bundledAt: string | null, imported: ImportedCandidates): Activity[] {
  const importedNewer = (imported.generatedAt ?? "") >= (bundledAt ?? "");
  const map = new Map<string, Activity>();
  for (const c of importedNewer ? [...bundled, ...imported.events] : [...imported.events, ...bundled]) map.set(c.slug, c);
  return [...map.values()];
}

export function upsertEvent(data: EventStoreData, ev: Activity): EventStoreData {
  const events = data.events.some((e) => e.slug === ev.slug)
    ? data.events.map((e) => (e.slug === ev.slug ? ev : e))
    : [...data.events, ev];
  return { ...data, events };
}

export function removeEvent(data: EventStoreData, slug: string): EventStoreData {
  return { ...data, events: data.events.filter((e) => e.slug !== slug) };
}

export function rejectCandidate(data: EventStoreData, slug: string): EventStoreData {
  return { ...data, rejected: [...new Set([...data.rejected, slug])] };
}

/** Candidates from the automatic agenda reading that are still waiting for a decision. */
export function pendingCandidates(candidates: Activity[], data: EventStoreData, today: string): Activity[] {
  const decided = new Set([...data.rejected, ...data.events.map((e) => e.slug)]);
  return candidates.filter((c) => !decided.has(c.slug) && c.event && (c.event.endDate ?? c.event.date) >= today);
}

export interface EventForm {
  slug?: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  zone: ZoneName;
  minAge: number;
  maxAge: number;
  costBand: CostBand;
  setting: Setting;
  category: Category;
  sourceUrl: string;
  organizer: string;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Builds a published event from the "Aggiungi evento" form (manual = already checked by the founder). */
export function formToEvent(f: EventForm, origin: "agenda" | "manuale" = "manuale"): Activity {
  const z = ZONES[f.zone];
  return {
    slug: f.slug ?? `ev-${f.date}-${slugify(f.title) || "evento"}`,
    title: f.title.trim(),
    category: f.category,
    description: f.description.trim(),
    minAge: Math.min(f.minAge, f.maxAge),
    maxAge: Math.max(f.minAge, f.maxAge),
    multiAgeNote: "",
    setting: f.setting,
    weatherFit: f.setting === "indoor" ? "rain_ok" : f.setting === "outdoor" ? "dry_only" : "any",
    costBand: f.costBand,
    priceNote: "",
    durationMin: null,
    bookingRequired: null,
    address: f.place.trim(),
    zone: f.zone,
    lat: z.lat,
    lng: z.lng,
    openingNote: "",
    sourceUrl: f.sourceUrl.trim(),
    status: "published",
    isDemo: false,
    event: {
      date: f.date,
      endDate: null,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
      organizer: f.organizer.trim() || null,
      origin,
      approxPosition: true,
    },
  };
}

export function eventToForm(a: Activity): EventForm {
  return {
    slug: a.slug,
    title: a.title,
    description: a.description,
    date: a.event?.date ?? "",
    startTime: a.event?.startTime ?? "",
    endTime: a.event?.endTime ?? "",
    place: a.address,
    zone: (a.zone in ZONES ? a.zone : nearestZone(a.lat, a.lng)) as ZoneName,
    minAge: a.minAge,
    maxAge: a.maxAge,
    costBand: a.costBand,
    setting: a.setting,
    category: a.category,
    sourceUrl: a.sourceUrl,
    organizer: a.event?.organizer ?? "",
  };
}

/** Zone closest to a point (events read from listings carry a comune, not a zone). */
export function nearestZone(lat: number | null, lng: number | null): ZoneName {
  let best: ZoneName = "Borgo Panigale-Reno";
  if (lat == null || lng == null) return best;
  let bestD = Infinity;
  for (const [name, z] of Object.entries(ZONES) as [ZoneName, (typeof ZONES)[ZoneName]][]) {
    const d = Math.hypot((lat - z.lat) * 111, (lng - z.lng) * 79);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

const DAY = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** "dom 8 nov · 15:00–18:00" */
export function eventWhen(a: Activity): string {
  if (!a.event) return "";
  const d = a.event.endDate
    ? `${DAY.format(new Date(`${a.event.date}T12:00:00`))} → ${DAY.format(new Date(`${a.event.endDate}T12:00:00`))}`
    : DAY.format(new Date(`${a.event.date}T12:00:00`));
  const t = a.event.startTime ? ` · ${a.event.startTime}${a.event.endTime ? `–${a.event.endTime}` : ""}` : "";
  return `${d}${t}`;
}
