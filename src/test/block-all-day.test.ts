import { describe, expect, it } from "vitest";
import { ALL_DAY, blockedSpan, type Appointment } from "../lib/data";
import { availableTimes, blockedTimeIssue } from "../lib/scheduling";

// 2030-01-07 is a Monday: default hours 10:30–1:30 and 7:30–10:30.
const MONDAY = "2030-01-07";
const before = new Date(`${MONDAY}T08:00:00`);
const booked = (time: string): Appointment => ({
  id: `a-${time}`, date: MONDAY, time, durationMin: 30, notes: "", clients: [{ clientId: "c1", status: "scheduled", charge: 0 }],
});

describe("blocking an entire day", () => {
  const day = { id: "b1", date: MONDAY, ...ALL_DAY, reason: "Vacation" };

  it("leaves no bookable times that day", () => {
    expect(availableTimes(MONDAY, 30, [], [], before).length).toBeGreaterThan(0);
    expect(availableTimes(MONDAY, 30, [], [day], before)).toEqual([]);
  });

  it("can't be added over a booked appointment, morning or evening", () => {
    expect(blockedTimeIssue(day, [], before)).toBeNull();
    expect(blockedTimeIssue(day, [booked("10:30")], before)).toMatch(/10:30 AM/);
    expect(blockedTimeIssue(day, [booked("22:00")], before)).toMatch(/10:00 PM/);
  });

  it("reads as All day", () => {
    expect(blockedSpan(day)).toBe("All day");
    expect(blockedSpan({ startTime: "10:30", endTime: "11:30" })).toBe("10:30 AM–11:30 AM");
  });
});
