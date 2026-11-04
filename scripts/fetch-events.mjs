#!/usr/bin/env node
// Weekly reader of public event agendas → src/data/event-candidates.json (status "da_verificare").
// Runs in GitHub Actions (internet access). Writes events-report.md for the founder's email (GitHub issue).
// Source: Comune di Bologna "Agenda Cultura" open data (Opendatasoft, CC BY-SA 4.0).
// The Agenda excludes sagre and religious events: parishes are added by hand in the app.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { parseFlyer } from "../src/lib/events/parse.ts";
import { extractEvents, extractVenueEvents, fetchText, findPdfLinks, htmlToText, pdfToText } from "./lib/local-pages.mjs";

const SOURCES = JSON.parse(readFileSync(process.env.EVENTS_SOURCES ?? new URL("../data/event-sources.json", import.meta.url), "utf8"));
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
const MAX_ADULTS = 100;

// Adults section: category from the text (culture, music & shows, food, parties, talks).
function adultCategory(text) {
  const t = text.toLowerCase();
  if (/dj ?set|\bdj\b|clubbing|club night|discoteca|disco |party|serata|after ?hour|techno|house music|karaoke|open bar/.test(t)) return "notte";
  if (/degustaz|vino|vini|wine|cantina|birra|aperitiv|cena |cene |food|enogastronom|mercato contadino|street food|cioccolat|tartuf|olio|chef|cucina/.test(t)) return "gusto";
  if (/sagra|fiera|festa|carneval|mercatin/.test(t)) return "festa";
  if (/concert|musica|jazz|blues|\brock\b|\bpop\b|\bindie\b|\brap\b|hip.?hop|\bmetal\b|\bpunk\b|\bfolk\b|cantautor|orchestra|sinfoni|filarmonic|quartetto|\btrio\b|\blive\b|\bband\b|\bcoro\b|opera lirica|recital|tour 20\d\d|in concerto|unplugged|acustico/.test(t)) return "musica";
  if (/teatro|spettacol|danza|balletto|commedia|cabaret|stand.?up|musical|circo|cinema|film|proiezion|rassegna/.test(t)) return "spettacolo";
  if (/mostra|museo|esposizion|visita guidata|pinacoteca|galleria|archeolog|arte /.test(t)) return "museo";
  if (/passeggiat|escursion|trekking|camminat|bici/.test(t)) return "natura";
  return "incontro";
}
// Explicit signals that an event is FOR children (generic words like "laboratorio" or "ragazzi" alone are not enough).
const KIDS = /bambin|per (?:i )?ragazz|ragazze e ragazzi|bimb|famigli|piccol[ie]|infanzia|0-18|zerodiciotto|under\s?1[0-6]|\bkids\b|letture animate|lettura animata|burattin|marionett|teatro ragazzi|teatro per ragazzi|nati per leggere|nati per la musica|\b(?:dai|da|dagli)\s?\d{1,2}\s?(?:ai|a)\s?\d{1,2}\s?anni|\bdai\s?\d{1,2}\s?anni|\b\d{1,2}\s?[-–]\s?\d{1,2}\s?anni|scuol[ae] (?:dell'infanzia|primari)/i;
// Events ABOUT children (talks, conferences) are not FOR children unless they say so explicitly.
const TALK = /convegn|conferenz|seminari|tavola rotonda|presentazione del (?:libro|volume)|incontro pubblico|dibattito|webinar|giornata di studi|formazione per (?:insegnanti|educatori|docenti)/i;
const STRONG_KIDS = /per (?:i )?bambin|per (?:le )?famigli|per (?:i )?ragazz|per (?:i )?piccol|\b(?:dai|da)\s?\d{1,2}\s?(?:ai|a)?\s?\d{0,2}\s?anni|\b\d{1,2}\s?[-–]\s?\d{1,2}\s?anni|letture animate|lettura animata|burattin|teatro ragazzi/i;
// Signals of adult-only content that win over a weak kids match.
const ADULTS = /vietato ai minori|\+18|solo adulti|per adulti|\bover\s?18/i;

const report = [];
const sourceStatus = []; // { name, ok, n }
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
  const forKids =
    source.kidsOnly || (KIDS.test(text) && !ADULTS.test(text) && !(TALK.test(text) && !STRONG_KIDS.test(text)));

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
  const minAge = forKids ? g.minAge ?? 3 : 0;
  const maxAge = forKids ? g.maxAge ?? 12 : 17;
  return {
    [forKids ? "candidate" : "adult"]: {
      slug: `ag-${startDay}-${slugify(t) || "evento"}`,
      title: t.slice(0, 120),
      category: forKids ? g.category ?? "laboratorio" : adultCategory(text),
      audience: forKids ? "famiglie" : "adulti",
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

/** Parish pages, weekly bulletins (PDF), comune / Pro Loco pages without structured data. */
async function readPage(source) {
  const out = [];
  let texts = [];
  try {
    const page = await fetchText(source.url);
    if (page.kind === "pdf") {
      texts.push({ url: source.url, text: await pdfToText(page.buffer) });
    } else {
      texts.push({ url: source.url, text: htmlToText(page.text) });
      // News/category pages show only excerpts: open the latest posts too.
      if (source.followLinks) {
        const re = new RegExp(source.followLinks, "i");
        const links = [...page.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)]
          .map((m) => { try { return new URL(m[1], source.url).href; } catch { return null; } })
          .filter((u) => u && re.test(u) && u !== source.url);
        for (const postUrl of [...new Set(links)].slice(0, source.maxLinks ?? 5)) {
          try {
            const post = await fetchText(postUrl);
            if (post.kind === "html") texts.push({ url: postUrl, text: htmlToText(post.text) });
          } catch (e) {
            log(`  ${source.name}: articolo non letto (${e.message})`);
          }
        }
      }
      for (const pdfUrl of findPdfLinks(page.text, source.url, source.pdfPattern).slice(0, source.maxPdfs ?? 2)) {
        try {
          const pdf = await fetchText(pdfUrl);
          const text = pdf.kind === "pdf" ? await pdfToText(pdf.buffer) : htmlToText(pdf.text);
          texts.push({ url: pdfUrl, text });
        } catch (e) {
          log(`  ${source.name}: PDF non letto (${e.message})`);
        }
      }
    }
  } catch (e) {
    log(`- ${source.name}: non raggiungibile (${e.message})`);
    sourceStatus.push({ name: source.name, ok: false, n: 0 });
    return out;
  }
  let n = 0;
  for (const { url, text } of texts) {
    const found = source.mode === "venue"
      ? extractVenueEvents(text, { ref: today, from, to })
      : extractEvents(text, { ref: today, from, to, listing: Boolean(source.listing) });
    for (const ev of found) {
      // Aggregators list many towns: use the comune named in the text when the source asks for it.
      const where = source.geocode && ev.comune ? ev.comune : null;
      if (source.geocode && !where) continue; // can't place it: skip rather than guess
      const z = where ? where.name : source.zone ?? "Borgo Panigale-Reno";
      const [lat, lng] = where ? [where.lat, where.lng] : source.lat != null ? [source.lat, source.lng] : ZONES[z] ?? ZONES["Borgo Panigale-Reno"];
      const g = ev.guess;
      n++;
      out.push({
        slug: `loc-${ev.date}-${slugify(`${source.id}-${ev.title}`)}`,
        title: ev.title,
        category:
          source.category ??
          (source.audience === "adulti"
            ? ((c) => (c === "incontro" && source.categoryDefault ? source.categoryDefault : c))(adultCategory(ev.text))
            : g.category ?? "festa"),
        audience: source.audience ?? "tutti",
        description: ev.text,
        minAge: g.minAge ?? 0,
        maxAge: g.maxAge ?? 17,
        multiAgeNote: "",
        setting: g.setting ?? "mixed",
        weatherFit: g.setting === "indoor" ? "rain_ok" : g.setting === "outdoor" ? "dry_only" : "any",
        costBand: g.costBand ?? "free",
        priceNote: g.costBand ? "" : "costo da verificare",
        durationMin: null,
        bookingRequired: null,
        address: where ? where.name : source.address ?? source.name,
        zone: z,
        lat, lng,
        openingNote: ev.explicitDate ? "" : "data dedotta dal giorno della settimana: verificare",
        sourceUrl: url,
        status: "da_verificare",
        isDemo: false,
        event: {
          date: ev.date,
          endDate: ev.endDate,
          startTime: ev.startTime,
          endTime: ev.endTime,
          organizer: source.name,
          origin: "agenda",
          approxPosition: true,
        },
      });
    }
  }
  log(`- ${source.name}: ${texts.length} documenti letti, ${n} eventi trovati`);
  sourceStatus.push({ name: source.name, ok: true, n });
  return out;
}

const all = [];
const adultsAll = [];
const skipped = {};
// Monthly pages (sagre sites): one URL per month touched by the window.
const MONTHS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function expand(source) {
  if (!source.urlTemplate) return [source];
  const months = new Set([from.slice(0, 7), to.slice(0, 7)]);
  return [...months].map((ym) => {
    const [y, m] = ym.split("-").map(Number);
    const url = source.urlTemplate
      .replace("{monthIt}", MONTHS_IT[m - 1])
      .replace("{monthEn}", MONTHS_EN[m - 1])
      .replace("{year}", String(y))
      .replace("{mm}", String(m).padStart(2, "0"));
    return { ...source, url, name: `${source.name} · ${MONTHS_IT[m - 1]}` };
  });
}
for (const source of SOURCES.filter((s) => s.type === "page" && s.enabled !== false).flatMap(expand)) {
  for (const ev of await readPage(source)) (ev.audience === "adulti" ? adultsAll : all).push(ev);
}
for (const source of SOURCES) {
  if (source.type !== "opendatasoft") continue;
  const rows = await readOpendatasoft(source);
  for (const r of rows) {
    const out = toCandidate(r, source);
    if (out.candidate) all.push(out.candidate);
    else if (out.adult) adultsAll.push(out.adult);
    else skipped[out.skip] = (skipped[out.skip] ?? 0) + 1;
  }
}

const seen = new Set();
const candidates = all
  .filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)))
  .sort((a, b) => (a.event.date + (a.event.startTime ?? "")).localeCompare(b.event.date + (b.event.startTime ?? "")))
  .slice(0, MAX_CANDIDATES);

