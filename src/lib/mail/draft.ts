import type { Compatibility, Family, Recommendation, ScoredActivity } from "@/lib/engine/types";
import { eventWhen } from "@/lib/events/store";

export interface MailDraft {
  to: string;
  subject: string;
  text: string;
}

const COMPAT_LABEL: Record<Compatibility, string> = {
  all_children: "va bene per tutti",
  adaptable: "adattabile per tutti",
  partial: "solo per alcuni",
  none: "",
};

const COST_LABEL = { free: "gratis", low: "fino a 10 € a testa", mid: "10-25 € a testa", high: "oltre 25 € a testa" };

export const FEEDBACK_QUESTION = "Ne farete una questo weekend?";
export const FEEDBACK_OPTIONS = ["Sì, la #1/#2/#3", "Forse", "No, nessuna fa per noi"];

export function compatLabel(c: Compatibility) {
  return COMPAT_LABEL[c];
}

export function agesLabel(ages: number[]) {
  const sorted = [...ages].sort((a, b) => a - b);
  if (sorted.length === 1) return `${sorted[0]} anni`;
  return `${sorted.slice(0, -1).join(", ")} e ${sorted[sorted.length - 1]} anni`;
}

function ideaLines(s: ScoredActivity, i: number): string {
  const a = s.activity;
  const dist = s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km` : "distanza da verificare";
  return [
    `${i}. ${a.title} — ${a.zone}${a.event ? ` · ${eventWhen(a)}` : ""}`,
    `   ${a.description}`,
    `   Età: ${compatLabel(s.compatibility)}. ${a.multiAgeNote}`,
    `   Costo: ${COST_LABEL[a.costBand]}${a.priceNote ? ` (${a.priceNote})` : ""} · ${dist}${a.bookingRequired ? " · prenotare" : ""}`,
    `   Info: ${a.sourceUrl}`,
  ].join("\n");
}

export function buildDraft(family: Family, rec: Recommendation): MailDraft {
  const w = rec.weather;
  const meteo =
    w.source === "fallback"
      ? "Meteo non disponibile: tenete pronto il piano B."
      : w.rainy
        ? `Si prevede pioggia (probabilità fino al ${w.rainProbability}%): abbiamo privilegiato idee al coperto.`
        : `Weekend asciutto previsto${w.tempMax != null ? `, massime intorno ai ${w.tempMax}°C` : ""}.`;

  const ideas = rec.ideas.map((s, i) => ideaLines(s, i + 1)).join("\n\n");
  const planB = rec.planB
    ? `SE PIOVE\n${rec.planB.activity.title} (${rec.planB.activity.zone}) — ${rec.planB.activity.multiAgeNote}\nInfo: ${rec.planB.activity.sourceUrl}`
    : "SE PIOVE\nNessuna alternativa al coperto nel vostro raggio questa settimana.";

  const text = [
    `Ciao! Ecco 3 idee per questo weekend, pensate per figli di ${agesLabel(family.childrenAges)}.`,
    meteo,
    "",
    ideas,
    "",
    planB,
    "",
    `${FEEDBACK_QUESTION} Rispondi a questa mail con: ${FEEDBACK_OPTIONS.join(" / ")}.`,
    "",
    "Orari e prezzi sono indicativi: controllate sempre il link prima di uscire.",
    "Non vuoi più ricevere queste mail? Rispondi \"STOP\".",
  ].join("\n");

  return {
    to: family.email,
    subject: `Weekend in famiglia: 3 idee per ${agesLabel(family.childrenAges)}`,
    text,
  };
}
