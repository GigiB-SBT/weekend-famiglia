import { describe, expect, it } from "vitest";
import { fetchRemoteEvents, isNewer } from "./remote";

const ev = { slug: "a", title: "A", event: { date: "2026-11-08" } };
const resp = (status: number, body?: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
const fake = (map: Record<string, Response>) => (async (url: string) => {
  const k = Object.keys(map).find((n) => String(url).includes(n));
  return k ? map[k] : resp(404);
}) as unknown as typeof fetch;

describe("fetchRemoteEvents", () => {
  it("reads candidates, adults and meta", async () => {
    const r = await fetchRemoteEvents(fake({
      "event-candidates.json": resp(200, [ev]),
      "event-adults.json": resp(200, [{ ...ev, slug: "b" }]),
      "event-candidates-meta.json": resp(200, { generatedAt: "2026-11-04T07:00:00Z" }),
    }));
    expect(r).toEqual({ ok: true, data: { generatedAt: "2026-11-04T07:00:00Z", events: [ev], adults: [{ ...ev, slug: "b" }] } });
  });
  it("private repo → 404", async () => {
    expect(await fetchRemoteEvents(fake({}))).toEqual({ ok: false, reason: "private" });
  });
  it("empty lists are not accepted (a zip upload may have reset them)", async () => {
    expect(await fetchRemoteEvents(fake({ "event-candidates.json": resp(200, []) }))).toEqual({ ok: false, reason: "empty" });
  });
  it("network error → offline", async () => {
    expect(await fetchRemoteEvents((async () => { throw new Error("x"); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "offline" });
  });
  it("isNewer", () => {
    expect(isNewer({ generatedAt: "2026-11-04", events: [] }, { generatedAt: "2026-10-28", events: [] })).toBe(true);
    expect(isNewer({ generatedAt: "2026-10-01", events: [] }, { generatedAt: "2026-10-28", events: [] })).toBe(false);
  });
});