writeFileSync(new URL("../src/data/event-candidates.json", import.meta.url), JSON.stringify(candidates, null, 2) + "\n");

const seenAdults = new Set();
const adults = adultsAll
  .filter((c) => (seenAdults.has(c.slug) ? false : (seenAdults.add(c.slug), true)))
  .sort((a, b) => (a.event.date + (a.event.startTime ?? "")).localeCompare(b.event.date + (b.event.startTime ?? "")))
  .slice(0, MAX_ADULTS);
writeFileSync(new URL("../src/data/event-adults.json", import.meta.url), JSON.stringify(adults, null, 2) + "\n");
log(`- adulti: ${adults.length} eventi (cultura, musica, gusto, feste)`);
const generatedAt = new Date().toISOString();
writeFileSync(
  new URL("../src/data/event-candidates-meta.json", import.meta.url),
  JSON.stringify({ generatedAt, count: candidates.length, adults: adults.length, from, to }, null, 2) + "\n",
);

// "Codice eventi" for the email: the app imports it without reinstalling the APK.
const DROP = new Set(["multiAgeNote", "openingNote", "isDemo"]);
const compact = candidates.slice(0, 60).map((c) => {
  const o = {};
  for (const [k, v] of Object.entries(c)) {
    if (DROP.has(k) || v === null || v === "") continue;
    o[k] = k === "description" ? String(v).slice(0, 160) : v;
  }
  return o;
});
// Adults as compact tuples: [slug, title, category, date, endDate, start, end, place, lat, lng, url, costBand]
const r4 = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4);
let adultTuples = adults.map((a) => [
  a.slug, a.title.slice(0, 90), a.category, a.event.date, a.event.endDate, a.event.startTime, a.event.endTime,
  (a.address || "").slice(0, 60), r4(a.lat), r4(a.lng), a.sourceUrl, a.costBand,
]);
let importCode = JSON.stringify({ wf: 1, generatedAt, from, to, events: compact, adults: adultTuples });
while (importCode.length > 52000 && adultTuples.length > 0) {
  adultTuples = adultTuples.slice(0, Math.floor(adultTuples.length * 0.8));
  importCode = JSON.stringify({ wf: 1, generatedAt, from, to, events: compact, adults: adultTuples });
}

