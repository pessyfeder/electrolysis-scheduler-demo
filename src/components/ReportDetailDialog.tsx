import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CLIENT_PROGRESS, StatusLabel } from "@/components/AppointmentControls";
import { formatDuration, formatTime, fromDateKey, paymentDateKey, workedMinutes } from "@/lib/data";
import type { LedgerRow } from "@/lib/billing";
import { useStore } from "@/lib/store";

const longDate = (key: string) => fromDateKey(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—");

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 p-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}

/** Full details behind one line of the payment report. */
export function ReportDetailDialog({ row, onClose }: { row: LedgerRow | null; onClose: () => void }) {
  const store = useStore();
  const name = (id: string) => store.clients.find((c) => c.id === id)?.name ?? "Unknown";
  const payment = row?.paymentId ? store.payments.find((p) => p.id === row.paymentId) : undefined;
  const appt = row?.appointmentId ? store.appointments.find((a) => a.id === row.appointmentId) : undefined;
  const adjustment = row?.adjustmentId ? store.adjustments.find((a) => a.id === row.adjustmentId) : undefined;

  return <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-lg">
    {payment && <>
      <DialogHeader><DialogTitle>Payment</DialogTitle><DialogDescription>{longDate(paymentDateKey(payment.paidAt))}</DialogDescription></DialogHeader>
      <div className="divide-y rounded-lg border">
        <Row label="Client" value={name(payment.clientId)} />
        <Row label="Amount" value={`$${payment.amount.toFixed(2)}`} />
        <Row label="Method" value={<span className="capitalize">{payment.method}</span>} />
        <Row label="Recorded at" value={clock(payment.paidAt)} />
        <Row label="Notes" value={payment.notes || "—"} />
      </div>
    </>}
    {appt && row && <>
      <DialogHeader><DialogTitle>Appointment</DialogTitle><DialogDescription>{longDate(appt.date)} · {formatTime(appt.time)}</DialogDescription></DialogHeader>
      <div className="divide-y rounded-lg border">
        <Row label="Booked length" value={formatDuration(appt.durationMin)} />
        <Row label="Notes" value={appt.notes || "—"} />
        <Row label="Still unpaid" value={<span className="text-destructive">${(-row.amount).toFixed(2)}</span>} />
      </div>
      <div className="divide-y rounded-lg border">
        {appt.clients.map((c) => <div key={c.clientId} className={`grid gap-1 p-3 text-sm ${c.clientId === row.clientId ? "bg-muted/40" : ""}`}>
          <div className="flex items-center justify-between"><span className="font-semibold">{name(c.clientId)}</span><StatusLabel progress={CLIENT_PROGRESS[c.status]} /></div>
          <div className="flex justify-between text-muted-foreground"><span>{clock(c.startedAt)} – {clock(c.endedAt)}{c.startedAt && c.endedAt ? ` · ${formatDuration(workedMinutes(c))}` : ""}</span><span>Charge ${c.charge.toFixed(2)}</span></div>
        </div>)}
      </div>
    </>}
    {adjustment && row && <>
      <DialogHeader><DialogTitle>Balance adjustment</DialogTitle><DialogDescription>{longDate(paymentDateKey(adjustment.createdAt))}</DialogDescription></DialogHeader>
      <div className="divide-y rounded-lg border">
        <Row label="Client" value={name(adjustment.clientId)} />
        <Row label="Adjustment" value={`${adjustment.amount > 0 ? "+" : "−"}$${Math.abs(adjustment.amount).toFixed(2)}`} />
        <Row label="Reason" value={adjustment.reason} />
        <Row label="Still unpaid" value={<span className="text-destructive">${(-row.amount).toFixed(2)}</span>} />
      </div>
    </>}
    {row && !payment && !appt && !adjustment && <p className="text-sm text-muted-foreground">This record is no longer available.</p>}
  </DialogContent></Dialog>;
}
