import type { CostBand, Family, Recommendation, ScoredActivity } from "@/lib/engine/types";
import { agesLabel, FEEDBACK_QUESTION } from "./draft";
import { eventWhen } from "@/lib/events/store";

/**
 * HTML version of the Friday email — brand v2 (sky blue, coral, sun yellow).
 * Email-safe: table layout, inline styles, web fonts with safe fallbacks.
 */

export const BRAND = {
  blue: "#1d5fd1",
  coral: "#ff6b4a",
  sun: "#ffc93c",
  navy: "#10223f",
  ink2: "#4c5d7c",
  sky: "#f4f7ff",
  line: "#dbe4f3",
  okBg: "#e9f7ee",
  ok: "#1f7a4a",
} as const;

/** One color per child, in age order — the same in email and app. */
export const KID_COLORS = [BRAND.coral, "#f0b000", BRAND.blue, "#7a4bd6", "#1f9e8f", "#d64b8a", "#6b7a99", "#b0671d"];

const DISPLAY = "'Bricolage Grotesque', 'Trebuchet MS', Arial, sans-serif";
const BODY = "'DM Sans', 'Helvetica Neue', Arial, sans-serif";
const COST: Record<CostBand, string> = { free: "Gratis", low: "fino a 10 € a testa", mid: "10–25 € a testa", high: "oltre 25 € a testa" };
const NUM_BG = [BRAND.coral, BRAND.sun, BRAND.blue];
const NUM_FG = ["#ffffff", BRAND.navy, "#ffffff"];

export interface HtmlOptions {
  /** Address families reply to for feedback / STOP. */
  replyTo?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? escapeHtml(u) : "#";
}

function km(d: number | null) {
  return d == null ? null : `${d.toFixed(1).replace(".", ",")} km`;
}

function compatLine(s: ScoredActivity, n: number) {
  if (s.compatibility === "all_children") return n === 1 ? "Adatta all'età di tuo figlio" : n === 2 ? "Va bene per tutti e due" : n === 3 ? "Va bene per tutti e tre" : "Va bene per tutti";
  if (s.compatibility === "adaptable") return "Adattabile per tutti";
  return "Solo per alcuni dei figli";
}

function kidChips(ages: number[]) {
  return [...ages]
    .sort((a, b) => a - b)
    .map(
      (a, i) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px 5px 8px;border-radius:999px;background:#ffffff;font:700 14px ${BODY};color:${BRAND.navy}"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${KID_COLORS[i % KID_COLORS.length]};margin-right:6px;vertical-align:-1px"></span>${a} anni</span>`,
    )
    .join("");
}

