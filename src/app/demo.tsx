"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import seed from "@/data/seed-activities.json";
import { DEMO_FAMILIES } from "@/data/demo-families";
import { AREA_IDS, AREAS, ZONE_NAMES, ZONES, areaOfZone, zonesOf, type AreaId, type ZoneName } from "@/data/zones";
import { haversineKm, recommend } from "@/lib/engine/engine";
import type { Place } from "@/lib/explore/geo";
import { placeKey } from "@/lib/explore/places-store";
import { StartPicker, loadAges, loadStart, saveAges, saveStart } from "./home-location";
import { cachedPhoto, findPhoto, type Photo } from "@/lib/photos";
import type {
  Activity,
  Family,
  FamilyBudget,
  ScoredActivity,
  SettingPreference,
  WeekendWeather,
} from "@/lib/engine/types";
import { agesLabel, buildDraft } from "@/lib/mail/draft";
import { buildHtml, KID_COLORS } from "@/lib/mail/html";
import { fallbackWeather, getWeekendWeather } from "@/lib/weather/open-meteo";
import candidatesJson from "@/data/event-candidates.json";
import candidatesMeta from "@/data/event-candidates-meta.json";
import adultsJson from "@/data/event-adults.json";
import {
  eventWhen,
  loadImported,
  loadStore,
  mergeCandidates,
  pendingCandidates,
  saveImported,
  saveStore,
  type EventStoreData,
  type ImportedCandidates,
} from "@/lib/events/store";
import { EventsPanel } from "./events-panel";
import { AdultsPanel } from "./adults-panel";
import { ExplorePanel } from "./explore-panel";
import { hydrate } from "@/lib/persist";
import { fetchRemoteEvents, isNewer } from "@/lib/events/remote";
import { liveAdults } from "@/lib/events/live-agenda";
import { CURRENT_BUILD, checkUpdate, isNativeApp, type UpdateInfo } from "@/lib/update";

const ACTIVITIES = seed as Activity[];
const CANDIDATES = candidatesJson as Activity[];
const CANDIDATES_AT = (candidatesMeta as { generatedAt: string | null }).generatedAt;
const ADULTS = adultsJson as Activity[];
const MAX_CHILDREN = 8;
const BASE = DEMO_FAMILIES[0];

const BUDGETS: { v: FamilyBudget; l: string }[] = [
  { v: "free", l: "Solo gratis" },
  { v: "upto20", l: "Fino a 20 €" },
  { v: "20to50", l: "20–50 €" },
  { v: "over50", l: "Oltre 50 €" },
];
const PREFS: { v: SettingPreference; l: string }[] = [
  { v: "any", l: "Indifferente" },
  { v: "outdoor", l: "Preferibilmente all'aperto" },
  { v: "indoor", l: "Preferibilmente al coperto" },
];
const RADII = [5, 10, 20, 30, 50, 80];
const COST_LABEL = { free: "Gratis", low: "fino a 10 € a testa", mid: "10–25 € a testa", high: "oltre 25 € a testa" };

type RainMode = "live" | "dry" | "rain";

