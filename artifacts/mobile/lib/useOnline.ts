import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { getServerBaseUrl } from "@/constants/api";

const POLL_INTERVAL_MS = 15_000;

async function checkConnectivity(): Promise<boolean> {
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(`${getServerBaseUrl()}/api/healthz`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Returns true when the app can reach the API server.
 * Polls every POLL_INTERVAL_MS when foregrounded; pauses when backgrounded.
 */
export function useOnline(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = () => {
    checkConnectivity().then(setIsOnline);
  };

  useEffect(() => {
    if (Platform.OS === "web") {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        poll();
        if (!timerRef.current) {
          timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
        }
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, []);

  return isOnline;
}
