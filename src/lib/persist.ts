/**
 * Durable storage for the founder's data (events, approvals, imports).
 *
 * In the Android app data is written both to the WebView's localStorage and to
 * Capacitor Preferences (Android SharedPreferences). Preferences survive app
 * updates installed over the previous version, and are the source of truth at
 * startup. On the web only localStorage is used.
 * Uninstalling the app still deletes everything: use "Backup eventi" first.
 */

export const PERSISTED_KEYS = ["wf.events.v1", "wf.events.rejected.v1", "wf.events.imported.v1", "wf.adults.saved.v1", "wf.places.fav.v1", "wf.places.history.v1", "wf.home.start.v1"] as const;

type Prefs = typeof import("@capacitor/preferences").Preferences;
let prefsPromise: Promise<Prefs | null> | null = null;

function prefs(): Promise<Prefs | null> {
  if (!prefsPromise) {
    prefsPromise = (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return null;
        return (await import("@capacitor/preferences")).Preferences;
      } catch {
        return null;
      }
    })();
  }
  return prefsPromise;
}

export function localGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function localSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Writes locally now and mirrors to Preferences in the background. */
export function durableSet(key: string, value: string) {
  localSet(key, value);
  void prefs().then((p) => p?.set({ key, value }).catch(() => undefined));
}

/**
 * Call once at startup, before reading: restores data kept in Preferences
 * (e.g. after an update) and migrates data that so far lived only in localStorage.
 */
export async function hydrate(): Promise<void> {
  const p = await prefs();
  if (!p) return;
  for (const key of PERSISTED_KEYS) {
    try {
      const { value } = await p.get({ key });
      const local = localGet(key);
      if (value != null && value !== local) localSet(key, value);
      else if (value == null && local != null) await p.set({ key, value: local });
    } catch {
      /* keep whatever localStorage has */
    }
  }
}
