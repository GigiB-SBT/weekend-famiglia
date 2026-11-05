import { describe, expect, it } from "vitest";
import { checkUpdate, latestApk } from "./update";

const rel = (n: number, apk = true) => ({
  tag_name: `beta-${n}`,
  html_url: `https://github.com/x/releases/beta-${n}`,
  assets: apk ? [{ name: `weekend-famiglia-${n}.apk`, browser_download_url: `https://dl/${n}.apk` }] : [],
});
const ok = (body: unknown) => (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;

describe("update check", () => {
  it("picks the highest beta with an APK", () => {
    expect(latestApk([rel(12), rel(15), rel(16, false), { tag_name: "v1" }])?.build).toBe(15);
  });
  it("offers only newer builds", async () => {
    expect((await checkUpdate(14, ok([rel(15)])))?.apkUrl).toBe("https://dl/15.apk");
    expect(await checkUpdate(15, ok([rel(15)]))).toBeNull();
  });
  it("local builds and network errors never prompt", async () => {
    expect(await checkUpdate(0, ok([rel(99)]))).toBeNull();
    expect(await checkUpdate(3, (async () => { throw new Error("x"); }) as unknown as typeof fetch)).toBeNull();
  });
});
