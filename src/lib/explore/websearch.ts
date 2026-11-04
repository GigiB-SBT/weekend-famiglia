/**
 * Ready-made web searches for events anywhere: the place and the weekend dates are filled in,
 * so one tap opens the right search. Events change too fast and too locally to be in a database.
 */
import type { Mode } from "./osm";

export interface WebSearch {
  label: string;
  url: string;
}

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "7-8 novembre" or "31 ottobre-1 novembre". */
export function weekendLabel(saturday: string, sunday: string): string {
  const [, ms, ds] = saturday.split("-").map(Number);
  const [, me, de] = sunday.split("-").map(Number);
  return ms === me ? `${ds}-${de} ${MONTHS[me - 1]}` : `${ds} ${MONTHS[ms - 1]}-${de} ${MONTHS[me - 1]}`;
}

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export function webSearches(place: string, mode: Mode, saturday: string, sunday: string): WebSearch[] {
  const w = weekendLabel(saturday, sunday);
  const common: [string, string][] = [
    ["Sagre e feste", `sagre feste ${place} ${w}`],
    ["Mercatini", `mercatini ${place} ${w}`],
  ];
  const family: [string, string][] = [
    ["Eventi per bambini", `eventi bambini ${place} weekend ${w}`],
    ["Laboratori e letture", `laboratori bambini ${place} ${w}`],
    ["Teatro per ragazzi", `teatro ragazzi ${place} ${w}`],
    ["Feste di parrocchia", `parrocchia festa ${place} ${w}`],
    ["Escursioni con bambini", `escursione facile bambini vicino ${place}`],
  ];
  const adults: [string, string][] = [
    ["Concerti live", `concerti ${place} ${w}`],
    ["Serate e dj set", `serata dj set ${place} ${w}`],
    ["Teatro e spettacoli", `spettacoli teatro ${place} ${w}`],
    ["Mostre", `mostre in corso ${place}`],
    ["Degustazioni e cene", `degustazione vini cena evento ${place} ${w}`],
  ];
  return [...(mode === "famiglia" ? family : adults), ...common].map(([label, q]) => ({ label, url: google(q) }));
}
