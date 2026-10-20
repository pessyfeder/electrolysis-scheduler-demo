import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { RequiredMark } from "@/components/RequiredMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { paymentDateKey, toDateKey, type Payment } from "@/lib/data";
import { useStore } from "@/lib/store";

const METHODS: Payment["method"][] = ["cash", "card", "check", "other"];

/** Fix a payment entered by mistake (amount, method, date, notes) or delete it. Both ask "Are you sure?" first. */
export function EditPaymentDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!payment) return;
    setAmount(payment.amount.toFixed(2));
    setMethod(payment.method);
    setDate(paymentDateKey(payment.paidAt));
    setNotes(payment.notes);
    setError("");
  }, [payment]);

  if (!payment) return null;
  const name = store.clients.find((c) => c.id === payment.clientId)?.name ?? "this client";
  const today = toDateKey(new Date());

  async function save() {
    if (!payment) return;
    if (!(Number(amount) > 0)) return setError("Enter an amount above $0.");
    if (!date || date > today) return setError("Choose a date that isn't in the future.");
    const rounded = Math.round(Number(amount) * 100) / 100;
    const ok = await confirm({ title: "Are you sure?", description: `Save the changes to ${name}'s payment (now $${rounded.toFixed(2)}, ${method})? Their balance updates to match.`, confirmLabel: "Save changes", cancelLabel: "Go back" });
    if (!ok) return;
    store.updatePayment(payment.id, { amount: rounded, method, notes, date });
    onClose();
  }

  async function remove() {
    if (!payment) return;
    const ok = await confirm({ title: "Are you sure?", description: `Delete ${name}'s $${payment.amount.toFixed(2)} payment? Their balance goes back up by this amount. This can't be undone.`, confirmLabel: "Delete payment", cancelLabel: "Keep payment", destructive: true });
    if (!ok) return;
    store.deletePayment(payment.id);
    onClose();
  }

  return <>
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit payment</DialogTitle><DialogDescription>{name}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-muted-foreground">Amount<RequiredMark /><Input aria-required="true" className="h-11" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Date<RequiredMark /><Input aria-required="true" className="h-11" type="date" max={today} value={date} onChange={(e) => { setDate(e.target.value); setError(""); }} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Method<RequiredMark />
            <Select value={method} onValueChange={(v) => setMethod(v as Payment["method"])}><SelectTrigger className="h-11 capitalize"><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((m) => <SelectItem className="h-10 capitalize" key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Notes (optional)<Input className="h-11" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button className="h-11" variant="ghost" onClick={remove}><Trash2 /> Delete payment</Button>
          <div className="flex gap-2">
            <Button className="h-11" variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="h-11" onClick={save}>Save changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {dialog}
  </>;
}
