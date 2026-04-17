import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  unauthorizedHandler = fn;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
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
    if (res.status === 401 && !url.startsWith("/api/me") && !url.startsWith("/api/login")) {
      unauthorizedHandler?.();
    }
    const text = await res.text().catch(() => "");
    throw new ApiError(text || res.statusText, res.status);
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
