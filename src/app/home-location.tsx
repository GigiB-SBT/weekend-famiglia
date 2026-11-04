"use client";

import { useEffect, useState } from "react";
import { currentPosition, reverseName, searchPlaces, type Place } from "@/lib/explore/geo";
import { loadFavourites, loadHistory, placeKey, recordSearch } from "@/lib/explore/places-store";
import { durableSet, localGet } from "@/lib/persist";

const START_KEY = "wf.home.start.v1";

/** Saved starting point for the home proposals (null = the chosen zone). */
export function loadStart(): Place | null {
  try {
    const raw = localGet(START_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}
export function saveStart(p: Place | null) {
  durableSet(START_KEY, p ? JSON.stringify(p) : "");
}

/**
 * "Da dove partite": the zone, the phone's position, a favourite place or any town.
 * Proposals, distances and weather follow the chosen point.
 */
export function StartPicker({ start, zone, onStart }: { start: Place | null; zone: string; onStart: (p: Place | null) => void }) {
  const [favs, setFavs] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState<null | "gps" | "search">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setFavs(loadFavourites()));
  }, []);

  function pick(p: Place) {
    recordSearch(loadHistory(), p);
    onStart(p);
    setOpen(false);
    setResults([]);
    setQuery("");
    setError(null);
  }

  async function gps() {
    setBusy("gps");
    setError(null);
    try {
      const pos = await currentPosition();
      pick(await reverseName(pos.lat, pos.lng));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Posizione non disponibile");
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    setBusy("search");
    setError(null);
    try {
      const r = await searchPlaces(query);
      setResults(r);
      if (!r.length) setError("Nessuna località trovata.");
    } catch {
      setError("Ricerca non disponibile: controlla la connessione.");
    } finally {
      setBusy(null);
    }
  }

  const chip = (on: boolean) =>
    `flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 ${on ? "border-shell bg-shell font-semibold text-on-shell" : "border-line hover:border-ink-2"}`;
  const startKey = start ? placeKey(start) : null;
  const favShown = favs.filter((f) => placeKey(f) !== startKey);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Da dove partite</h2>
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(!start)} aria-pressed={!start} onClick={() => onStart(null)}>{zone}</button>
        <button className={chip(false)} onClick={gps} disabled={busy !== null}>
          <Pin /> {busy === "gps" ? "Cerco…" : "Vicino a me"}
        </button>
        {start && (
          <button className={chip(true)} aria-pressed onClick={() => undefined}>
            <Pin /> {start.name}
          </button>
        )}
        {favShown.map((f) => (
          <button key={placeKey(f)} className={chip(false)} onClick={() => pick(f)}>★ {f.name}</button>
        ))}
        <button className={chip(open)} aria-expanded={open} onClick={() => setOpen((o) => !o)}>Altrove…</button>
      </div>
      {open && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (query.trim()) void search(); }}>
          <input
            aria-label="Località di partenza"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Città o paese"
            className="field min-w-0 flex-1"
            style={{ backgroundImage: "none", paddingRight: "0.7rem" }}
            autoFocus
          />
          <button type="submit" disabled={!query.trim() || busy !== null} className="rounded-full border border-line px-3 text-sm disabled:opacity-40">
            {busy === "search" ? "…" : "Cerca"}
          </button>
        </form>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {results.map((r) => (
            <li key={placeKey(r)}>
              <button onClick={() => pick(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="font-semibold">{r.name}</span> <span className="text-ink-2">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-warn">{error}</p>}
    </div>
  );
}

function Pin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}
