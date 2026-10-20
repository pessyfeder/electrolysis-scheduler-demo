import { describe, expect, it } from "vitest";
import { searchAppointments, type Appointment, type Client } from "../lib/data";

const client = (id: string, name: string, phone: string): Client => ({ id, name, phone, createdAt: "", archived: false });
const CLIENTS = [client("c1", "Maya  Thompson", "(555) 214-8830"), client("c2", "Jordan Lee", "(555) 872-1190")];
const appt = (id: string, date: string, time: string, ...clientIds: string[]): Appointment => ({
  id, date, time, durationMin: 30, notes: "", clients: clientIds.map((clientId) => ({ clientId, status: "scheduled", charge: 0 })),
});
const APPTS = [appt("a1", "2030-01-07", "10:30", "c1"), appt("a2", "2030-01-09", "19:30", "c2"), appt("a3", "2030-01-07", "20:00", "c1", "c2")];
const ids = (list: Appointment[]) => list.map((item) => item.id);

describe("Search Appointment", () => {
  it("finds nothing with no filters", () => {
    expect(searchAppointments(" ", "", APPTS, CLIENTS)).toEqual([]);
  });

  it("matches a client's name or phone digits, newest first, including shared appointments", () => {
    expect(ids(searchAppointments("maya thompson", "", APPTS, CLIENTS))).toEqual(["a3", "a1"]);
    expect(ids(searchAppointments("872-11", "", APPTS, CLIENTS))).toEqual(["a2", "a3"]);
  });

  it("narrows to a date, alone or with a name", () => {
    expect(ids(searchAppointments("", "2030-01-07", APPTS, CLIENTS))).toEqual(["a3", "a1"]);
    expect(ids(searchAppointments("jordan", "2030-01-07", APPTS, CLIENTS))).toEqual(["a3"]);
  });
});
