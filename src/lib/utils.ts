import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Detects if the first non-whitespace character is in the Arabic Unicode block. */
export function isArabicText(s: string | null | undefined): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  return /[\u0600-\u06FF]/.test(trimmed.charAt(0));
}
