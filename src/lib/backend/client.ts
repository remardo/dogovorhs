import { useEffect, useState } from "react";
import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export const backendAvailable = Boolean(convexClient);

export type BackendHealthStatus = "demo" | "checking" | "online" | "offline";

const AUTH_STORAGE_KEY = "dogovorhs.convexAuthToken";

export function initBackendAuthFromStorage() {
  if (!convexClient) return;
  if (typeof window === "undefined") return;
  const token = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!token) return;
  convexClient.setAuth(async () => token);
}

export function setBackendAuthToken(token: string | null) {
  if (!convexClient) return;
  if (typeof window === "undefined") return;

  if (!token) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    convexClient.clearAuth();
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  convexClient.setAuth(async () => token);
}

export function useBackendHealth(): { status: BackendHealthStatus; error?: string } {
  const [state, setState] = useState<{ status: BackendHealthStatus; error?: string }>(() => {
    if (!convexClient) return { status: "demo" };
    return { status: "checking" };
  });

  useEffect(() => {
    if (!convexClient) {
      setState({ status: "demo" });
      return;
    }

    let cancelled = false;
    setState({ status: "checking" });
    convexClient
      .query("health:ping", {})
      .then(() => {
        if (!cancelled) setState({ status: "online" });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setState({ status: "offline", error: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
