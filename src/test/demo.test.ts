import { describe, expect, it } from "vitest";
import { createBackup, parseBackup } from "../lib/backup";
import { clientBalance } from "../lib/scheduling";
import { buildDemoRecords, ensureDemoData } from "../lib/demo";
import { DEFAULT_WEEKLY } from "../lib/availability";
import { fromDateKey, timeToMinutes } from "../lib/data";

const today = new Date("2026-10-21T12:00:00");

describe("demo sample records", () => {
  const data = buildDemoRecords(today);

  it("has unique ids and only known clients", () => {
    const ids = [...data.clients, ...data.appointments, ...data.payments].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(data.clients.map((c) => c.id));
    expect(data.appointments.every((a) => a.clients.every((c) => known.has(c.clientId)))).toBe(true);
  });

  it("books only inside the default working hours and has past and upcoming visits", () => {
    for (const a of data.appointments) {
      const blocks = DEFAULT_WEEKLY[fromDateKey(a.date).getDay()] ?? [];
      const start = timeToMinutes(a.time);
      expect(blocks.some((b) => start >= timeToMinutes(b.start) && start + a.durationMin <= timeToMinutes(b.end))).toBe(true);
    }
    expect(data.appointments.some((a) => a.clients[0]?.status === "completed")).toBe(true);
    expect(data.appointments.some((a) => a.clients[0]?.status === "scheduled")).toBe(true);
    expect(data.appointments.filter((a) => a.clients[0]?.status === "no_show")).toHaveLength(1);
  });

  it("leaves some clients with a balance owed", () => {
    const owing = data.clients.filter((c) => clientBalance(c.id, data.appointments, data.payments, data.adjustments) > 0);
    expect(owing.length).toBeGreaterThan(0);
  });

  it("seeds an empty device with a backup-valid copy and the demo password, then leaves a fresh one alone", async () => {
    window.localStorage.clear();
    await ensureDemoData(window.localStorage, today);
    const parsed = parseBackup(JSON.stringify(createBackup(window.localStorage)));
    expect("error" in parsed).toBe(false);
    expect("summary" in parsed && parsed.summary.clients).toBe(8);
    const before = window.localStorage.getItem("lumiere-scheduler-v2");
    window.localStorage.setItem("lumiere-scheduler-v2", before!.replace("Rachel Cohen", "Edited"));
    await ensureDemoData(window.localStorage, today);
    expect(window.localStorage.getItem("lumiere-scheduler-v2")).toContain("Edited");
  });
});
