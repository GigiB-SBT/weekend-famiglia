"use client";

import { useEffect, useState } from "react";
import { AREA_IDS, AREAS, ZONES, zonesOf, type AreaId, type ZoneName } from "@/data/zones";
import { haversineKm } from "@/lib/engine/engine";
import type { Activity, Category, CostBand, Setting } from "@/lib/engine/types";
import { parseFlyer } from "@/lib/events/parse";
import {
  eventToForm,
  eventWhen,
  formToEvent,
  parseImportCode,
  rejectCandidate,
  removeEvent,
  upsertEvent,
  type EventForm,
  type EventStoreData,
  type ImportedCandidates,
} from "@/lib/events/store";
import { disableReminders, enableReminders, reminderState, type ReminderState } from "@/lib/notify";

const CATEGORIES: { v: Category; l: string }[] = [
  { v: "festa", l: "Festa / sagra" },
  { v: "spettacolo", l: "Spettacolo" },
  { v: "laboratorio", l: "Laboratorio" },
  { v: "biblioteca", l: "Letture" },
  { v: "museo", l: "Museo / mostra" },
  { v: "natura", l: "Natura" },
  { v: "sport", l: "Sport" },
  { v: "scienza", l: "Scienza" },
  { v: "fattoria", l: "Animali" },
  { v: "gita", l: "Gita" },
  { v: "musica", l: "Concerto / musica" },
  { v: "gusto", l: "Gusto / degustazione" },
  { v: "incontro", l: "Incontro / cultura" },
  { v: "notte", l: "Serata / club / dj set" },
];
const COSTS: { v: CostBand; l: string }[] = [
  { v: "free", l: "Gratis / offerta libera" },
  { v: "low", l: "Fino a 10 € a testa" },
  { v: "mid", l: "10–25 € a testa" },
  { v: "high", l: "Oltre 25 € a testa" },
];
const SETTINGS: { v: Setting; l: string }[] = [
  { v: "outdoor", l: "All'aperto" },
  { v: "indoor", l: "Al coperto" },
  { v: "mixed", l: "Entrambi" },
];

function emptyForm(today: string, area: AreaId): EventForm {
  return {
    title: "", description: "", date: today, startTime: "", endTime: "", place: "",
    zone: zonesOf(area)[0], minAge: 0, maxAge: 17, costBand: "free", setting: "outdoor",
    category: "festa", sourceUrl: "", organizer: "",
  };
}

const SYNC_NOTE: Record<string, string> = {
  ok: "Eventi scaricati da GitHub: l'app li prende da sola a ogni apertura.",
  private: "Download automatico non disponibile: il repository GitHub è privato. Usa «Importa eventi dalla mail».",
  offline: "GitHub non raggiungibile: riprova più tardi o usa «Importa eventi dalla mail».",
  empty: "Su GitHub non ci sono ancora eventi: lancia «Eventi settimanali» e riprova tra un paio di minuti.",
};

