import { paymentDateKey, type Adjustment, type Appointment, type Client, type Payment } from "./data";

export type Charge = { appointmentId?: string; adjustmentId?: string; clientId: string; date: string; amount: number; kind: "completed" | "no_show" | "adjustment"; unpaid: number };

/**
 * Every charge per client, with payments applied oldest-first to work out what is still unpaid.
 * Balance adjustments that add to what a client owes count as charges; ones that give credit count like payments.
 */
export function chargesWithUnpaid(appointments: Appointment[], payments: Payment[], adjustments: Adjustment[] = []): Charge[] {
  const charges: Charge[] = [
    ...appointments.flatMap((item) => item.clients
      .filter((c) => (c.status === "completed" || c.status === "no_show") && c.charge > 0)
      .map((c) => ({ appointmentId: item.id, clientId: c.clientId, date: item.date, amount: c.charge, kind: c.status as Charge["kind"], unpaid: c.charge }))),
    ...adjustments.filter((a) => a.amount > 0)
      .map((a) => ({ adjustmentId: a.id, clientId: a.clientId, date: paymentDateKey(a.createdAt), amount: a.amount, kind: "adjustment" as const, unpaid: a.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.clientId, (paid.get(p.clientId) ?? 0) + p.amount);
  for (const a of adjustments) if (a.amount < 0) paid.set(a.clientId, (paid.get(a.clientId) ?? 0) - a.amount);
  for (const charge of charges) {
    const left = paid.get(charge.clientId) ?? 0;
    const applied = Math.min(left, charge.amount);
    charge.unpaid = charge.amount - applied;
    paid.set(charge.clientId, left - applied);
  }
  return charges;
}

export type LedgerRow = { date: string; clientName: string; label: string; amount: number; unpaid: boolean; paymentId?: string; appointmentId?: string; adjustmentId?: string; clientId: string };

const UNPAID_LABEL: Record<Charge["kind"], string> = { completed: "Unpaid", no_show: "No Show", adjustment: "Adjustment (unpaid)" };

export function buildReport(from: string, to: string, appointments: Appointment[], payments: Payment[], clients: Client[], adjustments: Adjustment[] = []) {
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "Unknown";
  const rows: LedgerRow[] = [];
  for (const p of payments) {
    const date = paymentDateKey(p.paidAt);
    if (date >= from && date <= to) rows.push({ date, clientName: name(p.clientId), label: `Payment (${p.method})`, amount: p.amount, unpaid: false, paymentId: p.id, clientId: p.clientId });
  }
  // "Owed" is as of the range's last day: payments and credits made after it don't reduce it.
  const paidBy = payments.filter((p) => paymentDateKey(p.paidAt) <= to);
  const adjustedBy = adjustments.filter((a) => paymentDateKey(a.createdAt) <= to);
  for (const c of chargesWithUnpaid(appointments, paidBy, adjustedBy)) {
    if (c.unpaid > 0.004 && c.date <= to) {
      const row: LedgerRow = { date: c.date, clientName: name(c.clientId), label: UNPAID_LABEL[c.kind], amount: -c.unpaid, unpaid: true, clientId: c.clientId };
      if (c.appointmentId) row.appointmentId = c.appointmentId;
      if (c.adjustmentId) row.adjustmentId = c.adjustmentId;
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const collected = rows.filter((r) => !r.unpaid).reduce((s, r) => s + r.amount, 0);
  const owed = rows.filter((r) => r.unpaid).reduce((s, r) => s - r.amount, 0);
  return { rows, collected, owed, net: collected - owed };
}

export function paymentsCsv(from: string, to: string, payments: Payment[], clients: Client[]) {
  // A leading = + - @ (or tab/CR) would run as a formula when opened in a spreadsheet, so those cells get a leading apostrophe.
  const esc = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const lines = ["Date,Client,Amount,Method,Notes"];
  for (const p of [...payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt))) {
    const date = paymentDateKey(p.paidAt);
    if (date < from || date > to) continue;
    lines.push([date, esc(clients.find((c) => c.id === p.clientId)?.name ?? ""), p.amount.toFixed(2), p.method, esc(p.notes)].join(","));
  }
  return lines.join("\n");
}
