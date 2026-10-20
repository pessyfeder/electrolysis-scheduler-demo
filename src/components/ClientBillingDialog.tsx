import { CreditCard, Pencil, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { EditPaymentDialog } from "@/components/EditPaymentDialog";
import { EditSessionDialog } from "@/components/EditSessionDialog";
import { AdjustBalanceDialog } from "@/components/AdjustBalanceDialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromDateKey, formatDurationLong, paymentDateKey, workedMinutes, formatTime, statusLabel, type Adjustment, type Client } from "@/lib/data";
import { clientBalance } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const shortDate = (key: string) => fromDateKey(key).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS_STYLE: Record<string, string> = {
  scheduled: "border-status-scheduled/40 bg-status-scheduled/15 text-status-scheduled",
  completed: "border-status-completed/40 bg-status-completed/15 text-status-completed",
  no_show: "border-status-noshow/40 bg-status-noshow/15 text-status-noshow",
  cancelled: "border-status-cancelled/40 bg-status-cancelled/15 text-status-cancelled",
};

/**
 * Full billing picture for one client: every appointment charge, every payment and balance adjustment, and the
 * running balance. Finished sessions, payments and the balance itself can all be corrected from here.
 */
export function ClientBillingDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [payOpen, setPayOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [session, setSession] = useState<{ appointmentId: string; clientId: string } | null>(null);

  const data = useMemo(() => {
    if (!client) return null;
    const entries = store.appointments
      .flatMap((a) => a.clients
        .filter((c) => c.clientId === client.id)
        .map((c) => ({
          id: `${a.id}-${c.clientId}`,
          appointmentId: a.id,
          date: a.date,
          time: a.time,
          durationMin: a.durationMin,
          status: c.status,
          charge: c.charge,
          customCharge: Boolean(c.customCharge),
          startedAt: c.startedAt,
          endedAt: c.endedAt,
          worked: c.startedAt && c.endedAt ? workedMinutes(c) : 0,
          // Finished sessions and no-shows can be corrected; a session still running is fixed with Correct times.
          editable: (c.status === "completed" && Boolean(c.endedAt || !c.startedAt)) || c.status === "no_show",
        })))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const payments = store.payments
      .filter((p) => p.clientId === client.id)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    const adjustments = store.adjustments
      .filter((a) => a.clientId === client.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const charged = entries.filter((e) => e.status === "completed" || e.status === "no_show").reduce((sum, e) => sum + e.charge, 0);
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    const adjusted = adjustments.reduce((sum, a) => sum + a.amount, 0);
    return { entries, payments, adjustments, charged, paid, adjusted, balance: clientBalance(client.id, store.appointments, store.payments, store.adjustments) };
  }, [client, store.appointments, store.payments, store.adjustments]);

  if (!client || !data) return null;

  async function removeAdjustment(adjustment: Adjustment) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `Remove the ${adjustment.amount > 0 ? "+" : "−"}$${Math.abs(adjustment.amount).toFixed(2)} adjustment ("${adjustment.reason}")? The balance goes back to what it was without it.`,
      confirmLabel: "Remove adjustment",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (ok) store.deleteAdjustment(adjustment.id);
  }

  const editingSession = session ? store.appointments.find((a) => a.id === session.appointmentId) ?? null : null;

  return <>
  <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{client.name} — billing info</DialogTitle>
        <DialogDescription>{client.phone}</DialogDescription>
      </DialogHeader>

      <div className={`grid gap-3 text-center ${data.adjustments.length ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Charged</p><p className="font-semibold">{money(data.charged)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Paid</p><p className="font-semibold">{money(data.paid)}</p></div>
        {data.adjustments.length > 0 && <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Adjustments</p><p className="font-semibold">{data.adjusted > 0 ? "+" : ""}{money(data.adjusted)}</p></div>}
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{data.balance < 0 ? "Credit" : "Balance"}</p><p className={`font-semibold ${data.balance > 0 ? "text-destructive" : data.balance < 0 ? "text-status-completed" : ""}`}>{money(data.balance)}</p></div>
      </div>

      <h3 className="mt-2 font-serif text-lg">Appointments</h3>
      <div className="max-h-[30vh] overflow-y-auto rounded-lg border">
        {data.entries.length === 0 ? <p className="p-5 text-center text-sm text-muted-foreground">No appointments yet.</p> : <ul className="divide-y">{data.entries.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <span className="text-muted-foreground">{shortDate(e.date)} · {formatTime(e.time)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[e.status]}`}>{statusLabel(e.status)}</span>
          {e.startedAt && e.endedAt && <span className="text-xs text-muted-foreground">{formatDurationLong(e.worked)}</span>}
          <span className="ml-auto font-medium">{(e.status === "completed" || e.status === "no_show") ? <>{money(e.charge)}{e.customCharge && <span className="ml-1 text-xs font-normal text-muted-foreground">(set by hand)</span>}</> : e.status === "scheduled" ? `booked ${formatDurationLong(e.durationMin)}` : "—"}</span>
          {e.editable
            ? <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" aria-label={`Edit the ${shortDate(e.date)} session`} onClick={() => setSession({ appointmentId: e.appointmentId, clientId: client.id })}><Pencil /></Button>
            : <span className="w-10" aria-hidden />}
        </li>)}</ul>}
      </div>

      <h3 className="mt-2 font-serif text-lg">Payments</h3>
      <div className="max-h-[25vh] overflow-y-auto rounded-lg border">
        {data.payments.length === 0 ? <p className="p-5 text-center text-sm text-muted-foreground">No payments recorded.</p> : <ul className="divide-y">{data.payments.map((p) => <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
          <span className="text-muted-foreground">{shortDate(paymentDateKey(p.paidAt))}</span>
          <span className="capitalize">{p.method}</span>
          {p.notes && <span className="truncate text-xs text-muted-foreground">{p.notes}</span>}
          <span className="ml-auto font-medium">{money(p.amount)}</span>
          <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" aria-label={`Edit the ${money(p.amount)} payment`} onClick={() => setEditingId(p.id)}><Pencil /></Button>
        </li>)}</ul>}
      </div>

      {data.adjustments.length > 0 && <>
        <h3 className="mt-2 font-serif text-lg">Balance adjustments</h3>
        <div className="max-h-[20vh] overflow-y-auto rounded-lg border">
          <ul className="divide-y">{data.adjustments.map((a) => <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="text-muted-foreground">{shortDate(paymentDateKey(a.createdAt))}</span>
            <span className="truncate">{a.reason}</span>
            <span className="ml-auto font-medium">{a.amount > 0 ? "+" : "−"}${Math.abs(a.amount).toFixed(2)}</span>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" aria-label={`Remove the ${a.reason} adjustment`} onClick={() => removeAdjustment(a)}><Trash2 /></Button>
          </li>)}</ul>
        </div>
      </>}

      <DialogFooter className="flex-wrap gap-2">
        <Button className="h-11" variant="outline" onClick={() => setAdjustOpen(true)}><Scale /> Adjust balance</Button>
        <Button className="h-11" onClick={() => setPayOpen(true)}><CreditCard /> Record payment</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} clientIds={[client.id]} />
  <EditPaymentDialog payment={store.payments.find((p) => p.id === editingId) ?? null} onClose={() => setEditingId(null)} />
  <AdjustBalanceDialog client={client} open={adjustOpen} onOpenChange={setAdjustOpen} />
  <EditSessionDialog item={editingSession} clientId={session?.clientId ?? null} onClose={() => setSession(null)} />
  {dialog}
  </>;
}
