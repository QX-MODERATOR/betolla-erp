"use client";

import { useEffect } from "react";
import { isSignedIn, secureFetch } from "@/lib/client-api";

// The Android app hands its push token to the page (window.__betollaPushToken + a
// "betolla-push-token" event) after every page load. A signed-in page registers it for the
// current account, so notifications reach the phone even when the app is closed.
declare global {
  interface Window {
    __betollaPushToken?: string;
  }
}

let registered = "";

export async function registerPushDevice(force = false): Promise<void> {
  const token = typeof window !== "undefined" ? window.__betollaPushToken : undefined;
  if (!token || !isSignedIn() || (!force && registered === token)) return;
  try {
    const res = await secureFetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: "android" }),
    });
    if (res.ok) registered = token;
  } catch {
    // Next page load retries.
  }
}

// Sign-out: this phone stops receiving the account's notifications.
export async function unregisterPushDevice(): Promise<void> {
  const token = typeof window !== "undefined" ? window.__betollaPushToken : undefined;
  if (!token) return;
  registered = "";
  try {
    await secureFetch("/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // The server also drops devices of accounts whose password changed, and stale tokens.
  }
}

export function PushRegistration() {
  useEffect(() => {
    const onToken = () => void registerPushDevice();
    onToken();
    window.addEventListener("betolla-push-token", onToken);
    window.addEventListener("betolla_user_updated", onToken);
    return () => {
      window.removeEventListener("betolla-push-token", onToken);
      window.removeEventListener("betolla_user_updated", onToken);
    };
  }, []);
  return null;
}
