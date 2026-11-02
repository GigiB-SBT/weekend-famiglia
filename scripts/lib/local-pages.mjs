// Reader for local sources without structured data: parish pages, weekly bulletins (PDF),
// comune/Pro Loco event pages. Finds family events (castagnata, festa, tombola, sagra…)
// that have a date, and returns them as candidates to approve. Text heuristics, no AI.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { parseDate, parseDateRange, parseFlyer, parseTimes } from "../../src/lib/events/parse.ts";

const COMUNI = JSON.parse(readFileSync(new URL("../../data/comuni.json", import.meta.url), "utf8"));
const GAZETTEER = Object.entries(COMUNI)
  .filter(([k]) => !k.startsWith("_"))
  .flatMap(([area, list]) => Object.entries(list).map(([name, [lat, lng]]) => ({ name, lat, lng, area })))
  .sort((a, b) => b.name.length - a.name.length); // longest first: "San Lazzaro di Savena" before "Bologna"
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’`]/g, "'");

/** Finds the most specific comune named in a text (city name only as last resort). */
export function findComune(text) {
  const t = norm(text);
  const hits = GAZETTEER.filter((c) => new RegExp(`(^|[^a-z])${norm(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t));
  return hits.find((c) => c.name !== "Bologna") ?? hits[0] ?? null;
}

const PDF_JS_VERSION = "5.4.624";
const UA = "weekend-famiglia-bot/1.0 (uso personale, 1 richiesta a settimana)";

// Family events typical of parishes and small towns.
const STRONG = /escursion[ei]|passeggiat[ae]|camminat[ae]|trekking|ciaspolat|raccolta (?:delle |di )?castagne|visita guidata|caccia ai funghi|sagr[ae]|fiera|festa (?:di|de[li]+) san |festa (?:della|del|dei|delle) (?:castagn|vin|olio|tartuf|polent|tortell|ravio|cappellett|crescent|zucca|uva|mosto|porchett|olive|pesce|brodett)|mercatin|castagnat|castagne|marroni|caldarrost|vin brul|halloween|tombol|sagra|mercatin|presepe vivente|presepi viventi|befana|carneval|burattin|marionett|spettacolo|pesca di beneficenza|lotteria|crescentin|tigell|polentat|gnoccat|tortellin(?:ata)?|grigliat|festa (?:della|di|del) (?:comunit|famigli|parrocchi|quartiere|paese|borgo|autunno|primavera|estate|natale|halloween|bambin|ragazz)|festa insieme|giochi per (?:bambini|ragazzi|tutti)|caccia al tesoro|laborator\w* per bambin|cinema per (?:bambini|ragazzi|famiglie)|teatro per (?:bambini|ragazzi|famiglie)/i;
// Purely liturgical / pastoral notices are not weekend outings.
const LITURGY_ONLY = /^(?:(?!castagn|tombol|sagra|mercatin|festa|giochi|spettacol|crescentin|pranzo|cena|merenda).)*(?:santa messa|s\. messa|messa|rosario|adorazione|confession|catechism|celebrazion|liturgi|veglia|novena|esequie|funeral)/i;

export async function fetchText(url, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("pdf") || /\.pdf(?:$|\?)/i.test(url)) return { kind: "pdf", buffer: new Uint8Array(await res.arrayBuffer()) };
    return { kind: "html", text: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&agrave;/g, "à").replace(/&egrave;/g, "è").replace(/&eacute;/g, "é").replace(/&igrave;/g, "ì").replace(/&ograve;/g, "ò").replace(/&ugrave;/g, "ù")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

/** PDF links on a page that look like bulletins/notices, most recent first (page order). */
export function findPdfLinks(html, baseUrl, pattern) {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hint = new RegExp(pattern || "avvis|bollett|fogli|notiziar|settiman|domenical|informator|giornalino|programma|volantin|locandin", "i");
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = htmlToText(m[2]);
    const isPdf = /\.pdf(?:$|\?)/i.test(href) || /attachments\/download|download\.php|\/download\/|[?&]download=/i.test(href);
    if (!isPdf) continue;
    if (!hint.test(href) && !hint.test(label)) continue;
    try {
      out.push(new URL(href, baseUrl).href);
    } catch {
      /* ignore bad links */
    }
  }
  return [...new Set(out)];
}

