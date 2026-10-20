import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { RequiredMark } from "@/components/RequiredMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Client } from "@/lib/data";
import { clientBalance } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const describe = (balance: number) => (balance > 0.004 ? `owes ${money(balance)}` : balance < -0.004 ? `has ${money(balance)} credit` : "is all settled ($0.00)");
const describeThey = (balance: number) => (balance > 0.004 ? `owe ${money(balance)}` : balance < -0.004 ? `have ${money(balance)} credit` : "are all settled ($0.00)");

/**
 * Set a client's balance to the right figure. The difference is saved as a balance adjustment with a reason,
 * so the history still shows every charge and payment as recorded.
 */
export function AdjustBalanceDialog({ client, open, onOpenChange }: { client: Client; open: boolean; onOpenChange: (open: boolean) => void }) {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const current = clientBalance(client.id, store.appointments, store.payments, store.adjustments);
  const [direction, setDirection] = useState<"owes" | "credit">("owes");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDirection(current < -0.004 ? "credit" : "owes");
    setAmount(Math.abs(current).toFixed(2));
    setReason("");
    setError("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = Number(amount);
  const target = Number.isFinite(value) ? Math.round((direction === "owes" ? value : -value) * 100) / 100 : NaN;
  const change = Math.round((target - current) * 100) / 100;

  async function save() {
    if (!(value >= 0) || amount.trim() === "") return setError("Enter the correct amount (0 or more).");
    if (Math.abs(change) < 0.01) return setError("That's already the balance — nothing to change.");
    if (!reason.trim()) return setError("Please add a short reason, e.g. \"Discount\" or \"Paid cash, not recorded\".");
    const ok = await confirm({
      title: "Are you sure?",
      description: `Change ${client.name}'s balance so they ${describeThey(target)}? This records an adjustment of ${change > 0 ? "+" : "−"}${money(change)} (${reason.trim()}).`,
      confirmLabel: "Adjust balance",
      cancelLabel: "Go back",
    });
    if (!ok) return;
    store.addAdjustment({ clientId: client.id, amount: change, reason: reason.trim() });
    onOpenChange(false);
  }

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>{client.name} currently {describe(current)}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Balance type">
            <Button className="h-11" type="button" role="radio" aria-checked={direction === "owes"} variant={direction === "owes" ? "default" : "outline"} onClick={() => { setDirection("owes"); setError(""); }}>Client owes</Button>
            <Button className="h-11" type="button" role="radio" aria-checked={direction === "credit"} variant={direction === "credit" ? "default" : "outline"} onClick={() => { setDirection("credit"); setError(""); }}>Client has credit</Button>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">Correct amount<RequiredMark /><Input aria-required="true" className="h-11" type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Reason<RequiredMark /><Input aria-required="true" className="h-11" maxLength={300} placeholder="e.g. Discount, or payment taken but not recorded" value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }} /></label>
          {Number.isFinite(change) && Math.abs(change) >= 0.01 && <p className="rounded-md bg-muted p-3 text-sm">
            New balance: {client.name} {describe(target)}. Recorded as an adjustment of <span className="font-semibold">{change > 0 ? "+" : "−"}{money(change)}</span> ({change > 0 ? "adds to what they owe" : "reduces what they owe"}).
          </p>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button className="h-11" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-11" onClick={save}>Save balance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {dialog}
  </>;
}
