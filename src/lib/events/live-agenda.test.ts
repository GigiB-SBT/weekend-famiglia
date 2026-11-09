import { beforeEach, describe, expect, it } from "vitest";
import { fetchLiveAdults, liveAdults, toAdult } from "./live-agenda";

const rec = (o: Record<string, unknown>) => ({ data_inizio: "2026-11-14T20:30:00+00:00", geo_point_2d: { lat: 44.494, lon: 11.343 }, ...o });

describe("live agenda (adults)", () => {
  it("keeps adult events with Rome time and category", () => {
    const a = toAdult(rec({ titolo: "Concerto jazz al Bravo Caffè", categoria: "Musica" }), "2026-11-10", "2026-11-25");
    expect(a?.category).toBe("musica");
    expect(a?.event?.date).toBe("2026-11-14");
    expect(a?.event?.startTime).toBe("21:30");
    expect(a?.audience).toBe("adulti");
  });
  it("drops kids events, out-of-window and long exhibitions", () => {
    expect(toAdult(rec({ titolo: "Letture animate per bambini 3-6 anni" }), "2026-11-10", "2026-11-25")).toBeNull();
    expect(toAdult(rec({ titolo: "Concerto", data_inizio: "2026-12-30" }), "2026-11-10", "2026-11-25")).toBeNull();
    expect(toAdult(rec({ titolo: "Mostra lunga", data_inizio: "2026-10-01", data_fine: "2027-01-10" }), "2026-11-10", "2026-11-25")).toBeNull();
  });
  it("discovers the date field and pages through records", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(String(u));
      const body = String(u).includes("limit=1") && !String(u).includes("where")
        ? { results: [rec({ titolo: "x" })] }
        : { results: [rec({ titolo: "Spettacolo di danza" }), rec({ titolo: "Laboratorio per bambini 5-8 anni" })] };
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as unknown as typeof fetch;
    const out = await fetchLiveAdults("2026-11-10", "2026-11-25", f);
    expect(out?.map((a) => a.title)).toEqual(["Spettacolo di danza"]);
    expect(decodeURIComponent(urls[1].replace(/\+/g, " "))).toContain("data_inizio >= date'2026-10-20'");
  });
  it("returns null when every base fails", async () => {
    expect(await fetchLiveAdults("2026-11-10", "2026-11-25", (async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("liveAdults cache", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      clear: () => m.clear(),
    };
  });
  it("falls back to the last good list when offline", async () => {
    const ok = (async (u: string) => ({ ok: true, status: 200, json: async () => (String(u).includes("where") ? { results: [rec({ titolo: "Concerto rock" })] } : { results: [rec({ titolo: "x" })] }) })) as unknown as typeof fetch;
    const down = (async () => { throw new Error("off"); }) as unknown as typeof fetch;
    expect((await liveAdults("2026-11-10", "2026-11-25", ok, 0)).length).toBe(1);
    expect((await liveAdults("2026-11-10", "2026-11-25", down, 10 * 3600_000)).length).toBe(1);
  });
});
