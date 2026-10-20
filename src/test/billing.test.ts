import { describe, expect, it } from "vitest";
import { buildReport, paymentsCsv } from "../lib/billing";
import type { Adjustment, Appointment, Payment } from "../lib/data";
import { clientBalance } from "../lib/scheduling";

const visit = (id: string, date: string, charge: number): Appointment => ({
  id, date, time: "10:30", durationMin: 30, notes: "", clients: [{ clientId: "c1", status: "completed", charge }],
});
const payment = (amount: number): Payment => ({ id: `p${amount}`, clientId: "c1", amount, method: "cash", paidAt: "2030-01-10T15:00:00.000Z", notes: "" });
const adjustment = (amount: number, createdAt = "2030-01-12T15:00:00.000Z"): Adjustment => ({ id: `adj${amount}`, clientId: "c1", amount, reason: "test", createdAt });

describe("balance adjustments", () => {
  const appointments = [visit("a1", "2030-01-07", 75), visit("a2", "2030-01-09", 50)];

  it("move the balance up or down", () => {
    expect(clientBalance("c1", appointments, [payment(100)])).toBe(25);
    expect(clientBalance("c1", appointments, [payment(100)], [adjustment(-25)])).toBe(0);
    expect(clientBalance("c1", appointments, [payment(100)], [adjustment(10)])).toBe(35);
    expect(clientBalance("c2", appointments, [payment(100)], [adjustment(10)])).toBe(0);
  });

  it("show in the report: a credit pays off charges, an increase is listed as unpaid", () => {
    const credited = buildReport("2030-01-01", "2030-01-31", appointments, [payment(100)], [], [adjustment(-25)]);
    expect(credited.owed).toBe(0);
    const increased = buildReport("2030-01-01", "2030-01-31", appointments, [payment(125)], [], [adjustment(10)]);
    expect(increased.rows.filter((row) => row.unpaid).map((row) => [row.label, row.amount])).toEqual([["Adjustment (unpaid)", -10]]);
    expect(increased.rows.find((row) => row.unpaid)?.adjustmentId).toBe("adj10");
  });
});

describe("payment report", () => {
  it("shows what was owed at the end of the range: later payments and credits don't reduce it", () => {
    const appointments = [visit("a1", "2030-01-07", 75)];
    const later: Payment = { ...payment(75), paidAt: "2030-02-03T15:00:00.000Z" };
    const january = buildReport("2030-01-01", "2030-01-31", appointments, [later], [], [adjustment(-75, "2030-02-04T15:00:00.000Z")]);
    expect(january.owed).toBe(75);
    expect(january.collected).toBe(0);
    expect(buildReport("2030-02-01", "2030-02-28", appointments, [later], []).owed).toBe(0);
  });

  it("only counts sessions marked completed (or no-shows), never ones still scheduled", () => {
    const waiting: Appointment = { ...visit("a2", "2030-01-08", 0), clients: [{ clientId: "c1", status: "scheduled", charge: 0 }] };
    expect(buildReport("2030-01-01", "2030-01-31", [visit("a1", "2030-01-07", 75), waiting], [], []).owed).toBe(75);
  });
});

describe("payments CSV", () => {
  it("defuses spreadsheet formulas in names and notes", () => {
    const clients = [{ id: "c", name: "=HYPERLINK(\"x\")", phone: "", createdAt: "", archived: false }];
    const csv = paymentsCsv("2020-01-01", "2030-01-01", [{ id: "p", clientId: "c", amount: 5, method: "cash", paidAt: "2025-01-01", notes: "+1 ok" }], clients);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"\'+1 ok"');
  });
});
