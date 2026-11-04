"use client";

import { useEffect, useMemo, useState } from "react";
import { haversineKm, isAvailable } from "@/lib/engine/engine";
import type { Activity, WeekendWeather } from "@/lib/engine/types";
import { eventWhen } from "@/lib/events/store";
import { currentPosition, reverseName, searchPlaces, type Place } from "@/lib/explore/geo";
import { findPlaces, PLACE_KINDS, type Mode, type OsmPlace } from "@/lib/explore/osm";
import {
  loadFavourites,
  loadHistory,
  placeKey,
  recordSearch,
  saveFavourites,
  suggestions,
  type HistoryEntry,
} from "@/lib/explore/places-store";
import { webSearches } from "@/lib/explore/websearch";
import { getWeekendWeather } from "@/lib/weather/open-meteo";

const RADII = [5, 10, 20, 30, 50];
const km = (d: number) => `${d < 10 ? d.toFixed(1).replace(".", ",") : Math.round(d)} km`;

export function ExplorePanel({
  catalogue,
  events,
  adults,
}: {
  /** Evergreen activities (all areas). */
  catalogue: Activity[];
  /** Family events: approved + candidates. */
  events: Activity[];
  /** Adult events. */
  adults: Activity[];
}) {
  const [place, setPlace] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState<null | "gps" | "search" | "places">(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("famiglia");
  const [radius, setRadius] = useState(20);
  const [kinds, setKinds] = useState<string[]>(["musei", "parchi", "animali"]);
  const [osm, setOsm] = useState<OsmPlace[] | null>(null);
  const [weather, setWeather] = useState<WeekendWeather | null>(null);
  const [favs, setFavs] = useState<Place[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      setFavs(loadFavourites());
      setHistory(loadHistory());
    });
  }, []);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    getWeekendWeather({ lat: place.lat, lng: place.lng }).then((w) => alive && setWeather(w));
    return () => { alive = false; };
  }, [place]);

  const kindsForMode = PLACE_KINDS.filter((k) => k.mode === mode || k.mode === "tutti");

  function choose(p: Place) {
    setPlace(p);
    setResults([]);
    setQuery("");
    setOsm(null);
    setError(null);
    setHistory((h) => recordSearch(h, p));
  }

  async function useGps() {
    setBusy("gps");
    setError(null);
    try {
      const pos = await currentPosition();
      choose(await reverseName(pos.lat, pos.lng));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Posizione non disponibile");
    } finally {
      setBusy(null);
    }
  }

  async function doSearch() {
    setBusy("search");
    setError(null);
    try {
      const r = await searchPlaces(query);
      setResults(r);
      if (r.length === 0) setError("Nessuna località trovata con questo nome.");
    } catch {
      setError("Ricerca della località non disponibile: controlla la connessione.");
    } finally {
      setBusy(null);
    }
  }

  async function doPlaces() {
    if (!place) return;
    setBusy("places");
    setError(null);
    try {
      setOsm(await findPlaces(PLACE_KINDS.filter((k) => kinds.includes(k.id)), place.lat, place.lng, radius));
    } catch (e) {
      setOsm(null);
      setError(e instanceof Error ? e.message : "Ricerca luoghi non riuscita");
    } finally {
      setBusy(null);
    }
  }

  function toggleFav(p: Place) {
    const k = placeKey(p);
    const next = favs.some((f) => placeKey(f) === k) ? favs.filter((f) => placeKey(f) !== k) : [...favs, { name: p.name, detail: p.detail, lat: p.lat, lng: p.lng }];
    setFavs(next);
    saveFavourites(next);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setKinds(m === "famiglia" ? ["musei", "parchi", "animali"] : ["live", "teatri", "club"]);
    setOsm(null);
  }

  // From our own lists: what lies within the radius of the chosen place.
  const ours = useMemo(() => {
    if (!place || !weather) return [];
    const near = (a: Activity) => a.lat != null && a.lng != null && haversineKm(place.lat, place.lng, a.lat, a.lng) <= radius;
    const list = mode === "famiglia" ? [...events, ...catalogue] : adults;
    return list
      .filter((a) => near(a) && isAvailable(a, weather.saturday, weather.sunday))
      .map((a) => ({ a, d: haversineKm(place.lat, place.lng, a.lat!, a.lng!) }))
      .sort((x, y) => Number(Boolean(y.a.event)) - Number(Boolean(x.a.event)) || x.d - y.d)
      .slice(0, 12);
  }, [place, weather, radius, mode, events, catalogue, adults]);

  const isFav = place ? favs.some((f) => placeKey(f) === placeKey(place)) : false;
  const suggest = suggestions(history, favs);
  const searches = place && weather?.saturday && weather.sunday ? webSearches(place.name, mode, weather.saturday, weather.sunday) : [];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-extrabold">Esplora ovunque</h2>

        {favs.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Località preferite">
            {favs.map((f) => (
              <button key={placeKey(f)} onClick={() => choose(f)} className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold">
                <Star filled /> {f.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={useGps} disabled={busy !== null} className="flex items-center gap-1.5 rounded-full bg-shell px-4 py-2 text-sm font-semibold text-on-shell disabled:opacity-50">
            <Pin /> {busy === "gps" ? "Cerco la posizione…" : "Vicino a me"}
          </button>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => { e.preventDefault(); if (query.trim()) void doSearch(); }}
          >
            <input
              id="ex-query"
              aria-label="Località"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Città o paese, es. Riccione"
              className="field min-w-0 flex-1"
              style={{ backgroundImage: "none", paddingRight: "0.7rem" }}
            />
            <button type="submit" disabled={!query.trim() || busy !== null} className="rounded-full border border-line px-3 text-sm disabled:opacity-40">
              {busy === "search" ? "…" : "Cerca"}
            </button>
          </form>
        </div>

        {results.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {results.map((r) => (
              <li key={placeKey(r)}>
                <button onClick={() => choose(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2">
                  <span className="font-semibold">{r.name}</span> <span className="text-ink-2">{r.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {suggest.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3 text-sm">
            {suggest.map((s) => (
              <div key={placeKey(s)} className="flex flex-wrap items-center justify-between gap-2">
                <span>Cerchi spesso <strong>{s.name}</strong> ({s.count} volte).</span>
                <button onClick={() => toggleFav(s)} className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-sm font-semibold">
                  <Star /> Aggiungi ai preferiti
                </button>
              </div>
            ))}
          </div>
        )}

        {place && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="min-w-0">
              <span className="font-extrabold">{place.name}</span> <span className="text-sm text-ink-2">{place.detail}</span>
              {weather && weather.source === "open-meteo" && (
                <span className="num block text-xs text-ink-2">
                  Weekend: {weather.rainy ? `pioggia ${weather.rainProbability}%` : `asciutto${weather.tempMax != null ? `, max ${weather.tempMax}°` : ""}`}
                </span>
              )}
            </p>
            <button
              onClick={() => toggleFav(place)}
              aria-pressed={isFav}
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${isFav ? "border-accent bg-accent font-semibold" : "border-line"}`}
            >
              <Star filled={isFav} /> {isFav ? "Preferito" : "Salva"}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-warn">{error}</p>}
      </section>

      {place && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div role="group" aria-label="Per chi" className="flex gap-1 rounded-xl bg-surface-2 p-1">
              {(["famiglia", "adulti"] as Mode[]).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${mode === m ? "bg-surface font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-ink-2"}`}
                >
                  {m === "famiglia" ? "Famiglia" : "Adulti"}
                </button>
              ))}
            </div>
            <label htmlFor="ex-radius" className="flex flex-col gap-1 text-xs text-ink-2">
              Entro
              <select id="ex-radius" value={radius} onChange={(e) => { setRadius(Number(e.target.value)); setOsm(null); }} className="field num">
                {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
            </label>
          </div>
          <div role="group" aria-label="Cosa cercare" className="flex flex-wrap gap-1.5">
            {kindsForMode.map((k) => {
              const on = kinds.includes(k.id);
              return (
                <button
                  key={k.id}
                  aria-pressed={on}
                  onClick={() => { setKinds((ks) => (on ? ks.filter((x) => x !== k.id) : [...ks, k.id])); setOsm(null); }}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-shell bg-shell font-semibold text-on-shell" : "border-line"}`}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
          <button onClick={doPlaces} disabled={busy !== null || kinds.length === 0} className="self-start rounded-full bg-shell px-5 py-2.5 text-sm font-semibold text-on-shell disabled:opacity-50">
            {busy === "places" ? "Cerco i luoghi…" : `Cerca luoghi vicino a ${place.name}`}
          </button>
        </section>
      )}

      {place && ours.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-extrabold">Dal nostro elenco <span className="num text-ink-2">· {ours.length}</span></h3>
          <ul className="flex flex-col gap-2">
            {ours.map(({ a, d }) => (
              <li key={a.slug} className="rounded-2xl border border-line bg-surface p-3">
                {a.event && <p className="num text-xs font-semibold text-coral">{eventWhen(a)}</p>}
                <p className="font-semibold leading-snug">
                  {a.sourceUrl ? <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{a.title}</a> : a.title}
                </p>
                <p className="num text-xs text-ink-2">{[km(d), a.address || a.zone, a.status !== "published" ? "da verificare" : null].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {osm && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-extrabold">Luoghi vicini <span className="num text-ink-2">· {osm.length}</span></h3>
          {osm.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">Nessun luogo trovato: allarga il raggio o scegli altri tipi.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {osm.slice(0, 40).map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{p.name}</p>
                    <p className="num text-xs text-ink-2">{km(p.distanceKm)} · {p.kind}{p.openingHours ? ` · ${p.openingHours}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">Mappa</a>
                    {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">Sito</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-2">Luoghi © OpenStreetMap contributors (ODbL). Orari e aperture da verificare.</p>
        </section>
      )}

      {searches.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-extrabold">Eventi del weekend sul web</h3>
          <p className="text-xs text-ink-2">Ricerche pronte per {place?.name}, con le date del weekend già inserite.</p>
          <div className="flex flex-wrap gap-1.5">
            {searches.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-ink-2">
                {s.label} ↗
              </a>
            ))}
          </div>
        </section>
      )}

      {!place && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-2">
          Usa «Vicino a me» o scrivi una località: trovi luoghi da visitare, gli eventi che abbiamo già raccolto e le ricerche pronte per il weekend.
        </p>
      )}
    </div>
  );
}

function Star({ filled }: { filled?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
    </svg>
  );
}
function Pin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}
