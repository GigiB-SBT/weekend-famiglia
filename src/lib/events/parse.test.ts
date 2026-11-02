import { describe, expect, it } from "vitest";
import { parseDate, parseDateRange, parseFlyer, parseTimes } from "./parse";

// Sunday 1 Nov 2026
const ref = new Date(2026, 10, 1, 16, 0);

describe("parseDate", () => {
  it("reads '8 novembre' and '8/11'", () => {
    expect(parseDate("Domenica 8 novembre", ref)).toBe("2026-11-08");
    expect(parseDate("il 8/11 in parrocchia", ref)).toBe("2026-11-08");
  });
  it("rolls past dates to next year when no year given", () => {
    expect(parseDate("10 ottobre", ref)).toBe("2027-10-10");
  });
  it("reads weekday names (today counts)", () => {
    expect(parseDate("domenica pomeriggio", ref)).toBe("2026-11-01");
    expect(parseDate("sabato", ref)).toBe("2026-11-07");
  });
  it("does not mistake a time for a date", () => {
    expect(parseDate("ore 15.30", ref)).toBeNull();
  });
});

describe("parseDateRange", () => {
  it("reads Italian and English ranges", () => {
    expect(parseDateRange("Sagra dal 6 al 15 novembre", ref)).toEqual({ start: "2026-11-06", end: "2026-11-15" });
    expect(parseDateRange("7 e 8 novembre 2026", ref)).toEqual({ start: "2026-11-07", end: "2026-11-08" });
    expect(parseDateRange("6 November – 15 November 2026", ref)).toEqual({ start: "2026-11-06", end: "2026-11-15" });
    expect(parseDateRange("15 November – 6 January 2027", ref)).toEqual({ start: "2026-11-15", end: "2027-01-06" });
    expect(parseDateRange("Dal 31/10/2026 Al 01/11/2026", ref)).toEqual({ start: "2026-10-31", end: "2026-11-01" });
  });
  it("keeps a running sagra in the current year", () => {
    const mid = new Date(2026, 10, 10);
    expect(parseDateRange("dal 6 al 15 novembre", mid)).toEqual({ start: "2026-11-06", end: "2026-11-15" });
  });
  it("returns null for a single date", () => {
    expect(parseDateRange("domenica 8 novembre ore 16", ref)).toBeNull();
  });
});

describe("parseTimes", () => {
  it("reads ranges and single times", () => {
    expect(parseTimes("dalle 15 alle 18")).toEqual({ start: "15:00", end: "18:00" });
    expect(parseTimes("ore 15:30-18")).toEqual({ start: "15:30", end: "18:00" });
    expect(parseTimes("alle 16.30")).toEqual({ start: "16:30", end: null });
    expect(parseTimes("domenica pomeriggio")).toEqual({ start: "15:00", end: null });
  });
});

describe("parseFlyer", () => {
  it("pre-fills a parish chestnut party", () => {
    const g = parseFlyer(
      "Castagnata in parrocchia!\nDomenica 8 novembre dalle 15 alle 18 sul sagrato.\nCaldarroste, giochi per bambini, offerta libera.",
      ref,
    );
    expect(g.title).toBe("Castagnata in parrocchia!");
    expect(g.date).toBe("2026-11-08");
    expect(g.startTime).toBe("15:00");
    expect(g.endTime).toBe("18:00");
    expect(g.category).toBe("festa");
    expect(g.costBand).toBe("free");
    expect(g.setting).toBe("outdoor");
    expect(g.minAge).toBe(0);
  });
  it("reads 'dai 2 ai 5 anni'", () => {
    const g = parseFlyer("Toc toc: spettacolo per bambini dai 2 ai 5 anni", ref);
    expect([g.minAge, g.maxAge]).toEqual([2, 5]);
    expect(parseFlyer("da 6 a 10 anni", ref).maxAge).toBe(10);
  });
  it("reads ages, price and link", () => {
    const g = parseFlyer("Laboratorio di Natale 6-10 anni, sabato 12 dicembre ore 10, 8 € https://example.org/lab.", ref);
    expect(g.category).toBe("laboratorio");
    expect([g.minAge, g.maxAge]).toEqual([6, 10]);
    expect(g.costBand).toBe("low");
    expect(g.url).toBe("https://example.org/lab");
    expect(g.date).toBe("2026-12-12");
  });
});
