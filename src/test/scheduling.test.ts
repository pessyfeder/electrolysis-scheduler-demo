import { describe, expect, it } from "vitest";
import { emptyData, isoToTime, movePaidAt, pausedMsSoFar, paymentDateKey, toDateKey, workedMinutes, workedMs, type Appointment } from "../lib/data";
import { appointmentsOutsideHours, availableTimes, blockedTimeIssue, canMarkNoShow, noShowCharge, pastStartIssue, validateAppointment } from "../lib/scheduling";

// 2030-01-07 is a Monday: default hours 10:30–1:30 and 7:30–10:30.
const MONDAY = "2030-01-07";
const at = (time: string) => new Date(`${MONDAY}T${time}:00`);
const booked = (time: string, status: Appointment["clients"][number]["status"] = "scheduled"): Appointment => ({
  id: `a-${time}`, date: MONDAY, time, durationMin: 30, notes: "", clients: [{ clientId: "c1", status, charge: 0 }],
});

describe("first run", () => {
  it("starts with no clients, appointments or payments", () => {
    expect(emptyData()).toEqual({ clients: [], appointments: [], payments: [], adjustments: [], blockedTimes: [] });
  });
});

describe("times that have passed", () => {
  it("are not offered for booking", () => {
    const times = availableTimes(MONDAY, 30, [], [], at("11:12"));
    expect(times).not.toContain("11:00");
    expect(times[0]).toBe("11:15");
    expect(availableTimes(MONDAY, 30, [], [], at("09:00"))[0]).toBe("10:30");
  });

  it("are rejected when saving", () => {
    expect(pastStartIssue(MONDAY, "11:00", at("11:12"))).toMatch(/already passed/);
    expect(pastStartIssue(MONDAY, "11:30", at("11:12"))).toBeNull();
  });
});

describe("no-shows", () => {
  it("can only be marked once the start time has passed, and only for waiting clients", () => {
    const item = booked("10:30");
    const client = item.clients[0]!;
    expect(canMarkNoShow(item, client, at("10:29"))).toBe(false);
    expect(canMarkNoShow(item, client, at("10:30"))).toBe(true);
    expect(canMarkNoShow(item, { ...client, startedAt: at("10:31").toISOString() }, at("10:40"))).toBe(false);
    expect(canMarkNoShow(item, { ...client, status: "cancelled" }, at("10:40"))).toBe(false);
  });

  it("are billed for the full booked length", () => {
    expect(noShowCharge({ durationMin: 30 })).toBe(75);
    expect(noShowCharge({ durationMin: 90 })).toBe(225);
  });
});

describe("blocked time", () => {
  const block = { date: MONDAY, startTime: "10:30", endTime: "11:30", reason: "Doctor" };

  it("needs a reason and a real range", () => {
    expect(blockedTimeIssue({ ...block, reason: "  " }, [])).toMatch(/reason/);
    expect(blockedTimeIssue({ ...block, endTime: "10:00" }, [])).toMatch(/after the start/);
    expect(blockedTimeIssue(block, [])).toBeNull();
  });

  it("can't cover a booked appointment, but may cover cancelled ones", () => {
    expect(blockedTimeIssue(block, [booked("11:00")])).toMatch(/11:00 AM/);
    expect(blockedTimeIssue(block, [booked("11:00", "cancelled")])).toBeNull();
    expect(blockedTimeIssue(block, [booked("11:30")])).toBeNull();
  });

  it("can't be added once it has already ended", () => {
    expect(blockedTimeIssue(block, [], at("11:30"))).toMatch(/already passed/);
    expect(blockedTimeIssue({ ...block, date: "2030-01-06" }, [], at("09:00"))).toMatch(/already passed/);
    // A block that started earlier today but hasn't ended yet is still fine.
    expect(blockedTimeIssue(block, [], at("11:00"))).toBeNull();
  });

  it("is an edge for the 15-minute gap rule", () => {
    const lunch = { id: "b1", ...block, startTime: "12:00", endTime: "13:00" };
    expect(validateAppointment({ date: MONDAY, time: "11:20", durationMin: 30 }, [], [lunch])).toMatch(/gap under 15/);
    expect(validateAppointment({ date: MONDAY, time: "11:30", durationMin: 30 }, [], [lunch])).toBeNull();
    expect(validateAppointment({ date: MONDAY, time: "11:00", durationMin: 45 }, [], [lunch])).toBeNull();
  });
});

describe("payment dates", () => {
  it("use the local day the payment was recorded", () => {
    const evening = new Date(2030, 0, 7, 22, 15);
    expect(paymentDateKey(evening.toISOString())).toBe(toDateKey(evening));
    expect(paymentDateKey("2030-01-07")).toBe("2030-01-07");
  });
});

describe("demo record cleanup", () => {
  it("removes the old demo clients and their records but keeps real ones", async () => {
    const { removeDemoRecords } = await import("../lib/store");
    const real = { id: "client-1", name: "Real Client", phone: "(555) 000-1111", createdAt: "", archived: false };
    const maya = { id: "c1", name: "Maya Thompson", phone: "(555) 214-8830", createdAt: "", archived: false };
    const state = {
      clients: [maya, real],
      appointments: [
        { ...booked("10:30"), id: "a1" },
        { ...booked("11:30"), id: "mixed", clients: [{ clientId: "c1", status: "scheduled" as const, charge: 0 }, { clientId: "client-1", status: "scheduled" as const, charge: 0 }] },
      ],
      payments: [
        { id: "p1", clientId: "c1", amount: 50, method: "card" as const, paidAt: "2030-01-01", notes: "" },
        { id: "p2", clientId: "client-1", amount: 20, method: "cash" as const, paidAt: "2030-01-01", notes: "" },
      ],
      adjustments: [],
      blockedTimes: [],
    };
    const cleaned = removeDemoRecords(state);
    expect(cleaned.clients).toEqual([real]);
    expect(cleaned.appointments.map((a) => [a.id, a.clients.map((c) => c.clientId)])).toEqual([["mixed", ["client-1"]]]);
    expect(cleaned.payments.map((p) => p.id)).toEqual(["p2"]);
    // A record that no longer matches the demo name/phone is treated as real and kept.
    const renamed = { ...state, clients: [{ ...maya, name: "Someone Else" }, real] };
    expect(removeDemoRecords(renamed)).toBe(renamed);
  });
});

