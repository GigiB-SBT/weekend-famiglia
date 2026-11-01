import type { Category, CostBand, Setting } from "@/lib/engine/types";

/**
 * Heuristic reader for event flyers / WhatsApp messages (no AI).
 * It only PRE-FILLS the form: the founder always checks before saving.
 */

export interface FlyerGuess {
  title: string | null;
  date: string | null; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null;
  category: Category | null;
  costBand: CostBand | null;
  setting: Setting | null;
  minAge: number | null;
  maxAge: number | null;
  url: string | null;
}

const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
};
const WEEKDAYS: Record<string, number> = {
  domenica: 0, lunedi: 1, "lunedì": 1, martedi: 2, "martedì": 2, mercoledi: 3, "mercoledì": 3,
  giovedi: 4, "giovedì": 4, venerdi: 5, "venerdì": 5, sabato: 6,
};

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/castagnat|castagne|sagra|festa|crescentin|tombola|mercatin|merenda|polenta|gnocch|caldarrost|befana|presepe|carnevale/i, "festa"],
  [/teatro|spettacol|burattin|marionett|cinema|film|concerto|musical|clown|circo|magia/i, "spettacolo"],
  [/laborator|workshop|atelier|creativ|costruiamo|impariamo/i, "laboratorio"],
  [/lettur|libr|biblioteca|storie|racconti|narrazion/i, "biblioteca"],
  [/museo|mostra|visita guidata/i, "museo"],
  [/passeggiat|escursion|parco|natura|bosco|trekking|orto|giardin/i, "natura"],
  [/fattoria|animali|cavall|pony|asin/i, "fattoria"],
  [/sport|calcio|basket|pallavolo|bici|corsa|nuoto|arrampic|torneo|minivolley/i, "sport"],
  [/scienz|esperiment|planetari|stelle|astronom|robot|coding/i, "scienza"],
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Picks the next occurrence of day/month on or after `ref` (events are announced ahead). */
function resolveDay(day: number, month: number, year: number | null, ref: Date): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let y = year ?? ref.getFullYear();
  if (y < 100) y += 2000;
  let d = new Date(y, month - 1, day);
  if (d.getMonth() !== month - 1) return null;
  if (year == null) {
    const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    if (d < refDay) d = new Date(y + 1, month - 1, day);
  }
  return iso(d);
}

export function parseDate(text: string, ref: Date = new Date()): string | null {
  const t = text.toLowerCase();
  // 8 novembre (2026)
  const m1 = t.match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\.?(?:\s+(\d{4}))?\b/);
  if (m1) return resolveDay(Number(m1[1]), MONTHS[m1[2]], m1[3] ? Number(m1[3]) : null, ref);
  // 8/11(/2026)  8.11  8-11
  const m2 = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m2 && !/^\d{1,2}[.:]\d{2}$/.test(m2[0])) {
    const r = resolveDay(Number(m2[1]), Number(m2[2]), m2[3] ? Number(m2[3]) : null, ref);
    if (r) return r;
  }
  // "domenica" / "sabato prossimo" → next such weekday (today counts)
  const wd = Object.keys(WEEKDAYS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (wd) {
    const target = WEEKDAYS[wd];
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const delta = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + delta);
    return iso(d);
  }
  if (/\bdomani\b/.test(t)) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1);
    return iso(d);
  }
  return null;
}

function normTime(h: string, m?: string) {
  const hh = Number(h);
  const mm = m ? Number(m) : 0;
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${pad(mm)}`;
}

export function parseTimes(text: string): { start: string | null; end: string | null } {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const range = t.match(/(?:dalle\s*(?:ore\s*)?)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|alle|a)\s*(?:ore\s*)?(\d{1,2})(?:[:.](\d{2}))?/);
  if (range && (/dalle|ore|[:.]\d{2}/.test(range[0]) || /-|–/.test(range[0]))) {
    const start = normTime(range[1], range[2]);
    const end = normTime(range[3], range[4]);
    if (start && end && start < end) return { start, end };
  }
  const single = t.match(/\b(?:ore|alle|dalle|h)\s*(\d{1,2})(?:[:.](\d{2}))?/) ?? t.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (single) return { start: normTime(single[1], single[2]), end: null };
  if (/pomeriggio/.test(t)) return { start: "15:00", end: null };
  if (/mattin/.test(t)) return { start: "10:00", end: null };
  if (/sera\b|serata/.test(t)) return { start: "19:00", end: null };
  return { start: null, end: null };
}

export function parseFlyer(text: string, ref: Date = new Date()): FlyerGuess {
  const clean = text.trim();
  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const title = firstLine ? firstLine.replace(/[*_~]/g, "").slice(0, 90) : null;
  const lower = clean.toLowerCase();

  const category = CATEGORY_WORDS.find(([re]) => re.test(clean))?.[1] ?? null;
  let costBand: CostBand | null = null;
  if (/gratuit|gratis|ingresso libero|offerta libera|free/i.test(clean)) costBand = "free";
  else {
    const euro = clean.match(/(\d{1,3})(?:[.,]\d{1,2})?\s*(?:€|euro)/i) ?? clean.match(/€\s*(\d{1,3})/);
    if (euro) {
      const v = Number(euro[1]);
      costBand = v <= 10 ? "low" : v <= 25 ? "mid" : "high";
    }
  }
  let setting: Setting | null = null;
  if (/al chiuso|al coperto|salone|teatro|sala|biblioteca|palestra/i.test(clean)) setting = "indoor";
  else if (/all'aperto|all’aperto|parco|piazza|cortile|campo|giardino|sagrato/i.test(clean)) setting = "outdoor";

  let minAge: number | null = null;
  let maxAge: number | null = null;
  const ageRange = lower.match(/(\d{1,2})\s*[-–a]\s*(\d{1,2})\s*anni/);
  const agePlus = lower.match(/dai\s*(\d{1,2})\s*anni/);
  if (ageRange) {
    minAge = Number(ageRange[1]);
    maxAge = Number(ageRange[2]);
  } else if (agePlus) {
    minAge = Number(agePlus[1]);
    maxAge = 17;
  } else if (/famigli|tutti|grandi e piccini|bambini/i.test(clean)) {
    minAge = 0;
    maxAge = 17;
  }
  if (minAge != null && maxAge != null && (minAge > 17 || maxAge > 17 || minAge > maxAge)) {
    minAge = null;
    maxAge = null;
  }

  const { start, end } = parseTimes(clean);
  const url = clean.match(/https?:\/\/\S+/)?.[0]?.replace(/[)>.,]+$/, "") ?? null;

  return { title, date: parseDate(clean, ref), startTime: start, endTime: end, category, costBand, setting, minAge, maxAge, url };
}
