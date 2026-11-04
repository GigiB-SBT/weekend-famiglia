"use client";

import { useMemo, useState } from "react";
import { AREA_IDS, AREAS, ZONES, zonesOf, type AreaId, type ZoneName } from "@/data/zones";
import { haversineKm } from "@/lib/engine/engine";
import type { Activity, WeekendWeather } from "@/lib/engine/types";
import { eventWhen } from "@/lib/events/store";
import { durableSet, localGet } from "@/lib/persist";

/** Kinds shown as filter chips. Each groups one or more catalogue categories. */
const KINDS = [
  { id: "cultura", label: "Cultura", cats: ["museo", "incontro", "biblioteca"] },
  { id: "concerti", label: "Concerti live", cats: ["musica"] },
  { id: "spettacoli", label: "Teatro e spettacoli", cats: ["spettacolo"] },
  { id: "notte", label: "Notte", cats: ["notte"] },
  { id: "gusto", label: "Gusto", cats: ["gusto"] },
  { id: "feste", label: "Sagre e feste", cats: ["festa"] },
  { id: "fuori", label: "All'aria aperta", cats: ["natura", "gita"] },
] as const;
type KindId = (typeof KINDS)[number]["id"];

const KIND_OF: Record<string, KindId> = Object.fromEntries(KINDS.flatMap((k) => k.cats.map((c) => [c, k.id])));
const SAVED_KEY = "wf.adults.saved.v1";

function loadSaved(): string[] {
  try {
    return JSON.parse(localGet(SAVED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdultsPanel({
  items,
  area,
  weather,
  today,
}: {
  /** Adult events + events for everyone (sagre, feste). */
  items: Activity[];
  area: AreaId;
  weather: WeekendWeather | null;
  today: string;
}) {
  const [kinds, setKinds] = useState<KindId[]>([]);
  const [when, setWhen] = useState<"weekend" | "15gg">("weekend");
  const [zoneFilter, setZoneFilter] = useState<ZoneName | "all">("all");
  const [maxKm, setMaxKm] = useState(20);
  const [saved, setSaved] = useState<string[]>(() => loadSaved());
  const [onlySaved, setOnlySaved] = useState(false);

  const zoneSel = zoneFilter !== "all" && ZONES[zoneFilter]?.area === area ? zoneFilter : "all";
  // Weekend = Friday evening to Sunday.
  const sat = weather?.saturday ?? null;
  const range = useMemo<[string, string] | null>(
    () => (when === "weekend" ? (sat ? [addDays(sat, -1), addDays(sat, 1)] : null) : today ? [today, addDays(today, 15)] : null),
    [when, sat, today],
  );

  const list = useMemo(() => {
    if (!range) return [];
    return items
      .filter((a) => a.event && a.event.date <= range[1] && (a.event.endDate ?? a.event.date) >= range[0])
      .filter((a) => {
        if (a.lat == null || a.lng == null) return zoneSel === "all";
        const nearest = AREA_IDS.reduce((b, id) =>
          haversineKm(a.lat!, a.lng!, AREAS[id].lat, AREAS[id].lng) < haversineKm(a.lat!, a.lng!, AREAS[b].lat, AREAS[b].lng) ? id : b,
        );
        if (nearest !== area) return false;
        return zoneSel === "all" || haversineKm(a.lat, a.lng, ZONES[zoneSel].lat, ZONES[zoneSel].lng) <= maxKm;
      })
      .filter((a) => kinds.length === 0 || kinds.includes(KIND_OF[a.category] ?? "cultura"))
      .filter((a) => !onlySaved || saved.includes(a.slug))
      .sort((a, b) => (a.event!.date + (a.event!.startTime ?? "99")).localeCompare(b.event!.date + (b.event!.startTime ?? "99")));
  }, [items, range, area, zoneSel, maxKm, kinds, onlySaved, saved]);

  function toggleKind(k: KindId) {
    setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  }
  function toggleSaved(slug: string) {
    setSaved((s) => {
      const next = s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug];
      durableSet(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }

  // Group by day for scanning.
  const byDay = new Map<string, Activity[]>();
  for (const a of list) {
    const d = a.event!.date < (range?.[0] ?? "") ? range![0] : a.event!.date; // multi-day already running: show on first day of range
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">Per voi adulti</h2>
          <span className="text-xs text-ink-2">{AREAS[area].label}</span>
        </div>
        <div role="group" aria-label="Tipo" className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const on = kinds.includes(k.id);
            return (
              <button
                key={k.id}
                aria-pressed={on}
                onClick={() => toggleKind(k.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 ${
                  on ? "border-shell bg-shell font-semibold text-on-shell" : "border-line hover:border-ink-2"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div role="group" aria-label="Quando" className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {([["weekend", "Questo weekend"], ["15gg", "Prossimi 15 giorni"]] as const).map(([v, l]) => (
              <button
                key={v}
                aria-pressed={when === v}
                onClick={() => setWhen(v)}
                className={`rounded-lg px-3 py-1.5 text-sm ${when === v ? "bg-surface font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-ink-2"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label htmlFor="ad-zone" className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-2">
            Zona
            <select id="ad-zone" value={zoneSel} onChange={(e) => setZoneFilter(e.target.value as ZoneName | "all")} className="field">
              <option value="all">Tutta l&apos;area</option>
              {zonesOf(area).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          {zoneSel !== "all" && (
            <label htmlFor="ad-km" className="flex flex-col gap-1 text-xs text-ink-2">
              Entro
              <select id="ad-km" value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} className="field num">
                {[5, 10, 20, 30, 50].map((k) => <option key={k} value={k}>{k} km</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input id="ad-saved" type="checkbox" checked={onlySaved} onChange={(e) => setOnlySaved(e.target.checked)} />
          Solo i salvati <span className="num text-ink-2">({saved.length})</span>
        </label>
      </section>

      {!range ? (
        <p className="text-sm text-ink-2">Carico…</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-2">
          Nessun evento con questi filtri. Prova «Prossimi 15 giorni», un altro tipo o tutta l&apos;area. Gli eventi si aggiornano ogni mercoledì.
        </p>
      ) : (
        [...byDay.entries()].map(([day, evs]) => (
          <section key={day} className="flex flex-col gap-2">
            <h3 className="text-sm font-extrabold capitalize">{dayLabel(day)}</h3>
            <ul className="flex flex-col gap-2">
              {evs.map((a) => {
                const isSaved = saved.includes(a.slug);
                return (
                  <li key={a.slug} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="num text-xs font-semibold text-coral">
                        {eventWhen(a)} · {KINDS.find((k) => k.id === (KIND_OF[a.category] ?? "cultura"))?.label}
                      </p>
                      <p className="font-semibold leading-snug">
                        {a.sourceUrl ? (
                          <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{a.title}</a>
                        ) : (
                          a.title
                        )}
                      </p>
                      <p className="text-xs text-ink-2">
                        {[a.address || a.zone, a.audience === "tutti" ? "anche per famiglie" : null, a.status !== "published" ? "da verificare" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <button
                      aria-label={isSaved ? `Rimuovi ${a.title} dai salvati` : `Salva ${a.title}`}
                      aria-pressed={isSaved}
                      onClick={() => toggleSaved(a.slug)}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                        isSaved ? "border-accent bg-accent text-ink" : "border-line text-ink-2 hover:text-ink"
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="text-xs text-ink-2">
        Fonti: Agenda Cultura del Comune di Bologna (CC BY-SA 4.0), siti di sagre, parrocchie e Pro Loco. Orari e prezzi sono da verificare sul link.
      </p>
    </div>
  );
}
