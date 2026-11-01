#!/usr/bin/env node
// Weekly reader of public event agendas → src/data/event-candidates.json (status "da_verificare").
// Runs in GitHub Actions (internet access). Writes events-report.md for the founder's email (GitHub issue).
// Source: Comune di Bologna "Agenda Cultura" open data (Opendatasoft, CC BY-SA 4.0).
// The Agenda excludes sagre and religious events: parishes are added by hand in the app.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { parseFlyer } from "../src/lib/events/parse.ts";

const SOURCES = JSON.parse(readFileSync(new URL("../data/event-sources.json", import.meta.url), "utf8"));
const ZONES = {
  "Borgo Panigale-Reno": [44.505, 11.29],
  Navile: [44.518, 11.342],
  "Porto-Saragozza": [44.49, 11.32],
  "San Donato-San Vitale": [44.5, 11.38],
  "Santo Stefano": [44.488, 11.355],
  Savena: [44.472, 11.38],
};
const WINDOW_DAYS = 16;
const MAX_CANDIDATES = 80;
// Explicit signals that an event is FOR children (generic words like "laboratorio" or "ragazzi" alone are not enough).
const KIDS = /bambin|per (?:i )?ragazz|ragazze e ragazzi|bimb|famigli|piccol[ie]|infanzia|0-18|zerodiciotto|under\s?1[0-6]|\bkids\b|letture animate|lettura animata|burattin|marionett|teatro ragazzi|teatro per ragazzi|nati per leggere|nati per la musica|\b(?:dai|da|dagli)\s?\d{1,2}\s?(?:ai|a)\s?\d{1,2}\s?anni|\bdai\s?\d{1,2}\s?anni|\b\d{1,2}\s?[-–]\s?\d{1,2}\s?anni|scuol[ae] (?:dell'infanzia|primari)/i;
// Signals of adult-only content that win over a weak kids match.
const ADULTS = /vietato ai minori|\+18|solo adulti|per adulti|\bover\s?18/i;

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const from = iso(today);
const to = iso(new Date(today.getTime() + WINDOW_DAYS * 86400000));

async function getJson(url, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "weekend-famiglia-bot/1.0 (uso personale, 1 richiesta a settimana)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Finds the first key whose name matches one of the patterns and has a usable value. */
function pick(rec, patterns) {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(rec)) {
      if (re.test(k) && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) return { key: k, value: v };
    }
  }
  return null;
}
const asText = (v) => (v == null ? "" : Array.isArray(v) ? v.map(asText).join(", ") : typeof v === "object" ? Object.values(v).map(asText).join(" ") : String(v));
// Dates come as ISO strings, often in UTC ("2026-10-31T23:00:00+00:00" = 1 Nov 00:00 in Rome): convert to Europe/Rome.
const ROME = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
function local(v) {
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
const toDay = (v) => local(v).day;
const toTime = (v) => local(v).time;
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

function nearestZone(lat, lng) {
  let best = null;
  for (const [name, [zl, zg]] of Object.entries(ZONES)) {
    const d = Math.hypot((lat - zl) * 111, (lng - zg) * 79);
    if (!best || d < best.d) best = { name, d };
  }
  return best;
}

function geo(rec) {
  const g = pick(rec, [/geo_point|geopoint|coordinat|posizione|location$/i]);
  if (g && typeof g.value === "object" && g.value) {
    const lat = Number(g.value.lat ?? g.value.latitude ?? (Array.isArray(g.value) ? g.value[0] : NaN));
    const lon = Number(g.value.lon ?? g.value.lng ?? g.value.longitude ?? (Array.isArray(g.value) ? g.value[1] : NaN));
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
  }
  const lat = pick(rec, [/^lat/i]);
  const lon = pick(rec, [/^lon|^lng/i]);
  if (lat && lon && Number.isFinite(Number(lat.value)) && Number.isFinite(Number(lon.value))) return [Number(lat.value), Number(lon.value)];
  return null;
}

function toCandidate(rec, source) {
  const title = pick(rec, [/^titolo$|^title$/i, /titolo|title|^nome|name/i]);
  const start = pick(rec, [/data.?inizio|date.?start|start.?date|^dal$|inizio|start/i, /^data$|^date$/i]);
  const end = pick(rec, [/data.?fine|date.?end|end.?date|^al$|fine|end/i]);
  if (!title || !start) return { skip: "campi titolo/data non trovati" };
  const startDay = toDay(start.value);
  const endDay = toDay(end?.value) ?? startDay;
  if (!startDay) return { skip: "data illeggibile" };
  // Keep events touching the window; skip long exhibitions (> 21 days) — they are not "this weekend" news.
  if (endDay < from || startDay > to) return { skip: "fuori finestra" };
  const spanDays = (Date.parse(endDay) - Date.parse(startDay)) / 86400000;
  if (spanDays > 21) return { skip: "evento lungo (mostra)" };

  const desc = asText(pick(rec, [/descri|abstract|sottotitolo|subtitle|testo|body/i])?.value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const cats = asText(pick(rec, [/categor|tipolog|tag|target|pubblico|audience|genere/i])?.value);
  const place = asText(pick(rec, [/luogo|venue|sede|location_name|spazio|indirizzo|address|place/i])?.value).trim();
  const url = asText(pick(rec, [/^url$|link|permalink|sito|web/i])?.value).trim();
  const free = asText(pick(rec, [/ingresso|prezzo|costo|price|biglietto|ticket/i])?.value);
  const text = `${asText(title.value)}\n${desc}\n${cats}\n${free}`;
  if (!source.kidsOnly && (!KIDS.test(text) || ADULTS.test(text))) return { skip: "non per bambini" };

  const g = parseFlyer(text, today);
  const pos = geo(rec);
  let zone = "Santo Stefano";
  let approx = true;
  if (pos) {
    const z = nearestZone(pos[0], pos[1]);
    if (z && z.d > 35) return { skip: "lontano da Bologna" };
    if (z) zone = z.name;
    approx = false;
  }
  const [lat, lng] = pos ?? ZONES[zone];
  const t = asText(title.value).trim();
  const minAge = g.minAge ?? 3;
  const maxAge = g.maxAge ?? 12;
  return {
    candidate: {
      slug: `ag-${startDay}-${slugify(t) || "evento"}`,
      title: t.slice(0, 120),
      category: g.category ?? "laboratorio",
      description: desc.slice(0, 260),
      minAge, maxAge,
      multiAgeNote: "",
      setting: g.setting ?? "indoor",
      weatherFit: g.setting === "outdoor" ? "dry_only" : "rain_ok",
      costBand: g.costBand ?? "low",
      priceNote: g.costBand ? "" : "costo da verificare",
      durationMin: null,
      bookingRequired: /prenotazion|prenotare|su prenotazione/i.test(text) ? true : null,
      address: place,
      zone,
      lat, lng,
      openingNote: "",
      sourceUrl: /^https?:\/\//.test(url) ? url : source.attributionUrl,
      status: "da_verificare",
      isDemo: false,
      event: {
        date: startDay,
        endDate: endDay !== startDay ? endDay : null,
        startTime: toTime(start.value) ?? g.startTime,
        endTime: toTime(end?.value) ?? g.endTime,
        organizer: source.name,
        origin: "agenda",
        approxPosition: approx,
      },
    },
  };
}

async function readOpendatasoft(source) {
  if (process.env.EVENTS_FIXTURE) {
    const rows = JSON.parse(readFileSync(process.env.EVENTS_FIXTURE, "utf8"));
    log(`- ${source.name}: ${rows.length} righe (fixture locale)`);
    return rows;
  }
  for (const base of source.bases) {
    const url = `${base}/api/explore/v2.1/catalog/datasets/${source.dataset}/exports/json`;
    try {
      const data = await getJson(url, 120000);
      const rows = Array.isArray(data) ? data : data.results ?? [];
      log(`- ${source.name}: ${rows.length} righe da ${base}`);
      if (rows[0]) log(`  campi: ${Object.keys(rows[0]).join(", ")}`);
      return rows;
    } catch (e) {
      log(`- ${source.name}: ${base} non risponde (${e.message})`);
    }
  }
  return [];
}

const all = [];
const skipped = {};
for (const source of SOURCES) {
  if (source.type !== "opendatasoft") continue;
  const rows = await readOpendatasoft(source);
  for (const r of rows) {
    const out = toCandidate(r, source);
    if (out.candidate) all.push(out.candidate);
    else skipped[out.skip] = (skipped[out.skip] ?? 0) + 1;
  }
}

const seen = new Set();
const candidates = all
  .filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)))
  .sort((a, b) => (a.event.date + (a.event.startTime ?? "")).localeCompare(b.event.date + (b.event.startTime ?? "")))
  .slice(0, MAX_CANDIDATES);

writeFileSync(new URL("../src/data/event-candidates.json", import.meta.url), JSON.stringify(candidates, null, 2) + "\n");

const lines = [
  `# ${candidates.length} eventi da approvare (${from} → ${to})`,
  "",
  candidates.length
    ? "Aprili nell'app (scheda **Eventi**, sezione *Da approvare*) dopo aver installato l'APK di questa settimana da **Releases**."
    : "Nessun evento per bambini trovato nelle agende online per le prossime due settimane.",
  "",
  ...candidates.slice(0, 40).map((c) => `- **${c.event.date}${c.event.startTime ? ` ${c.event.startTime}` : ""}** · ${c.title} · ${c.address || c.zone}${c.sourceUrl ? ` · [fonte](${c.sourceUrl})` : ""}`),
  "",
  "Ricorda le feste di parrocchia e di quartiere: non sono nelle agende online, aggiungile con **+ Aggiungi evento**.",
  "",
  "<details><summary>Dettagli tecnici</summary>",
  "",
  ...report,
  `- scartati: ${Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(", ") || "nessuno"}`,
  "",
  "</details>",
];
writeFileSync("events-report.md", lines.join("\n") + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `count=${candidates.length}\n`);
console.log(`OK: ${candidates.length} candidati`);
