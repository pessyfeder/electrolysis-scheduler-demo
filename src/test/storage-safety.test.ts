import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DEFAULT_WEEKLY, getAvailability, hoursWereDamaged, resetAvailabilityForTests, setAvailability } from "../lib/availability";
import { BACKUP_KEYS, createBackup } from "../lib/backup";
import { saveToDevice } from "../lib/save-warning";

afterEach(() => {
  window.localStorage.clear();
  resetAvailabilityForTests();
  vi.restoreAllMocks();
});

describe("saved working hours", () => {
  it("fall back to the standard hours when they can't be read, and say so", () => {
    window.localStorage.setItem(BACKUP_KEYS.hours, JSON.stringify({ weekly: { 1: [{ start: "10:30" }] } }));
    expect(getAvailability().weekly).toEqual(DEFAULT_WEEKLY);
    expect(hoursWereDamaged()).toBe(true);
    // The damaged copy is left alone until the practitioner saves new hours.
    expect(window.localStorage.getItem(BACKUP_KEYS.hours)).toContain("10:30");
    setAvailability({ weekly: DEFAULT_WEEKLY, overrides: {} });
    expect(hoursWereDamaged()).toBe(false);
  });

  it("load normally when they are fine", () => {
    const weekly = { ...DEFAULT_WEEKLY, 5: [{ start: "09:00", end: "12:00" }] };
    window.localStorage.setItem(BACKUP_KEYS.hours, JSON.stringify({ weekly, overrides: {} }));
    expect(getAvailability().weekly[5]).toEqual([{ start: "09:00", end: "12:00" }]);
    expect(hoursWereDamaged()).toBe(false);
  });

  it("don't stop a backup when damaged", () => {
    window.localStorage.setItem(BACKUP_KEYS.hours, JSON.stringify({ weekly: "broken" }));
    expect(createBackup(window.localStorage).data.hours).toBeNull();
  });
});

describe("saving when storage is full", () => {
  it("shows a warning instead of stopping the app, and clears it after a good save", () => {
    const error = vi.spyOn(toast, "error");
    const dismiss = vi.spyOn(toast, "dismiss");
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(saveToDevice("lumiere-test", "x")).toBe(false);
    expect(error).toHaveBeenCalledWith("Your latest change couldn't be saved", expect.objectContaining({ duration: Infinity }));
    expect(saveToDevice("lumiere-test", "x")).toBe(true);
    expect(dismiss).toHaveBeenCalled();
  });
});
