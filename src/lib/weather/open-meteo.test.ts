import { describe, expect, it } from "vitest";
import { getWeekendWeather, nextWeekend, parseOpenMeteo } from "./open-meteo";

// Wednesday 2 Dec 2026, 10:00 Rome
const now = new Date("2026-12-02T09:00:00Z");

describe("nextWeekend", () => {
  it("returns the coming Saturday and Sunday", () => {
    expect(nextWeekend(now)).toEqual({ saturday: "2026-12-05", sunday: "2026-12-06" });
  });
});

describe("parseOpenMeteo", () => {
  const json = {
    daily: {
      time: ["2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"],
      precipitation_probability_max: [0, 0, 10, 30, 70],
      temperature_2m_max: [8, 9, 10, 11, 7],
    },
  };
  it("takes the max weekend rain probability and flags rain", () => {
    const w = parseOpenMeteo(json, now);
    expect(w.rainProbability).toBe(70);
    expect(w.rainy).toBe(true);
    expect(w.tempMax).toBe(11);
    expect(w.source).toBe("open-meteo");
  });
  it("falls back on malformed payload", () => {
    expect(parseOpenMeteo({}, now).source).toBe("fallback");
  });
});

describe("getWeekendWeather", () => {
  it("falls back when fetch fails", async () => {
    const failing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const w = await getWeekendWeather({ fetchImpl: failing, now });
    expect(w.source).toBe("fallback");
    expect(w.saturday).toBe("2026-12-05");
  });
  it("falls back on timeout", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("abort"))))) as unknown as typeof fetch;
    const w = await getWeekendWeather({ fetchImpl: hanging, timeoutMs: 20, now });
    expect(w.source).toBe("fallback");
  });
});
