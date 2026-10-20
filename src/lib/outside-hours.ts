import { useMemo } from "react";
import { useAvailability } from "./availability";
import { fromDateKey } from "./data";
import { appointmentsOutsideHours } from "./scheduling";
import { useStore } from "./store";

/**
 * Upcoming bookings that no longer fit inside the working hours (after the hours were changed).
 * They are never moved automatically; the screens flag them so the practitioner can reschedule.
 * Re-computes whenever the hours or the appointments change.
 */
export function useOutsideHours() {
  const { appointments } = useStore();
  const { weekly, overrides } = useAvailability();
  return useMemo(() => {
    const list = appointmentsOutsideHours(appointments, (key) => overrides[key] ?? weekly[fromDateKey(key).getDay()] ?? []);
    return { list, ids: new Set(list.map((item) => item.id)) };
  }, [appointments, weekly, overrides]);
}

/** Shared look for the "needs rescheduling" flag. */
export const OUTSIDE_HOURS_CARD = "border-amber-500 ring-2 ring-amber-400/60 bg-amber-50";
export const OUTSIDE_HOURS_BADGE = "inline-flex items-center gap-1 rounded-full border border-amber-500 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900";
