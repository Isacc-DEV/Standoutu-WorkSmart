import { useEffect, useState } from "react";
import type { DateRangeKey } from "./types";

export const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
};

export const formatRelativeTime = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 min ago" : `${diffMinutes} mins ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
};

export const safeDomain = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown source";
  }
};

export const buildSinceIso = (range: DateRangeKey): string | undefined => {
  if (range === "all") return undefined;
  const now = new Date();
  if (range === "24h") {
    now.setHours(now.getHours() - 24);
  } else if (range === "7d") {
    now.setDate(now.getDate() - 7);
  } else if (range === "30d") {
    now.setDate(now.getDate() - 30);
  }
  return now.toISOString();
};

export const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
};