describe("editing a payment's date", () => {
  it("moves it to the new local day and keeps the time it was recorded", () => {
    const evening = new Date(2030, 0, 7, 21, 45).toISOString();
    const moved = movePaidAt(evening, "2030-01-05");
    expect(paymentDateKey(moved)).toBe("2030-01-05");
    expect(isoToTime(moved)).toBe("21:45");
    expect(movePaidAt(evening, "2030-01-07")).toBe(evening);
    expect(paymentDateKey(movePaidAt("2030-01-07", "2030-01-04"))).toBe("2030-01-04");
  });
});

describe("changing hours", () => {
  it("lists upcoming bookings that would fall outside the new hours", () => {
    const morning = booked("10:30");
    const evening = booked("19:30");
    const cancelled = booked("11:30", "cancelled");
    const done = booked("12:30", "completed");
    const eveningsOnly = () => [{ start: "19:30", end: "22:30" }];
    const ids = (list: Appointment[]) => list.map((item) => item.id);
    expect(ids(appointmentsOutsideHours([morning, evening, cancelled, done], eveningsOnly, at("09:00")))).toEqual(["a-10:30"]);
    expect(ids(appointmentsOutsideHours([morning, evening], () => [], at("09:00")))).toEqual(["a-10:30", "a-19:30"]);
    // Bookings that already started (or whose time has passed) aren't flagged.
    expect(ids(appointmentsOutsideHours([morning], eveningsOnly, at("11:00")))).toEqual([]);
  });
});

describe("pausing a session", () => {
  const t = (time: string) => at(time).getTime();
  const iso = (time: string) => at(time).toISOString();
  const base = { clientId: "c1", status: "scheduled" as const, charge: 0, startedAt: iso("10:00") };

  it("doesn't count paused time as worked", () => {
    // 10:00 start, paused 10:20–10:30 (finished pause), ended 10:45 → 35 minutes worked.
    const done = { ...base, status: "completed" as const, endedAt: iso("10:45"), pausedMs: 10 * 60000 };
    expect(workedMinutes(done)).toBe(35);
  });

  it("freezes the clock while paused", () => {
    const paused = { ...base, pausedAt: iso("10:20") };
    expect(Math.round(workedMs(paused, t("10:20")) / 60000)).toBe(20);
    expect(Math.round(workedMs(paused, t("10:50")) / 60000)).toBe(20);
    expect(Math.round(pausedMsSoFar(paused, t("10:50")) / 60000)).toBe(30);
  });

  it("adds up several pauses, and a pause still open when the session ends", () => {
    const endedWhilePaused = { ...base, endedAt: iso("11:00"), pausedMs: 5 * 60000, pausedAt: iso("10:50") };
    expect(workedMinutes(endedWhilePaused)).toBe(45);
  });
});

describe("back-to-back start times off the 15-minute grid", () => {
  const morning = (time: string, durationMin: number): Appointment => ({ ...booked(time), id: `m-${time}`, durationMin });

  it("offers the exact end of a 25-minute appointment, and skips the 5-minute sliver after it", () => {
    const times = availableTimes(MONDAY, 30, [morning("10:30", 25)], [], at("08:00"));
    expect(times).toContain("10:55");
    expect(times).not.toContain("11:00");
    expect(times).toContain("11:15");
  });

  it("offers a start that ends exactly when the next appointment begins", () => {
    expect(availableTimes(MONDAY, 25, [morning("12:00", 30)], [], at("08:00"))).toContain("11:35");
  });

  it("offers a start that ends exactly at closing", () => {
    const times = availableTimes(MONDAY, 25, [], [], at("08:00"));
    expect(times).toContain("13:05");
    expect(times).not.toContain("13:00");
  });

  it("offers the exact end of blocked time", () => {
    const block = { id: "b1", date: MONDAY, startTime: "10:30", endTime: "10:50", reason: "Errand" };
    const times = availableTimes(MONDAY, 30, [], [block], at("08:00"));
    expect(times[0]).toBe("10:50");
  });

  it("every offered time passes the booking checks", () => {
    const appointments = [morning("10:30", 25), morning("11:40", 50)];
    for (const time of availableTimes(MONDAY, 20, appointments, [], at("08:00"))) {
      expect(validateAppointment({ date: MONDAY, time, durationMin: 20 }, appointments, [])).toBeNull();
    }
  });
});

describe("empty time fields", () => {
  it("are rejected for working hours and blocked time", async () => {
    const { blocksIssue } = await import("../lib/availability");
    expect(blocksIssue([{ start: "", end: "13:00" }])).toMatch(/start and an end/);
    expect(blocksIssue([{ start: "10:00", end: "" }])).toMatch(/start and an end/);
    expect(blocksIssue([{ start: "10:00", end: "13:00" }])).toBeNull();
    expect(blockedTimeIssue({ date: "2030-01-07", startTime: "", endTime: "11:00", reason: "x" }, [])).toMatch(/start and an end/);
  });
});
