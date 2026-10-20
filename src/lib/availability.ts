import { useSyncExternalStore } from "react";
import { z } from "zod";
import type { BusinessBlock } from "./data";
import { saveToDevice } from "./save-warning";

/** Practitioner-editable working hours, stored on this device only. */
export type Availability = {
  weekly: Record<number, BusinessBlock[]>;
  /** Date-specific hours ("YYYY-MM-DD"); an empty list means closed that day. */
  overrides: Record<string, BusinessBlock[]>;
};

const KEY = "lumiere-hours-v1";

export const DEFAULT_WEEKLY: Record<number, BusinessBlock[]> = {
  0: [{ start: "11:30", end: "13:30" }, { start: "19:30", end: "22:30" }],
  1: [{ start: "10:30", end: "13:30" }, { start: "19:30", end: "22:30" }],
  2: [{ start: "19:30", end: "22:30" }],
  3: [{ start: "10:30", end: "13:30" }, { start: "19:30", end: "22:30" }],
  4: [{ start: "10:30", end: "13:30" }, { start: "19:30", end: "22:30" }],
  5: [],
  6: [],
};

const TIME_PATTERN = /^\d{2}:\d{2}$/;
const time = z.string().regex(TIME_PATTERN);
const blocksSchema = z.array(z.object({ start: time, end: time }));
const savedSchema = z.object({ weekly: z.record(blocksSchema), overrides: z.record(blocksSchema) });

let current: Availability = { weekly: DEFAULT_WEEKLY, overrides: {} };
let loaded = false;
let damaged = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    // Saved hours that can't be read fall back to the standard hours (the saved copy is left untouched).
    const parsed = savedSchema.safeParse(JSON.parse(raw));
    if (parsed.success) current = parsed.data;
    else damaged = true;
  } catch {
    damaged = true;
  }
}

export function getAvailability(): Availability {
  load();
  return current;
}

/** True when the saved hours couldn't be read and the standard hours are in use instead. */
export function hoursWereDamaged() {
  load();
  return damaged;
}

export function setAvailability(next: Availability) {
  current = next;
  if (saveToDevice(KEY, JSON.stringify(next))) damaged = false;
  listeners.forEach((fn) => fn());
}

/** Test helper: forget the loaded hours so the next read loads them from storage again. */
export function resetAvailabilityForTests() {
  current = { weekly: DEFAULT_WEEKLY, overrides: {} };
  loaded = false;
  damaged = false;
}

/** Returns an error when blocks overlap or end before they start. */
export function blocksIssue(blocks: BusinessBlock[]): string | null {
  if (blocks.some((b) => !TIME_PATTERN.test(b.start) || !TIME_PATTERN.test(b.end))) return "Enter both a start and an end time for every range.";
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.end <= sorted[i]!.start) return "Each end time must be after its start time.";
    if (i > 0 && sorted[i]!.start < sorted[i - 1]!.end) return "Time ranges can't overlap.";
  }
  return null;
}

export function sortBlocks(blocks: BusinessBlock[]) {
  return [...blocks].sort((a, b) => a.start.localeCompare(b.start));
}

export function useAvailability(): Availability {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getAvailability,
    () => ({ weekly: DEFAULT_WEEKLY, overrides: {} }),
  );
}