function ideaBlock(s: ScoredActivity, i: number, kids: number) {
  const a = s.activity;
  const meta = [COST[a.costBand], km(s.distanceKm), a.bookingRequired ? "su prenotazione" : null].filter(Boolean).join(" · ");
  return `
<tr><td style="padding:0 24px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;border:1px solid ${BRAND.line}">
    <tr><td style="padding:18px 18px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" style="padding-right:12px"><div style="width:34px;height:34px;line-height:34px;border-radius:999px;background:${NUM_BG[i % 3]};color:${NUM_FG[i % 3]};text-align:center;font:800 17px ${DISPLAY}">${i + 1}</div></td>
        <td valign="top">
          <div style="font:800 20px/1.2 ${DISPLAY};color:${BRAND.navy};letter-spacing:-0.01em">${escapeHtml(a.title)}</div>
          ${a.event ? `<div style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:999px;background:${BRAND.coral};color:#ffffff;font:700 12px ${BODY}">Solo questo weekend · ${escapeHtml(eventWhen(a))}</div>` : ""}
          <div style="font:400 14px/1.4 ${BODY};color:${BRAND.ink2};padding-top:4px">${escapeHtml(a.address && a.event ? a.address : a.zone)}</div>
        </td>
      </tr></table>
      <div style="font:400 15px/1.5 ${BODY};color:${BRAND.navy};padding:12px 0 10px">${escapeHtml(a.description)}</div>
      <div style="padding-bottom:12px">
        <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:${BRAND.okBg};color:${BRAND.ok};font:700 13px ${BODY}">${compatLine(s, kids)}</span>
        <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:#fff3cf;color:${BRAND.navy};font:700 13px ${BODY}">${escapeHtml(meta)}</span>
      </div>
      ${a.sourceUrl ? `<a href="${safeUrl(a.sourceUrl)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:${BRAND.navy};color:#ffffff;text-decoration:none;font:700 14px ${BODY}">Orari e info →</a>` : ""}
    </td></tr>
  </table>
</td></tr>`;
}

export function buildHtml(family: Family, rec: Recommendation, opts: HtmlOptions = {}): string {
  const replyTo = opts.replyTo ?? "[TUA EMAIL]";
  const ages = family.childrenAges;
  const w = rec.weather;
  const weatherLine =
    w.source === "fallback"
      ? "Previsioni non disponibili: tieni pronto il piano B."
      : w.rainy
        ? `Pioggia probabile (${w.rainProbability}%): abbiamo scelto idee al coperto.`
        : `Weekend asciutto${w.tempMax != null ? `, massime intorno ai ${w.tempMax}°` : ""}.`;

  const ideas = rec.ideas.map((s, i) => ideaBlock(s, i, ages.length)).join("");
  const planB = rec.planB
    ? `
<tr><td style="padding:6px 24px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.coral};border-radius:20px">
    <tr><td style="padding:18px">
      <div style="font:800 22px/1.1 ${DISPLAY};color:#ffffff">Se piove</div>
      <div style="font:700 17px/1.3 ${BODY};color:${BRAND.navy};padding-top:6px">${escapeHtml(rec.planB.activity.title)}${km(rec.planB.distanceKm) ? ` · ${km(rec.planB.distanceKm)}` : ""}</div>
      <div style="font:400 14px/1.45 ${BODY};color:#fff7f4;padding-top:4px">${escapeHtml(rec.planB.activity.multiAgeNote || rec.planB.activity.description)}</div>
      <a href="${safeUrl(rec.planB.activity.sourceUrl)}" style="display:inline-block;margin-top:10px;font:700 14px ${BODY};color:${BRAND.navy}">Orari e info →</a>
    </td></tr>
  </table>
</td></tr>`
    : "";

  const fb = (label: string, answer: string, bg: string, fg: string) =>
    `<a href="mailto:${escapeHtml(replyTo)}?subject=${encodeURIComponent(`Weekend: ${answer}`)}" style="display:inline-block;margin:0 6px 6px 0;padding:10px 20px;border-radius:999px;background:${bg};color:${fg};text-decoration:none;font:700 15px ${BODY}">${label}</a>`;

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weekend in Famiglia</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&amp;family=DM+Sans:wght@400;700&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${BRAND.sky}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.sky}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:0 0 18px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.blue};border-radius:24px">
      <tr><td style="padding:26px 24px 22px">
        <div style="font:700 13px ${BODY};color:#cfe0ff;letter-spacing:0.02em">Weekend in Famiglia · Bologna</div>
        <div style="font:800 34px/1 ${DISPLAY};color:#ffffff;letter-spacing:-0.03em;padding:10px 0 4px">3 idee per<br><span style="color:${BRAND.sun}">${escapeHtml(agesLabel(ages))}</span></div>
        <div style="font:400 15px/1.45 ${BODY};color:#e6efff;padding:6px 0 14px">${escapeHtml(weatherLine)}</div>
        <div>${kidChips(ages)}</div>
      </td></tr>
    </table>
  </td></tr>
  ${ideas}
  ${planB}
  <tr><td style="padding:6px 24px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.navy};border-radius:20px">
      <tr><td style="padding:18px">
        <div style="font:800 20px/1.2 ${DISPLAY};color:#ffffff;padding-bottom:12px">${escapeHtml(FEEDBACK_QUESTION)}</div>
        ${fb("Sì", "SI", BRAND.sun, BRAND.navy)}${fb("Forse", "FORSE", "#22375c", "#ffffff")}${fb("No", "NO", "#22375c", "#ffffff")}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:8px 28px 24px;font:400 12px/1.5 ${BODY};color:${BRAND.ink2}">
    Orari e prezzi sono indicativi: controlla sempre il link prima di uscire.<br>
    Non vuoi più ricevere queste mail? Rispondi «STOP» a ${escapeHtml(replyTo)}.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
