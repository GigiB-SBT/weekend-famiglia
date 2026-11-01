"use client";

import { useEffect, useMemo, useState } from "react";
import seed from "@/data/seed-activities.json";
import { DEMO_FAMILIES } from "@/data/demo-families";
import { ZONE_NAMES, ZONES, type ZoneName } from "@/data/zones";
import { recommend } from "@/lib/engine/engine";
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

const ACTIVITIES = seed as Activity[];
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
const RADII = [5, 10, 20, 30];
const COST_LABEL = { free: "Gratis", low: "fino a 10 € a testa", mid: "10–25 € a testa", high: "oltre 25 € a testa" };

type RainMode = "live" | "dry" | "rain";

export function Demo() {
  const [ages, setAges] = useState<number[]>(BASE.childrenAges);
  const [zone, setZone] = useState<ZoneName>(BASE.zone as ZoneName);
  const [radiusKm, setRadiusKm] = useState(BASE.radiusKm);
  const [budget, setBudget] = useState<FamilyBudget>(BASE.budget);
  const [preference, setPreference] = useState<SettingPreference>(BASE.preference);
  const [liveWeather, setLiveWeather] = useState<WeekendWeather | null>(null);
  const [placeholder, setPlaceholder] = useState<WeekendWeather | null>(null);
  const [rainMode, setRainMode] = useState<RainMode>("live");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    // Date-dependent values are computed only in the browser (no prerender clock).
    queueMicrotask(() => alive && setPlaceholder(fallbackWeather()));
    getWeekendWeather().then((w) => alive && setLiveWeather(w));
    return () => { alive = false; };
  }, []);

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
      zone,
      ...ZONES[zone],
      radiusKm,
      childrenAges: ages,
      budget,
      preference,
      interests: [],
    }),
    [ages, zone, radiusKm, budget, preference],
  );

  const rec = useMemo(
    () => (weather ? recommend(family, ACTIVITIES, weather, { allowUnverified: true, now: new Date(weather.fetchedAt) }) : null),
    [family, weather],
  );
  const draft = useMemo(() => (rec ? buildDraft(family, rec) : null), [family, rec]);
  const html = useMemo(() => (rec ? buildHtml(family, rec) : ""), [family, rec]);
  const kidColor = useMemo(() => colorByIndex(ages), [ages]);

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
    <div className="min-h-full">
      <header className="bg-shell text-on-shell">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-extrabold">Weekend in Famiglia</h1>
          <WeatherBadge w={weather} live={liveWeather} />
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        {/* Children: the one control that matters */}
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Età dei figli</h2>
          <div className="flex flex-wrap gap-2">
            {ages.map((age, i) => (
              <div key={i} className="flex items-center rounded-full border border-line bg-ground">
                <StepButton label={`Diminuisci età figlio ${i + 1}`} onClick={() => setAge(i, -1)} disabled={age <= 0}>−</StepButton>
                <span className="num flex min-w-[4rem] items-center justify-center gap-1.5 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: kidColor[i] }} />{age} anni</span>
                <StepButton label={`Aumenta età figlio ${i + 1}`} onClick={() => setAge(i, 1)} disabled={age >= 17}>+</StepButton>
                <button
                  aria-label={`Rimuovi figlio ${i + 1}`}
                  onClick={() => setAges((a) => a.filter((_, j) => j !== i))}
                  className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
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

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-ink-2 hover:text-ink">
              <Chevron />
              Altri filtri
              <span className="text-ink-2">· {zone}, {radiusKm} km, {BUDGETS.find((b) => b.v === budget)?.l.toLowerCase()}</span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select id="zone" label="Zona di partenza" value={zone} onChange={(v) => setZone(v as ZoneName)}
                options={ZONE_NAMES.map((z) => ({ v: z, l: z }))} />
              <Select id="radius" label="Distanza massima" value={String(radiusKm)} onChange={(v) => setRadiusKm(Number(v))}
                options={RADII.map((r) => ({ v: String(r), l: `${r} km` }))} />
              <Select id="budget" label="Budget per uscita" value={budget} onChange={(v) => setBudget(v as FamilyBudget)}
                options={BUDGETS} />
              <Select id="pref" label="Preferenza" value={preference} onChange={(v) => setPreference(v as SettingPreference)}
                options={PREFS} />
            </div>
          </details>
        </section>

        {!weather || !rec || !draft ? (
          <Skeleton />
        ) : ages.length === 0 ? (
          <Empty text="Aggiungi almeno un figlio per vedere le proposte." />
        ) : rec.ideas.length === 0 ? (
          <Empty text="Nessuna attività con questi filtri. Prova ad aumentare distanza o budget in “Altri filtri”." />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">3 idee per figli di {agesLabel(ages)}</h2>
              <ol className="flex flex-col gap-3">
                {rec.ideas.map((s, i) => <Idea key={s.activity.slug} s={s} n={i + 1} ages={ages} colors={kidColor} />)}
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
          <p>Demo con dati da verificare: orari, prezzi e posizioni vanno controllati prima dell&apos;invio.</p>
        </footer>
      </main>
    </div>
  );
}

/* ---------- pieces ---------- */

function Idea({ s, n, ages, colors }: { s: ScoredActivity; n: number; ages: number[]; colors: string[] }) {
  const a = s.activity;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-base font-extrabold" style={NUM_STYLE[(n - 1) % 3]}>{n}</span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold leading-snug">
            <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{a.title}</a>
          </h3>
          <p className="num text-sm text-ink-2">
            {s.distanceKm != null ? km(s.distanceKm) : a.zone} · {COST_LABEL[a.costBand]}
            {a.bookingRequired ? " · su prenotazione" : ""}
          </p>
        </div>
      </div>
      <p className="text-sm">{a.description}</p>
      <AgeRuler min={a.minAge} max={a.maxAge} ages={ages} colors={colors} />
    </li>
  );
}

/** Activity age range on a 0–17 scale, with each child placed on it. */
function AgeRuler({ min, max, ages, colors }: { min: number; max: number; ages: number[]; colors: string[] }) {
  const W = 300;
  const pad = 8;
  const x = (age: number) => pad + (age / 17) * (W - pad * 2);
  const outside = ages.filter((g) => g < min || g > max);
  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${W} 20`} className="block h-5 w-full max-w-[220px]" role="img" aria-label={`Adatto da ${min} a ${max} anni`}>
        <line x1={pad} x2={W - pad} y1={10} y2={10} style={{ stroke: "var(--line)" }} strokeWidth={3} strokeLinecap="round" />
        <line x1={x(min)} x2={x(max)} y1={10} y2={10} style={{ stroke: "var(--accent)" }} strokeWidth={8} strokeLinecap="round" />
        {ages.map((g, i) => {
          const ok = g >= min && g <= max;
          return (
            <circle key={i} cx={x(g)} cy={10} r={6} strokeWidth={2.5}
              style={ok ? { fill: colors[i], stroke: "var(--surface)" } : { fill: "var(--surface)", stroke: colors[i] }} />
          );
        })}
      </svg>
      <span className={`num shrink-0 text-xs ${outside.length ? "text-warn" : "text-ink-2"}`}>
        {min}–{max} anni{outside.length ? ` · ${outside.join(", ")} fuori fascia` : ""}
      </span>
    </div>
  );
}

function WeatherBadge({ w, live }: { w: WeekendWeather | null; live: WeekendWeather | null }) {
  const day = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
  let label = "…";
  let icon = <SunIcon />;
  if (w?.source === "fallback") {
    label = live ? "meteo n.d." : "…";
    icon = <CloudIcon />;
  } else if (w?.rainy) {
    label = `pioggia ${w.rainProbability}%`;
    icon = <RainIcon />;
  } else if (w) {
    label = w.tempMax != null ? `sole · ${w.tempMax}°` : "sole";
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="num">
        {w ? `${day(w.saturday)}–${day(w.sunday)}` : ""} <span className="text-on-shell-2">· {label}</span>
      </span>
    </div>
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
      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink-2 transition-colors duration-150 hover:text-ink disabled:opacity-30">
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

const NUM_STYLE = [
  { background: "var(--coral)", color: "#ffffff" },
  { background: "var(--accent)", color: "#10223f" },
  { background: "var(--shell)", color: "#ffffff" },
];

/** Children keep a stable color by age order, matching the email. */
function colorByIndex(ages: number[]): string[] {
  const order = ages.map((a, i) => ({ a, i })).sort((p, q) => p.a - q.a || p.i - q.i);
  const out: string[] = [];
  order.forEach((o, rank) => { out[o.i] = KID_COLORS[rank % KID_COLORS.length]; });
  return out;
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