export function Demo() {
  const [ages, setAges] = useState<number[]>(BASE.childrenAges);
  const [zone, setZone] = useState<ZoneName>(BASE.zone as ZoneName);
  const area: AreaId = areaOfZone(zone);
  // Starting point for the proposals: a place (GPS, favourite, town) or, if null, the zone.
  const [start, setStart] = useState<Place | null>(null);
  const [weatherByKey, setWeatherByKey] = useState<Record<string, WeekendWeather>>({});
  const [radiusKm, setRadiusKm] = useState(BASE.radiusKm);
  const [budget, setBudget] = useState<FamilyBudget>(BASE.budget);
  const [preference, setPreference] = useState<SettingPreference>(BASE.preference);
  const [liveWeather, setLiveWeather] = useState<WeekendWeather | null>(null);
  const [placeholder, setPlaceholder] = useState<WeekendWeather | null>(null);
  const [rainMode, setRainMode] = useState<RainMode>("live");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("weekend");
  const [store, setStore] = useState<EventStoreData>({ events: [], rejected: [] });
  const [imported, setImported] = useState<ImportedCandidates>({ generatedAt: null, events: [] });
  const [today, setToday] = useState<string>("");
  const [sync, setSync] = useState<string>("busy");
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    // Date-dependent values are computed only in the browser (no prerender clock).
    queueMicrotask(() => {
      if (!alive) return;
      setPlaceholder(fallbackWeather());
      // Restore saved events from durable storage (survives app updates), then read them.
      void hydrate().finally(() => {
        if (!alive) return;
        setStore(loadStore());
        setImported(loadImported());
        setReady(true);
        const s = loadStart();
        if (s) setStart(s);
        const savedAges = loadAges();
        if (savedAges) setAges(savedAges);
        else setEditing(true);
      });
      const d = new Date();
      setToday(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    });
    return () => { alive = false; };
  }, []);

  // Automatic updates: weekly events from GitHub (merged only if newer than what the
  // phone has; approved/rejected events are never touched) and the APK version.
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [live, setLive] = useState<Activity[]>([]);
  const refreshOnline = useCallback(async () => {
    setSync("busy");
    const r = await fetchRemoteEvents();
    if (r.ok && isNewer(r.data, loadImported())) {
      setImported(r.data);
      saveImported(r.data);
    }
    setSync(r.ok ? "ok" : r.reason);
    // Adults: live Bologna agenda for the next 15 days (works even without the weekly run).
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    setLive(await liveAdults(day(now), day(new Date(now.getTime() + 15 * 86400000))));
    if (await isNativeApp()) setUpdate(await checkUpdate());
  }, []);

  // At every start, once saved data has been restored.
  useEffect(() => {
    if (ready) queueMicrotask(() => void refreshOnline());
  }, [ready, refreshOnline]);

  // Also when the app comes back to the foreground (at most every 30 minutes).
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30 * 60_000) return;
      last = Date.now();
      void refreshOnline();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshOnline]);

  // Weather where the family starts from (a chosen place, else the area); fetched once per point.
  const weatherKey = start ? placeKey(start) : area;
  useEffect(() => {
    if (weatherByKey[weatherKey]) {
      queueMicrotask(() => setLiveWeather(weatherByKey[weatherKey] ?? null));
      return;
    }
    let alive = true;
    const at = start ?? AREAS[area];
    getWeekendWeather({ lat: at.lat, lng: at.lng }).then((w) => {
      if (!alive) return;
      setWeatherByKey((m) => ({ ...m, [weatherKey]: w }));
      setLiveWeather(w);
    });
    return () => { alive = false; };
  }, [weatherKey, start, area, weatherByKey]);

  function chooseStart(p: Place | null) {
    setStart(p);
    saveStart(p);
    if (!p) return;
    // Near one of our areas: align the zone (and so the Adulti/Eventi tabs) with it.
    const nearest = ZONE_NAMES.map((z) => ({ z, d: haversineKm(p.lat, p.lng, ZONES[z].lat, ZONES[z].lng) })).sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d <= 60) setZone(nearest.z);
  }

  const weather: WeekendWeather | null = useMemo(() => {
    const w = liveWeather ?? placeholder;
    if (!w) return null;
    if (rainMode === "dry") return { ...w, rainy: false, rainProbability: 10, source: "open-meteo" };
    if (rainMode === "rain") return { ...w, rainy: true, rainProbability: 85, source: "open-meteo" };
    return w;
  }, [liveWeather, placeholder, rainMode]);

  const family: Family = useMemo(
    () => ({
      id: "demo",
      email: BASE.email,
      zone: start ? start.name : zone,
      lat: start ? start.lat : ZONES[zone].lat,
      lng: start ? start.lng : ZONES[zone].lng,
      radiusKm,
      childrenAges: ages,
      budget,
      preference,
      interests: [],
    }),
    [ages, zone, start, radiusKm, budget, preference],
  );

  const candidates = useMemo(() => mergeCandidates(CANDIDATES, CANDIDATES_AT, imported), [imported]);
  // Adults: adult agenda events + anything for everyone (sagre, feste) found online or approved by hand.
  const adultItems = useMemo(() => {
    const adults = mergeCandidates(ADULTS, CANDIDATES_AT, imported, "adults");
    // From the family lists only what is really for grown-ups too: events the founder
    // marked "adulti", plus sagre and food events open to everyone. Kids' workshops,
    // shows and parish games stay in the Famiglia tab.
    const forAll = [...candidates, ...store.events].filter(
      (e) => e.audience === "adulti" || (e.audience === "tutti" && (e.category === "festa" || e.category === "gusto")),
    );
    // One entry per title and day (the same agenda event can come from GitHub and live).
    const map = new Map<string, Activity>();
    const key = (a: Activity) => `${a.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${a.event?.date ?? a.slug}`;
    for (const a of [...live, ...adults, ...forAll]) map.set(key(a), a);
    return [...map.values()];
  }, [candidates, imported, store, live]);
  const updatedAt = [CANDIDATES_AT, imported.generatedAt].filter(Boolean).sort().pop() ?? null;
  const pending = useMemo(() => (today ? pendingCandidates(candidates, store, today) : []), [candidates, store, today]);
  // Home proposals: catalogue + approved events + events found online not yet rejected (marked "da verificare").
  const catalogue = useMemo(
    () => [
      ...ACTIVITIES,
      ...store.events.filter((e) => e.status === "published" && e.audience !== "adulti"),
      ...pending.filter((e) => e.audience !== "adulti"),
    ],
    [store, pending],
  );

  function importCandidates(next: ImportedCandidates) {
    setImported(next);
    saveImported(next);
  }
  const rec = useMemo(
    () => (weather ? recommend(family, catalogue, weather, { allowUnverified: true, now: new Date(weather.fetchedAt) }) : null),
    [family, weather, catalogue],
  );

  // Events this weekend within the radius (shown as a hint above the ideas).
  const eventsNear = useMemo(() => {
    if (!weather?.saturday || !weather.sunday) return 0;
    const sat = weather.saturday, sun = weather.sunday;
    return catalogue.filter((a) => {
      if (!a.event || a.lat == null || a.lng == null) return false;
      const end = a.event.endDate ?? a.event.date;
      return a.event.date <= sun && end >= sat && haversineKm(family.lat, family.lng, a.lat, a.lng) <= radiusKm;
    }).length;
  }, [catalogue, weather, family, radiusKm]);

  function updateStore(next: EventStoreData) {
    setStore(next);
    saveStore(next);
  }
  const draft = useMemo(() => (rec ? buildDraft(family, rec) : null), [family, rec]);
  const html = useMemo(() => (rec ? buildHtml(family, rec) : ""), [family, rec]);
  const kidColor = useMemo(() => colorByIndex(ages), [ages]);
  useEffect(() => {
    if (ready) saveAges(ages);
  }, [ages, ready]);

  const setAge = (i: number, d: number) =>
    setAges((a) => a.map((x, j) => (j === i ? Math.min(17, Math.max(0, x + d)) : x)));

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.getElementById("mail-body");
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  return (
    <div className="min-h-full pb-24">
      <header className="bg-shell text-on-shell">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 pt-4">
          <h1 className="font-display text-lg font-extrabold tracking-tight">Weekend in Famiglia</h1>
          {tab !== "weekend" && <WeatherBadge w={weather} live={liveWeather} />}
        </div>
        {tab !== "weekend" && <div className="h-4" />}
        {update && (
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 pt-3 text-sm text-on-shell">
            <span>Nuova versione dell&apos;app disponibile. I tuoi eventi restano salvati.</span>
            <span className="flex gap-2">
              <a href={update.apkUrl} target="_blank" rel="noreferrer" className="rounded-full bg-accent px-3 py-1 font-semibold text-ink">Aggiorna</a>
              <button onClick={() => setUpdate(null)} className="rounded-full px-2 py-1 text-on-shell-2">Dopo</button>
            </span>
          </div>
        )}
        {tab === "weekend" && (
          <WeekendHero w={weather} live={liveWeather} from={start ? start.name : zone} eventsNear={eventsNear} radiusKm={radiusKm} />
        )}
      </header>

      {tab === "esplora" ? (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
          <ExplorePanel
            catalogue={ACTIVITIES.filter((a) => a.status !== "draft")}
            events={[...store.events.filter((e) => e.audience !== "adulti"), ...candidates]}
            adults={adultItems}
          />
        </main>
      ) : tab === "adulti" ? (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
          <AdultsPanel items={adultItems} area={area} weather={weather} today={today} />
        </main>
      ) : tab === "eventi" ? (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
          {today ? <><EventsPanel store={store} onStore={updateStore} pending={pending} today={today} area={area} updatedAt={updatedAt} onImport={importCandidates} sync={sync} onSync={() => void refreshOnline()} />
          <p className="num text-center text-xs text-ink-2">
            {CURRENT_BUILD ? `Versione beta ${CURRENT_BUILD}` : "Versione di sviluppo"} · eventi approvati, scartati e preferiti restano sul telefono anche con gli aggiornamenti
          </p></> : <Skeleton />}
        </main>
      ) : (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="-mt-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-[0_6px_20px_-12px_rgb(16_34_63/0.35)] transition-colors duration-150 hover:border-ink-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex -space-x-1" aria-hidden="true">
                  {ages.map((_, i) => <span key={i} className="h-3 w-3 rounded-full ring-2 ring-surface" style={{ background: kidColor[i] }} />)}
                </span>
                {ages.length ? `Figli di ${agesLabel(ages)}` : "Aggiungi i figli"}
              </span>
              <span className="truncate text-xs text-ink-2">Da {start ? start.name : zone}, entro {radiusKm} km, {BUDGETS.find((b) => b.v === budget)?.l.toLowerCase()}</span>
            </span>
            <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold text-link">Cambia</span>
          </button>
        ) : (
        <section className="-mt-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_6px_20px_-12px_rgb(16_34_63/0.35)]">
          <h2 className="text-sm font-semibold">Età dei figli</h2>
          <div className="flex flex-wrap gap-2">
            {ages.map((age, i) => (
              <div key={i} className="flex items-center rounded-full border border-line bg-ground">
                <StepButton label={`Diminuisci età figlio ${i + 1}`} onClick={() => setAge(i, -1)} disabled={age <= 0}>−</StepButton>
                <span className="num flex min-w-[3.25rem] items-center justify-center gap-1.5 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: kidColor[i] }} />{age} anni</span>
                <StepButton label={`Aumenta età figlio ${i + 1}`} onClick={() => setAge(i, 1)} disabled={age >= 17}>+</StepButton>
                <button
                  aria-label={`Rimuovi figlio ${i + 1}`}
                  onClick={() => setAges((a) => a.filter((_, j) => j !== i))}
                  className="mr-0.5 flex h-7 w-7 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                >
                  <XIcon />
                </button>
              </div>
            ))}
            {ages.length < MAX_CHILDREN && (
              <button
                onClick={() => setAges((a) => [...a, 6])}
                className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-link transition-colors duration-150 hover:border-ink-2"
              >
                + Aggiungi figlio
              </button>
            )}
          </div>

          <div className="border-t border-line pt-3">
            <StartPicker start={start} zone={zone} onStart={chooseStart} />
          </div>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-ink-2 hover:text-ink">
              <Chevron />
              Altri filtri
              <span className="text-ink-2">({radiusKm} km, {BUDGETS.find((b) => b.v === budget)?.l.toLowerCase()})</span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label htmlFor="zone" className="flex flex-col gap-1 text-xs text-ink-2">
                Zona di partenza
                <select id="zone" value={zone} onChange={(e) => { setZone(e.target.value as ZoneName); chooseStart(null); }} className="field">
                  {AREA_IDS.map((a) => (
                    <optgroup key={a} label={AREAS[a].label}>
                      {zonesOf(a).map((z) => <option key={z} value={z}>{z}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <Select id="radius" label="Distanza massima" value={String(radiusKm)} onChange={(v) => setRadiusKm(Number(v))}
                options={RADII.map((r) => ({ v: String(r), l: `${r} km` }))} />
              <Select id="budget" label="Budget per uscita" value={budget} onChange={(v) => setBudget(v as FamilyBudget)}
                options={BUDGETS} />
              <Select id="pref" label="Preferenza" value={preference} onChange={(v) => setPreference(v as SettingPreference)}
                options={PREFS} />
            </div>
          </details>
          <button onClick={() => setEditing(false)} className="self-end rounded-full bg-shell px-5 py-2 text-sm font-semibold text-on-shell">Mostra le idee</button>
        </section>
        )}

        {!weather || !rec || !draft ? (
          <Skeleton />
        ) : ages.length === 0 ? (
          <Empty text="Aggiungi almeno un figlio per vedere le proposte." />
        ) : rec.ideas.length === 0 ? (
          <Empty text="Nessuna attività con questi filtri. Prova ad aumentare distanza o budget in “Altri filtri”." />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-extrabold tracking-tight">Tre idee per voi</h2>
              <ol className="flex flex-col gap-3">
                {rec.ideas.map((s, i) => <Idea key={s.activity.slug} s={s} ages={ages} colors={kidColor} featured={i === 0} />)}
              </ol>
            </section>

            {rec.planB && (
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <span className="mt-0.5 text-rain"><RainIcon /></span>
                <span>
                  <span className="font-semibold text-ink">Se piove:</span>{" "}
                  <a href={rec.planB.activity.sourceUrl} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
                    {rec.planB.activity.title}
                  </a>
                  {rec.planB.distanceKm != null && ` · ${km(rec.planB.distanceKm)}`}
                </span>
              </p>
            )}

            <details className="rounded-2xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-1 text-sm font-semibold"><Chevron /> Vedi la mail del venerdì</span>
                <span className="text-xs text-ink-2">bozza</span>
              </summary>
              <div className="border-t border-line">
                <p className="px-4 pt-3 text-sm font-medium">{draft.subject}</p>
                <iframe
                  title="Anteprima mail"
                  srcDoc={html}
                  sandbox=""
                  className="mt-3 block h-[1180px] w-full border-0 bg-[#f4f7ff]"
                />
                <pre id="mail-body" hidden>{draft.text}</pre>
                <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
                  <button onClick={copyDraft} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:border-ink-2">
                    {copied ? "Copiato" : "Copia testo"}
                  </button>
                  <span className="text-xs text-ink-2">Così la vedranno le famiglie. Invio non ancora attivo.</span>
                </div>
              </div>
            </details>
          </>
        )}

        <footer className="flex flex-col gap-3 border-t border-line pt-4 text-xs text-ink-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>Prova il meteo:</span>
            {(["live", "dry", "rain"] as RainMode[]).map((m) => (
              <button
                key={m}
                aria-pressed={rainMode === m}
                onClick={() => setRainMode(m)}
                className={`rounded-full px-2.5 py-1 transition-colors duration-150 ${
                  rainMode === m ? "bg-ink text-ground" : "bg-surface-2 hover:text-ink"
                }`}
              >
                {m === "live" ? "reale" : m === "dry" ? "sole" : "pioggia"}
              </button>
            ))}
          </div>
          <p>Demo con dati da verificare: orari, prezzi e posizioni vanno controllati prima dell&apos;invio. Foto da Wikipedia e Wikimedia Commons, con licenze libere.</p>
        </footer>
      </main>
      )}
      <BottomNav tab={tab} onTab={setTab} pending={pending.length} />
    </div>
  );
}

/* ---------- pieces ---------- */

function usePhoto(a: ScoredActivity["activity"]): Photo | null {
  const [photo, setPhoto] = useState<Photo | null>(null);
  useEffect(() => {
    let alive = true;
    const c = cachedPhoto(a.slug);
    if (c !== undefined) queueMicrotask(() => alive && setPhoto(c));
    else void findPhoto(a).then((p) => alive && setPhoto(p));
    return () => { alive = false; };
  }, [a]);
  return photo;
}

function Idea({ s, ages, colors, featured }: { s: ScoredActivity; ages: number[]; colors: string[]; featured?: boolean }) {
  const a = s.activity;
  const photo = usePhoto(a);
  const meta = [s.distanceKm != null ? km(s.distanceKm) : a.zone, COST_LABEL[a.costBand], a.bookingRequired ? "su prenotazione" : null].filter(Boolean);
  const title = a.sourceUrl ? (
    <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 after:absolute after:inset-0 hover:underline">{a.title}</a>
  ) : a.title;
  const kind = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink-2">
      <CategoryIcon c={a.category} />
      {CATEGORY_LABEL[a.category] ?? a.category}
      {a.event && <span className="num rounded-full bg-coral px-2 py-0.5 text-white">Solo questo weekend, {eventWhen(a)}</span>}
    </p>
  );

  if (featured) {
    return (
      <li className={`relative overflow-hidden rounded-3xl border bg-surface transition-transform duration-200 hover:-translate-y-0.5 ${a.event ? "border-coral/60" : "border-line"}`}>
        <Visual photo={photo} category={a.category} className="aspect-[16/10] w-full" big />
        <div className="flex flex-col gap-2 p-4">
          {kind}
          <h3 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{title}</h3>
          <p className="num -mt-1 text-sm text-ink-2">{meta.join(", ")}</p>
          {a.description && <p className="text-[0.95rem] leading-relaxed">{a.description}</p>}
          <AgeFit min={a.minAge} max={a.maxAge} ages={ages} colors={colors} />
          {a.event && a.status !== "published" && (
            <p className="text-xs text-ink-2">Trovato online{a.event.organizer ? ` (${a.event.organizer})` : ""}: controlla il link prima di andare.</p>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className={`relative flex gap-3 rounded-2xl border bg-surface p-3 transition-transform duration-200 hover:-translate-y-0.5 ${a.event ? "border-coral/60" : "border-line"}`}>
      <Visual photo={photo} category={a.category} className="h-24 w-24 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {kind}
        <h3 className="font-display text-base font-extrabold leading-snug tracking-tight">{title}</h3>
        <p className="num text-xs text-ink-2">{meta.join(", ")}</p>
        <AgeFit min={a.minAge} max={a.maxAge} ages={ages} colors={colors} compact />
      </div>
    </li>
  );
}

const CATEGORY_TINT: Record<string, string> = {
  culture: "var(--surface-2)", outdoor: "#dff3e6", animals: "#fff3cf", party: "#ffe4dc", show: "#e3ecff", hands: "#fff3cf",
};

/** The activity's real photograph, or a tinted tile with its category glyph while none is known. */
function Visual({ photo, category, className, big }: { photo: Photo | null; category: string; className: string; big?: boolean }) {
  if (photo) {
    return (
      <div className={`overflow-hidden bg-surface-2 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center text-ink-2 ${className}`} style={{ background: CATEGORY_TINT[categoryGroup(category)] }} aria-hidden="true">
      <span className={big ? "scale-[3.2] opacity-70" : "scale-[1.8] opacity-70"}><CategoryIcon c={category} /></span>
    </div>
  );
}

/** Which children the activity suits, in each child's color. */
function AgeFit({ min, max, ages, colors, compact }: { min: number; max: number; ages: number[]; colors: string[]; compact?: boolean }) {
  const outside = ages.filter((g) => g < min || g > max);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${compact ? "mt-auto" : "border-t border-line pt-2"}`}>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {ages.map((g, i) => {
          const ok = g >= min && g <= max;
          return (
            <span key={i} className={`num flex items-center gap-1 ${ok ? "font-semibold" : "text-ink-2 line-through"}`}>
              <span className="h-2 w-2 rounded-full" style={ok ? { background: colors[i] } : { boxShadow: `inset 0 0 0 1.5px ${colors[i]}` }} />
              {g}
            </span>
          );
        })}
      </span>
      <span className={outside.length ? "text-warn" : "text-ok"}>
        {outside.length === 0
          ? ages.length > 1 ? "Va bene per tutti" : "Adatto"
          : `Non adatto a ${outside.join(" e ")} anni`}
        <span className="num text-ink-2">{` (${min}–${max} anni)`}</span>
      </span>
    </div>
  );
}

/** The weekend at a glance: dates, weather in words, where you start from. */
function WeekendHero({ w, live, from, eventsNear, radiusKm }: { w: WeekendWeather | null; live: WeekendWeather | null; from: string; eventsNear: number; radiusKm: number }) {
  const d = (x: string | null, opts: Intl.DateTimeFormatOptions) => (x ? new Date(x + "T12:00:00").toLocaleDateString("it-IT", opts) : "");
  const sat = w?.saturday ?? null;
  const sun = w?.sunday ?? null;
  const sameMonth = sat && sun && sat.slice(5, 7) === sun.slice(5, 7);
  const satFull = sat && sun
    ? `Sabato ${d(sat, sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" })} e domenica ${d(sun, { day: "numeric", month: "long" })}`
    : "Il prossimo weekend";
  let weather = "Cerco il meteo…";
  let icon = <CloudIcon />;
  if (w?.source === "fallback") weather = live ? "Meteo non disponibile: idee buone con ogni tempo." : "Cerco il meteo…";
  else if (w?.rainy) { weather = `Pioggia probabile (${w.rainProbability}%): prima le idee al coperto.`; icon = <RainIcon />; }
  else if (w) { weather = w.tempMax != null ? `Asciutto, fino a ${w.tempMax}°. Si può stare fuori.` : "Asciutto. Si può stare fuori."; icon = <SunIcon />; }
  return (
    <div className="mx-auto max-w-2xl px-4 pb-14 pt-3">
      <p className="font-display text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-balance">{satFull}</p>
      <p className="mt-2 flex items-start gap-2 text-sm text-on-shell"><span className="mt-0.5">{icon}</span>{weather}</p>
      <p className="mt-1 text-sm text-on-shell-2">
        Partenza da {from}, entro {radiusKm} km.
        {eventsNear > 0 && <> <span className="font-semibold text-accent">{eventsNear} {eventsNear === 1 ? "evento" : "eventi"}</span> solo per questo weekend.</>}
      </p>
    </div>
  );
}

function WeatherBadge({ w, live }: { w: WeekendWeather | null; live: WeekendWeather | null }) {
  let label = "…";
  let icon = <CloudIcon />;
  if (w?.source === "fallback") label = live ? "meteo n.d." : "…";
  else if (w?.rainy) { label = `pioggia ${w.rainProbability}%`; icon = <RainIcon />; }
  else if (w) { label = w.tempMax != null ? `${w.tempMax}°` : "sole"; icon = <SunIcon />; }
  return (
    <p className="num flex items-center gap-1.5 text-sm text-on-shell-2" aria-label={`Meteo del weekend: ${label}`}>
      {icon}
      {label}
    </p>
  );
}

function Select({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs text-ink-2">
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

function StepButton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button aria-label={label} onClick={onClick} disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-2 transition-colors duration-150 hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-2">{text}</p>;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Caricamento">
      {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-2" />)}
    </div>
  );
}


/** Children keep a stable color by age order, matching the email. */
function colorByIndex(ages: number[]): string[] {
  const order = ages.map((a, i) => ({ a, i })).sort((p, q) => p.a - q.a || p.i - q.i);
  const out: string[] = [];
  order.forEach((o, rank) => { out[o.i] = KID_COLORS[rank % KID_COLORS.length]; });
  return out;
}

const CATEGORY_LABEL: Record<string, string> = {
  museo: "Museo", natura: "All'aria aperta", fattoria: "Animali e fattorie", sport: "Sport", laboratorio: "Laboratorio",
  scienza: "Scienza", biblioteca: "Biblioteca e letture", gita: "Gita", festa: "Festa e sagra", spettacolo: "Spettacolo",
  musica: "Musica", gusto: "Gusto", incontro: "Incontro", notte: "Sera",
};

/** One small glyph per family of categories (indoor culture, outdoors, animals, celebration, show). */
function CategoryIcon({ c }: { c: string }) {
  const paths: Record<string, React.ReactNode> = {
    culture: <><path d="M3 10l9-5 9 5" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
    outdoor: <><path d="M3 19l6-10 4 6 2-3 6 7z" /><circle cx="17" cy="6" r="2" /></>,
    animals: <><circle cx="7" cy="9" r="1.6" /><circle cx="12" cy="6.5" r="1.6" /><circle cx="17" cy="9" r="1.6" /><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 1.5-1.5 2-4 2s-4-.5-4-2z" /></>,
    party: <><path d="M4 20l5-14 9 9z" /><path d="M14 4v2M18 6l-1.5 1.5M20 10h-2" /></>,
    show: <><path d="M4 5h16v10H4z" /><path d="M9 19h6M12 15v4" /></>,
    hands: <><path d="M7 11V6a1.5 1.5 0 013 0v5M10 10V5a1.5 1.5 0 013 0v5M13 10V6a1.5 1.5 0 013 0v7c0 4-2.5 6-5.5 6S6 17 6 14v-2" /></>,
  };
  return <Svg size={14}>{paths[categoryGroup(c)]}</Svg>;
}

function categoryGroup(c: string): string {
  return ["museo", "biblioteca", "scienza", "incontro"].includes(c) ? "culture"
    : ["natura", "gita", "sport"].includes(c) ? "outdoor"
    : c === "fattoria" ? "animals"
    : ["festa", "gusto"].includes(c) ? "party"
    : c === "laboratorio" ? "hands"
    : "show";
}

type Tab = "weekend" | "adulti" | "esplora" | "eventi";

/** App-style tab bar at the bottom, within thumb reach. */
function BottomNav({ tab, onTab, pending }: { tab: Tab; onTab: (t: Tab) => void; pending: number }) {
  const items: { k: Tab; l: string; icon: React.ReactNode }[] = [
    { k: "weekend", l: "Famiglia", icon: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></> },
    { k: "adulti", l: "Adulti", icon: <><path d="M8 3h8l-1 7a3 3 0 01-6 0z" /><path d="M12 13v7M8 21h8" /></> },
    { k: "esplora", l: "Esplora", icon: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></> },
    { k: "eventi", l: "Eventi", icon: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></> },
  ];
  return (
    <nav aria-label="Sezioni" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid max-w-2xl grid-cols-4">
        {items.map((it) => {
          const on = tab === it.k;
          return (
            <button
              key={it.k}
              aria-current={on ? "page" : undefined}
              onClick={() => { onTab(it.k); window.scrollTo({ top: 0 }); }}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold transition-colors duration-150 ${on ? "text-shell" : "text-ink-2 hover:text-ink"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 ${on ? "bg-accent-soft" : ""}`}>
                <Svg size={20}>{it.icon}</Svg>
              </span>
              {it.l}
              {it.k === "eventi" && pending > 0 && (
                <span className="num absolute right-[calc(50%-1.6rem)] top-1.5 rounded-full bg-coral px-1.5 text-[0.65rem] leading-4 text-white">{pending}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const km = (d: number) => `${d.toFixed(1).replace(".", ",")} km`;

/* ---------- icons ---------- */

function Svg({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const SunIcon = () => (
  <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
const RainIcon = () => (
  <Svg><path d="M7 16a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9a3.5 3.5 0 0 1 0 7" /><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2" /></Svg>
);
const CloudIcon = () => (
  <Svg><path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7z" /></Svg>
);
const XIcon = () => <Svg size={14}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const Chevron = () => (
  <span className="inline-flex transition-transform duration-150 group-open:rotate-90 [details[open]_&]:rotate-90">
    <Svg size={14}><path d="M9 6l6 6-6 6" /></Svg>
  </span>
);
