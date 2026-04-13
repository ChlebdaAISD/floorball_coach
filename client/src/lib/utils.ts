import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

export const EVENT_COLORS: Record<string, string> = {
  gym: "bg-blue-500",
  floorball_training: "bg-green-500",
  floorball_match: "bg-green-700",
  running: "bg-orange-500",
  rest: "bg-slate-500",
  other: "bg-purple-500",
};

export const EVENT_LABELS: Record<string, string> = {
  gym: "Siłownia",
  floorball_training: "Unihokej - trening",
  floorball_match: "Unihokej - mecz",
  running: "Bieg",
  rest: "Odpoczynek",
  other: "Inne",
};
