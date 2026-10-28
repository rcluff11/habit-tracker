import { pb } from "./pb";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const COLLECTION = "push_subscriptions";

function base64UrlToBytes(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function sameKey(buffer, bytes) {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/** What this browser can do: { supported, reason, permission } */
export function pushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return {
      supported: false,
      reason:
        isIOS() && !isStandalone()
          ? "On iPhone and iPad, tap Share → Add to Home Screen, then open Notch from your Home Screen to turn on reminders."
          : "This browser doesn't support push notifications.",
    };
  }
  if (!VAPID_PUBLIC) return { supported: false, reason: "Reminders aren't set up on this server yet (missing VAPID key)." };
  return { supported: true, permission: Notification.permission };
}

async function registration() {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("The app's service worker didn't start. Try reloading the page.")), 10000)
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** True when this device has an active subscription. */
export async function isPushEnabled() {
  if (!pushSupport().supported || Notification.permission !== "granted") return false;
  const reg = await registration();
  return !!(await reg.pushManager.getSubscription());
}

async function subscribe(reg, key) {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

async function saveSubscription(sub) {
  const data = {
    user: pb.authStore.record.id,
    subscription: sub.toJSON(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const existing = await pb
    .collection(COLLECTION)
    .getFirstListItem(pb.filter("endpoint = {:endpoint}", { endpoint: sub.endpoint }))
    .catch(() => null);
  if (existing) return pb.collection(COLLECTION).update(existing.id, data);
  return pb.collection(COLLECTION).create(data);
}

/** Ask permission (must be called from a tap) and register this device for reminders. */
export async function enablePush() {
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for Notch. Allow them in your browser or phone settings, then try again."
        : "Notifications weren't allowed."
    );
  }

  const key = base64UrlToBytes(VAPID_PUBLIC);
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // Re-subscribe if the server's key changed since this device subscribed.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await subscribe(reg, key);

  try {
    await saveSubscription(sub);
  } catch {
    // This device is still registered to another account: get a fresh endpoint.
    await sub.unsubscribe();
    sub = await subscribe(reg, key);
    await saveSubscription(sub);
  }
}

/**
 * Keep this device's saved timezone current (e.g. after travelling), so reminders
 * fire at the right local time. Safe to call on every app open; does nothing if
 * reminders are off.
 */
export async function syncPushTimezone() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !pb.authStore.isValid) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const record = await pb
    .collection(COLLECTION)
    .getFirstListItem(pb.filter("endpoint = {:endpoint}", { endpoint: sub.endpoint }))
    .catch(() => null);
  if (record && record.timezone !== timezone) await pb.collection(COLLECTION).update(record.id, { timezone });
}

/** Stop reminders on this device (also used on log out). */
export async function disablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  if (pb.authStore.isValid) {
    const records = await pb
      .collection(COLLECTION)
      .getFullList({ filter: pb.filter("endpoint = {:endpoint}", { endpoint: sub.endpoint }) })
      .catch(() => []);
    await Promise.all(records.map((r) => pb.collection(COLLECTION).delete(r.id).catch(() => {})));
  }
  await sub.unsubscribe();
}