let pdfjs = null;
export async function pdfToText(buffer) {
  if (!pdfjs) {
    // Installed on demand in a private folder, so the weekly job doesn't need the whole project's dependencies.
    const dir = join(tmpdir(), `wf-pdfjs-${PDF_JS_VERSION}`);
    const entry = join(dir, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs");
    if (!existsSync(entry)) {
      mkdirSync(dir, { recursive: true });
      execSync(`npm install --prefix "${dir}" --no-save --no-audit --no-fund --no-package-lock pdfjs-dist@${PDF_JS_VERSION}`, { stdio: "ignore" });
    }
    pdfjs = await import(pathToFileURL(entry).href);
  }
  const doc = await pdfjs.getDocument({ data: buffer, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = "";
      }
      line += item.str + (item.hasEOL ? "\n" : " ");
      lastY = y;
    }
    lines.push(line.trim());
    pages.push(lines.filter(Boolean).join("\n"));
  }
  return pages.join("\n");
}

/**
 * Splits text into small blocks (paragraph-ish) and returns those that describe a dated family event.
 * @param {string} text
 * @param {{ ref?: Date, from?: string, to?: string, maxDays?: number, listing?: boolean }} [opts]
 */
export function extractEvents(text, opts = {}) {
  const { ref = new Date(), from, to, maxDays = 45, listing = false } = opts;
  const blocks = text
    .split(/\n(?=\s*(?:[A-ZÀ-Ý•\-–*▪●]|\d{1,2}[\s/.]))/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 2 && b.length < 900);
  const found = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!STRONG.test(block) || LITURGY_ONLY.test(block)) continue;
    // The date may sit in the block or in the one just before (e.g. "DOMENICA 8 NOVEMBRE" heading).
    // Bulletins put the date before (heading); listings (sagre sites) put town and date after the title.
    const withPrev = listing ? `${block} ${blocks[i + 1] ?? ""} ${blocks[i + 2] ?? ""}` : `${blocks[i - 1] ?? ""} ${block}`;
    const range = parseDateRange(block, ref) ?? parseDateRange(withPrev, ref);
    const date = range?.start ?? parseDate(block, ref) ?? parseDate(withPrev, ref);
    if (!date) continue;
    const endDate = range && range.end !== range.start ? range.end : null;
    // Keep events touching the window; skip very long ones (Christmas villages lasting months are not news).
    if ((from && (endDate ?? date) < from) || (to && date > to)) continue;
    if (endDate && (Date.parse(endDate) - Date.parse(date)) / 86400000 > maxDays) continue;
    const explicitDate = /\b\d{1,2}\s+(?:gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)|\b\d{1,2}[/.-]\d{1,2}/i.test(withPrev);
    const times = parseTimes(block);
    const g = parseFlyer(`${block} ${blocks[i + 1] ?? ""}`, ref);
    const kw = block.match(STRONG)?.[0] ?? "evento";
    const title = makeTitle(block, kw);
    const comune = findComune(block) ?? findComune(withPrev);
    found.push({ title, date, endDate, startTime: times.start, endTime: times.end, text: block.slice(0, 260), guess: g, explicitDate, comune });
  }
  // One per (date, keyword): bulletins repeat announcements.
  const seen = new Set();
  return found.filter((e) => {
    const k = `${e.date}|${e.title.toLowerCase().slice(0, 30)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function makeTitle(block, kw) {
  // Prefer the sentence containing the keyword.
  const sentences = block.split(/(?<=[.!?])\s+/);
  const s = sentences.find((x) => x.toLowerCase().includes(kw.toLowerCase())) ?? block;
  let t = s.replace(/^[\s•\-–*▪●]+/, "").trim();
  if (t.length > 90) t = `${t.slice(0, 87).replace(/\s+\S*$/, "")}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
