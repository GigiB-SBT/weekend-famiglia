/**
 * Founder reminders as local notifications (Android app only).
 * Wednesday 18:30 → events to approve; Friday 9:00 → review the Friday email.
 * On the web these calls do nothing.
 */

export const REMINDERS = [
  { id: 101, weekday: 4, hour: 18, minute: 30, title: "Eventi da approvare", body: "Controlla gli eventi del weekend e aggiungi quelli delle parrocchie." },
  { id: 102, weekday: 6, hour: 9, minute: 0, title: "La mail del venerdì è pronta", body: "Rivedi le 3 idee per ogni famiglia e approva l'invio." },
] as const;

export type ReminderState = "unsupported" | "off" | "on" | "denied";

async function plugin() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

export async function reminderState(): Promise<ReminderState> {
  const ln = await plugin();
  if (!ln) return "unsupported";
  try {
    const perm = await ln.checkPermissions();
    if (perm.display === "denied") return "denied";
    const pending = await ln.getPending();
    const ids = new Set(pending.notifications.map((n) => n.id));
    return REMINDERS.every((r) => ids.has(r.id)) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Must be called from a tap (Android asks for permission). */
export async function enableReminders(): Promise<ReminderState> {
  const ln = await plugin();
  if (!ln) return "unsupported";
  try {
    const perm = await ln.requestPermissions();
    if (perm.display !== "granted") return "denied";
    await ln.cancel({ notifications: REMINDERS.map((r) => ({ id: r.id })) });
    await ln.schedule({
      notifications: REMINDERS.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        schedule: { on: { weekday: r.weekday, hour: r.hour, minute: r.minute }, allowWhileIdle: true },
        isExactNotification: false,
      })),
    });
    return "on";
  } catch {
    return "off";
  }
}

export async function disableReminders(): Promise<ReminderState> {
  const ln = await plugin();
  if (!ln) return "unsupported";
  try {
    await ln.cancel({ notifications: REMINDERS.map((r) => ({ id: r.id })) });
    return "off";
  } catch {
    return "on";
  }
}
