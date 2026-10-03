import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** A thrown value as display text: the message of an Error, else the value itself. */
export function getErrorMessage(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
}