export function EventsPanel({
  store,
  onStore,
  pending,
  today,
  area,
  updatedAt,
  onImport,
  sync,
  onSync,
}: {
  store: EventStoreData;
  onStore: (s: EventStoreData) => void;
  pending: Activity[];
  today: string;
  area: AreaId;
  updatedAt: string | null;
  onImport: (v: ImportedCandidates) => void;
  sync: string;
  onSync: () => void;
}) {
  const [form, setForm] = useState<EventForm | null>(null);
  const [flyer, setFlyer] = useState("");
  const [readNote, setReadNote] = useState<string | null>(null);
  const [rem, setRem] = useState<ReminderState>("unsupported");
  const [backup, setBackup] = useState("");
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);

  function doImport() {
    const r = parseImportCode(importText);
    if ("error" in r) {
      setImportNote(r.error);
      return;
    }
    onImport(r);
    setImportText("");
    setImportOpen(false);
    setImportNote(`Importati ${r.events.length} eventi. Li trovi qui sotto in «Da approvare».`);
  }
  async function pasteFromClipboard() {
    try {
      setImportText(await navigator.clipboard.readText());
    } catch {
      setImportNote("Non riesco a leggere gli appunti: tieni premuto nel riquadro e scegli Incolla.");
    }
  }
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  useEffect(() => {
    let alive = true;
    reminderState().then((s) => alive && setRem(s));
    return () => { alive = false; };
  }, []);

  // Zone filter: whole area (events closer to this area than to the other one), or within N km of a zone.
  const [zoneFilter, setZoneFilter] = useState<ZoneName | "all">("all");
  const [maxKm, setMaxKm] = useState(20);
  const zoneSel = zoneFilter !== "all" && ZONES[zoneFilter]?.area === area ? zoneFilter : "all";
  function inFilter(a: Activity): boolean {
    if (a.lat == null || a.lng == null) return zoneSel === "all"; // no position: show only in "whole area"
    const nearestArea = AREA_IDS.reduce((best, id) =>
      haversineKm(a.lat!, a.lng!, AREAS[id].lat, AREAS[id].lng) < haversineKm(a.lat!, a.lng!, AREAS[best].lat, AREAS[best].lng) ? id : best,
    );
    if (nearestArea !== area) return false;
    if (zoneSel === "all") return true;
    return haversineKm(a.lat, a.lng, ZONES[zoneSel].lat, ZONES[zoneSel].lng) <= maxKm;
  }
  const pendingShown = pending.filter(inFilter);
  // Last "Approva tutti", to undo it in one tap.
  const [undo, setUndo] = useState<{ store: EventStoreData; n: number } | null>(null);
  const hiddenPending = pending.length - pendingShown.length;

  const upcoming = store.events
    .filter((e) => (e.event?.endDate ?? e.event?.date ?? "") >= today)
    .filter(inFilter)
    .sort((a, b) => (a.event!.date + (a.event!.startTime ?? "")).localeCompare(b.event!.date + (b.event!.startTime ?? "")));
  const past = store.events.filter((e) => (e.event?.endDate ?? e.event?.date ?? "") < today);

  function readFlyer() {
    const g = parseFlyer(flyer, new Date(`${today}T12:00:00`));
    const base = form ?? emptyForm(today, area);
    setForm({
      ...base,
      title: g.title ?? base.title,
      description: flyer.split(/\n+/).slice(1).join(" ").trim().slice(0, 280) || base.description,
      date: g.date ?? base.date,
      startTime: g.startTime ?? base.startTime,
      endTime: g.endTime ?? base.endTime,
      category: g.category ?? base.category,
      audience: g.category === "festa" ? "tutti" : base.audience,
      costBand: g.costBand ?? base.costBand,
      setting: g.setting ?? base.setting,
      minAge: g.minAge ?? base.minAge,
      maxAge: g.maxAge ?? base.maxAge,
      sourceUrl: g.url ?? base.sourceUrl,
    });
    const found = [g.date && "data", g.startTime && "orario", g.category && "tipo", g.costBand && "costo", g.minAge != null && "età"].filter(Boolean);
    setReadNote(found.length ? `Ho letto: ${found.join(", ")}. Controlla e completa luogo e zona.` : "Non ho trovato data od orario: compilali a mano.");
  }

  function save() {
    if (!form || !form.title.trim() || !form.date) return;
    onStore(upsertEvent(store, formToEvent(form)));
    setForm(null);
    setFlyer("");
    setReadNote(null);
  }

  async function toggleReminders() {
    setRem(rem === "on" ? await disableReminders() : await enableReminders());
  }

  async function exportBackup() {
    const json = JSON.stringify(store.events);
    setBackup(json);
    try {
      await navigator.clipboard.writeText(json);
      setBackupNote("Copiato negli appunti.");
    } catch {
      setBackupNote("Seleziona il testo qui sotto e copialo.");
    }
  }
  function importBackup() {
    try {
      const list = JSON.parse(backup) as Activity[];
      const valid = list.filter((e) => e && e.slug && e.event && e.title);
      let s = store;
      for (const e of valid) s = upsertEvent(s, e);
      onStore(s);
      setBackupNote(`Importati ${valid.length} eventi.`);
    } catch {
      setBackupNote("Il testo incollato non è un backup valido.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {form ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{form.slug ? "Modifica evento" : "Nuovo evento"}</h2>
            <button onClick={() => { setForm(null); setReadNote(null); }} className="text-sm text-ink-2 hover:text-ink">Annulla</button>
          </div>

          {!form.slug && (
            <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
              <label htmlFor="flyer" className="text-sm font-semibold">Incolla il volantino o il messaggio</label>
              <textarea
                id="flyer"
                value={flyer}
                onChange={(e) => setFlyer(e.target.value)}
                rows={4}
                placeholder="Es. Castagnata in parrocchia! Domenica 8 novembre dalle 15 alle 18, offerta libera."
                className="field bg-surface"
                style={{ backgroundImage: "none", paddingRight: "0.7rem" }}
              />
              <button onClick={readFlyer} disabled={!flyer.trim()} className="self-start rounded-full bg-shell px-4 py-2 text-sm font-semibold text-on-shell disabled:opacity-40">
                Compila dal testo
              </button>
              {readNote && <p className="text-xs text-ink-2">{readNote}</p>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ev-title" label="Titolo" className="sm:col-span-2">
              <input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="field" style={plain} />
            </Field>
            <Field id="ev-date" label="Data">
              <input id="ev-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="field" style={plain} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field id="ev-start" label="Dalle">
                <input id="ev-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="field" style={plain} />
              </Field>
              <Field id="ev-end" label="Alle">
                <input id="ev-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="field" style={plain} />
              </Field>
            </div>
            <Field id="ev-place" label="Luogo">
              <input id="ev-place" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Parrocchia di …, via …" className="field" style={plain} />
            </Field>
            <Field id="ev-zone" label="Zona (per la distanza)">
              <select id="ev-zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value as ZoneName })} className="field">
                {zonesOf(ZONES[form.zone]?.area ?? area).map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
            <Field id="ev-cat" label="Tipo">
              <select id="ev-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} className="field">
                {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </Field>
            <Field id="ev-aud" label="Per chi">
              <select id="ev-aud" value={form.audience ?? "famiglie"} onChange={(e) => setForm({ ...form, audience: e.target.value as EventForm["audience"] })} className="field">
                <option value="famiglie">Famiglie con bambini</option>
                <option value="tutti">Tutti (anche adulti)</option>
                <option value="adulti">Solo adulti</option>
              </select>
            </Field>
            <Field id="ev-cost" label="Costo">
              <select id="ev-cost" value={form.costBand} onChange={(e) => setForm({ ...form, costBand: e.target.value as CostBand })} className="field">
                {COSTS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </Field>
            <Field id="ev-setting" label="Dove si svolge">
              <select id="ev-setting" value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value as Setting })} className="field">
                {SETTINGS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field id="ev-min" label="Età da">
                <input id="ev-min" type="number" min={0} max={17} value={form.minAge} onChange={(e) => setForm({ ...form, minAge: clampAge(e.target.value) })} className="field num" style={plain} />
              </Field>
              <Field id="ev-max" label="a">
                <input id="ev-max" type="number" min={0} max={17} value={form.maxAge} onChange={(e) => setForm({ ...form, maxAge: clampAge(e.target.value) })} className="field num" style={plain} />
              </Field>
            </div>
            <Field id="ev-org" label="Organizzatore">
              <input id="ev-org" value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} className="field" style={plain} />
            </Field>
            <Field id="ev-url" label="Link (facoltativo)">
              <input id="ev-url" type="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://…" className="field" style={plain} />
            </Field>
            <Field id="ev-desc" label="Descrizione per la mail" className="sm:col-span-2">
              <textarea id="ev-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" style={plain} />
            </Field>
          </div>
          <button onClick={save} disabled={!form.title.trim() || !form.date} className="self-start rounded-full bg-shell px-5 py-2.5 text-sm font-semibold text-on-shell disabled:opacity-40">
            Salva evento
          </button>
        </section>
      ) : (
        <button onClick={() => setForm(emptyForm(today, area))} className="rounded-2xl border-2 border-dashed border-shell/40 bg-surface px-4 py-4 text-left transition-colors duration-150 hover:border-shell">
          <span className="block font-display text-lg font-extrabold text-link">+ Aggiungi evento</span>
          <span className="block text-sm text-ink-2">Feste di parrocchia, volantini, messaggi WhatsApp: incolla il testo e lo compilo io.</span>
        </button>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold">Eventi online</span>{" "}
            <span className="text-ink-2">{updatedLabel ? `aggiornati ${updatedLabel}` : "non ancora letti"}</span>
          </p>
          <button onClick={onSync} disabled={sync === "busy"} className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-50">
            {sync === "busy" ? "Aggiorno…" : "Aggiorna ora"}
          </button>
          {!importOpen && (
            <button onClick={() => { setImportOpen(true); setImportNote(null); }} className="rounded-full bg-shell px-3 py-1.5 text-sm font-semibold text-on-shell">
              Importa eventi dalla mail
            </button>
          )}
        </div>
        {importOpen && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-2">Nella mail del mercoledì, copia il riquadro «Codice eventi» con il pulsante copia e incollalo qui.</p>
            <textarea id="import-code" aria-label="Codice eventi" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} className="field num text-xs" style={plain} />
            <div className="flex flex-wrap gap-2">
              <button onClick={pasteFromClipboard} className="rounded-full border border-line px-3 py-1.5 text-sm">Incolla</button>
              <button onClick={doImport} disabled={!importText.trim()} className="rounded-full bg-shell px-3 py-1.5 text-sm font-semibold text-on-shell disabled:opacity-40">Importa</button>
              <button onClick={() => setImportOpen(false)} className="rounded-full px-3 py-1.5 text-sm text-ink-2">Annulla</button>
            </div>
          </div>
        )}
        {importNote && <p className="text-xs text-ink-2">{importNote}</p>}
        {SYNC_NOTE[sync] && <p className="text-xs text-ink-2">{SYNC_NOTE[sync]}</p>}
      </section>

      <section aria-label="Filtro zona" className="flex flex-wrap items-end gap-2">
        <label htmlFor="ev-filter-zone" className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-2">
          Zona
          <select id="ev-filter-zone" value={zoneSel} onChange={(e) => setZoneFilter(e.target.value as ZoneName | "all")} className="field">
            <option value="all">Tutta l&apos;area di {AREAS[area].label}</option>
            {zonesOf(area).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        {zoneSel !== "all" && (
          <label htmlFor="ev-filter-km" className="flex flex-col gap-1 text-xs text-ink-2">
            Entro
            <select id="ev-filter-km" value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} className="field num">
              {[5, 10, 20, 30, 50, 80].map((k) => <option key={k} value={k}>{k} km</option>)}
            </select>
          </label>
        )}
      </section>

      {pendingShown.length === 0 && hiddenPending > 0 && (
        <p className="text-xs text-ink-2">{hiddenPending} eventi da approvare sono fuori da questo filtro: scegli «Tutta l&apos;area» o un raggio più ampio.</p>
      )}

      {undo && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ok/10 px-4 py-3 text-sm">
          <span>Approvati {undo.n} eventi: ora compaiono tra le proposte.</span>
          <button onClick={() => { onStore(undo.store); setUndo(null); }} className="rounded-full border border-line bg-surface px-3 py-1.5 font-semibold">Annulla</button>
        </div>
      )}

      {pendingShown.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">Da approvare <span className="num text-coral">· {pendingShown.length}</span></h2>
            <button
              onClick={() => {
                setUndo({ store, n: pendingShown.length });
                onStore(pendingShown.reduce((acc, c) => upsertEvent(acc, { ...c, status: "published" }), store));
              }}
              className="rounded-full bg-shell px-4 py-2 text-sm font-semibold text-on-shell"
            >
              {pendingShown.length === 1 ? "Approva" : `Approva tutti (${pendingShown.length})`}
            </button>
          </div>
          <p className="text-xs text-ink-2">
            Trovati nelle agende online. Controlla data ed età prima di approvare.
            {hiddenPending > 0 && ` Altri ${hiddenPending} fuori dal filtro.`}
          </p>
          <ul className="flex flex-col gap-2">
            {pendingShown.map((c) => (
              <EventRow key={c.slug} a={c}>
                <button onClick={() => onStore(upsertEvent(store, { ...c, status: "published" }))} className="rounded-full bg-shell px-3 py-1.5 text-sm font-semibold text-on-shell">Approva</button>
                <button onClick={() => setForm({ ...eventToForm(c) })} className="rounded-full border border-line px-3 py-1.5 text-sm">Modifica</button>
                <button onClick={() => onStore(rejectCandidate(store, c.slug))} className="rounded-full px-3 py-1.5 text-sm text-ink-2 hover:text-ink">Scarta</button>
              </EventRow>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-extrabold">In programma</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">
            Nessun evento ancora. Aggiungi la prima festa di parrocchia o approva quelli trovati online.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((e) => (
              <EventRow key={e.slug} a={e}>
                <button onClick={() => setForm(eventToForm(e))} className="rounded-full border border-line px-3 py-1.5 text-sm">Modifica</button>
                <button onClick={() => onStore(removeEvent(store, e.slug))} className="rounded-full px-3 py-1.5 text-sm text-ink-2 hover:text-ink">Elimina</button>
              </EventRow>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-base font-extrabold">Promemoria</h2>
        <p className="text-sm text-ink-2">Mercoledì 18:30 «Eventi da approvare» · Venerdì 9:00 «La mail del venerdì è pronta».</p>
        {rem === "unsupported" ? (
          <p className="text-xs text-ink-2">Disponibili nell&apos;app Android.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={toggleReminders} className={`rounded-full px-4 py-2 text-sm font-semibold ${rem === "on" ? "border border-line" : "bg-shell text-on-shell"}`}>
              {rem === "on" ? "Disattiva promemoria" : "Attiva promemoria"}
            </button>
            <span className="text-xs text-ink-2">
              {rem === "on" ? "Attivi." : rem === "denied" ? "Notifiche bloccate: abilitale nelle impostazioni del telefono per questa app." : "Spenti."}
            </span>
          </div>
        )}
      </section>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Backup eventi{past.length ? ` · ${past.length} passati` : ""}</summary>
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
          <p className="text-xs text-ink-2">Gli eventi sono salvati su questo telefono. Copia il backup prima di reinstallare l&apos;app.</p>
          <textarea id="backup" aria-label="Backup" rows={3} value={backup} onChange={(e) => setBackup(e.target.value)} className="field num text-xs" style={plain} />
          <div className="flex flex-wrap gap-2">
            <button onClick={exportBackup} className="rounded-full border border-line px-3 py-1.5 text-sm">Copia backup</button>
            <button onClick={importBackup} disabled={!backup.trim()} className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40">Importa incollato</button>
          </div>
          {backupNote && <p className="text-xs text-ink-2">{backupNote}</p>}
        </div>
      </details>
    </div>
  );
}

const plain = { backgroundImage: "none", paddingRight: "0.7rem" } as const;

function clampAge(v: string) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(17, Math.max(0, n)) : 0;
}

function Field({ id, label, className = "", children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex flex-col gap-1 text-xs text-ink-2 ${className}`}>
      {label}
      {children}
    </label>
  );
}

function EventRow({ a, children }: { a: Activity; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-xs font-semibold text-coral">{eventWhen(a)}</p>
          <p className="font-semibold leading-snug">{a.title}</p>
          <p className="num text-xs text-ink-2">
            {[a.address || a.zone, `${a.minAge}–${a.maxAge} anni`, a.event?.origin === "agenda" ? "da agenda online" : "aggiunto a mano"].join(" · ")}
          </p>
        </div>
        {a.sourceUrl && (
          <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-link underline-offset-4 hover:underline">Fonte</a>
        )}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}
