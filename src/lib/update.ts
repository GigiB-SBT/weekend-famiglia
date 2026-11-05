/**
 * In-app update check: compares this APK's build number with the latest
 * "beta-N" release on GitHub. Android does not allow silent installs outside
 * the Play Store, so the app offers a one-tap download; installing over the old
 * app (same signing key) keeps all saved data.
 */
import { EVENTS_REPO } from "@/lib/events/remote";

/** GitHub run number of this build (0 = local/dev build: never prompts). */
export const CURRENT_BUILD = Number(process.env.NEXT_PUBLIC_BUILD ?? "0") || 0;

export interface UpdateInfo {
  build: number;
  apkUrl: string;
  pageUrl: string;
}

interface Release {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
}

export function latestApk(releases: Release[]): UpdateInfo | null {
  let best: UpdateInfo | null = null;
  for (const r of releases) {
    const m = /^beta-(\d+)$/.exec(r.tag_name ?? "");
    const apk = r.assets?.find((a) => a.name?.endsWith(".apk") && a.browser_download_url);
    if (!m || r.draft || !apk) continue;
    const build = Number(m[1]);
    if (!best || build > best.build) best = { build, apkUrl: apk.browser_download_url!, pageUrl: r.html_url ?? "" };
  }
  return best;
}

export async function checkUpdate(current = CURRENT_BUILD, fetchImpl: typeof fetch = fetch): Promise<UpdateInfo | null> {
  if (!current) return null;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${EVENTS_REPO}/releases?per_page=10`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const best = latestApk((await res.json()) as Release[]);
    return best && best.build > current ? best : null;
  } catch {
    return null;
  }
}

export async function isNativeApp(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