const lines = [
  `# ${candidates.length} eventi da approvare (${from} → ${to})`,
  "",
  `Sezione adulti: ${adults.length} eventi tra cultura, musica, gusto e feste (nessuna approvazione richiesta).`,
  "",
  candidates.length
    ? "Per vederli nell'app: copia il **codice eventi** in fondo (pulsante copia nell'angolo del riquadro), poi nell'app **Eventi → Importa eventi dalla mail → Incolla**. Non serve reinstallare l'APK."
    : "Nessun evento per bambini trovato nelle agende online per le prossime due settimane.",
  "",
  ...candidates.slice(0, 40).map((c) => `- **${c.event.date}${c.event.startTime ? ` ${c.event.startTime}` : ""}** · ${c.title} · ${c.address || c.zone}${c.sourceUrl ? ` · [fonte](${c.sourceUrl})` : ""}`),
  "",
  "## Fonti locali controllate",
  ...sourceStatus.map((x) => `- ${x.ok ? "✅" : "⚠️"} ${x.name}: ${x.ok ? `${x.n} eventi` : "non raggiungibile"}`),
  "",
  "Le feste che non sono online (volantini, WhatsApp, Facebook) aggiungile con **+ Aggiungi evento**. Per aggiungere una parrocchia o una Pro Loco da controllare ogni settimana, modifica `data/event-sources.json`.",
  "",
  "## Codice eventi",
  "",
  "```",
  importCode,
  "```",
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
