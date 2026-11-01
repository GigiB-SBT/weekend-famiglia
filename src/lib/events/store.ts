import type { Activity, Category, CostBand, Setting } from "@/lib/engine/types";
import { ZONES, type ZoneName } from "@/data/zones";

/**
 * Founder-only event store, kept on the device (localStorage inside the app).
 * Phase E2 moves it to Supabase so the web tool and the Friday email share it.
 */

const KEY = "wf.events.v1";
const REJECTED_KEY = "wf.events.rejected.v1";

export interface EventStoreData {
  events: Activity[];
  rejected: string[];
}

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

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
    zone: (a.zone in ZONES ? a.zone : "Santo Stefano") as ZoneName,
    minAge: a.minAge,
    maxAge: a.maxAge,
    costBand: a.costBand,
    setting: a.setting,
    category: a.category,
    sourceUrl: a.sourceUrl,
    organizer: a.event?.organizer ?? "",
  };
}

const DAY = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** "dom 8 nov · 15:00–18:00" */
export function eventWhen(a: Activity): string {
  if (!a.event) return "";
  const d = DAY.format(new Date(`${a.event.date}T12:00:00`));
  const t = a.event.startTime ? ` · ${a.event.startTime}${a.event.endTime ? `–${a.event.endTime}` : ""}` : "";
  return `${d}${t}`;
}
