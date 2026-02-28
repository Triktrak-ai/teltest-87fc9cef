import { useEffect, useRef, useCallback } from "react";
import { HubConnectionBuilder, HubConnection, LogLevel } from "@microsoft/signalr";
import { getAccessToken } from "@/lib/api-client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const HUB_URL = `${API_BASE}/hubs/dashboard`;

let sharedConnection: HubConnection | null = null;
let refCount = 0;
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function getOrCreateConnection(): HubConnection {
  if (!sharedConnection) {
    sharedConnection = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => getAccessToken() ?? "",
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    sharedConnection.start().catch((err) => {
      console.warn("SignalR connection failed:", err);
    });
  }
  return sharedConnection;
}

/**
 * Subscribe to a SignalR hub method. Shared connection across all hooks.
 */
export function useSignalR(method: string, callback: (...args: unknown[]) => void) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const conn = getOrCreateConnection();
    refCount++;

    const handler = (...args: unknown[]) => cbRef.current(...args);

    if (!listeners.has(method)) {
      listeners.set(method, new Set());
    }
    listeners.get(method)!.add(handler);

    // Register on hub if first listener for this method
    if (listeners.get(method)!.size === 1) {
      conn.on(method, (...args: unknown[]) => {
        listeners.get(method)?.forEach((fn) => fn(...args));
      });
    }

    return () => {
      listeners.get(method)?.delete(handler);
      refCount--;

      if (refCount === 0 && sharedConnection) {
        sharedConnection.stop();
        sharedConnection = null;
      }
    };
  }, [method]);
}
