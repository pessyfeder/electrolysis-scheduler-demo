import { useMemo, useState } from "react";
import { useToday } from "@/hooks/use-today";
import { Download, FileText, Pencil, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReportDetailDialog } from "@/components/ReportDetailDialog";
import { EditPaymentDialog } from "@/components/EditPaymentDialog";
import { buildReport, paymentsCsv, type LedgerRow } from "@/lib/billing";
import { fromDateKey, paymentDateKey } from "@/lib/data";
import { clientBalance } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export function BillingPanel() {
  return <BillingContent />;
}

function BillingContent() {
  const store = useStore();
  const today = useToday();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  // Left open past midnight, a report range that still ended on yesterday moves on to the new day.
  const [shownToday, setShownToday] = useState(today);
  if (shownToday !== today) {
    setShownToday(today);
    if (to === shownToday) setTo(today);
  }
  const [reportOpen, setReportOpen] = useState(false);
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const report = useMemo(() => buildReport(from, to, store.appointments, store.payments, store.clients, store.adjustments), [from, to, store.appointments, store.payments, store.clients, store.adjustments]);
  const recent = [...store.payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 8);

  function exportCsv() {
    const blob = new Blob([paymentsCsv(from, to, store.payments, store.clients)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `payments-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div>
    <section className="mt-2 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-xl">Payment report</h2>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To<Input type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button className="h-11" onClick={() => setReportOpen(true)}><FileText /> View report</Button>
        <Button className="h-11" variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
      </div>
    </section>


    <section className="mt-7 overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b p-5 font-serif text-xl">Recent payments</h2>
      {recent.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p> : <ul className="divide-y">{recent.map((p) => <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm"><span>{store.clients.find((c) => c.id === p.clientId)?.name} <span className="text-muted-foreground">· {fromDateKey(paymentDateKey(p.paidAt)).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {p.method}</span></span><span className="flex items-center gap-1"><span className="font-semibold">{money(p.amount)}</span><Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" aria-label={`Edit the ${money(p.amount)} payment`} onClick={() => setEditingId(p.id)}><Pencil /></Button></span></li>)}</ul>}
    </section>


    <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Payment report</DialogTitle><DialogDescription>{fromDateKey(from).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – {fromDateKey(to).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</DialogDescription></DialogHeader>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
        {report.rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing in this range.</p> : <table className="w-full text-sm"><tbody className="divide-y">{report.rows.map((r, i) => <tr key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(r)}>
          <td className="p-3 text-muted-foreground">{fromDateKey(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
          <td className="p-3">{r.clientName}</td>
          <td className={`p-3 ${r.unpaid ? "font-bold text-destructive" : "text-muted-foreground"}`}>{r.label}</td>
          <td className={`p-3 text-right ${r.unpaid ? "font-bold text-destructive" : "font-medium"}`}>{money(r.amount)}</td>
        </tr>)}</tbody></table>}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Collected</p><p className="font-semibold">{money(report.collected)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Owed (unpaid)</p><p className="font-semibold text-destructive">{money(report.owed)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Net</p><p className="font-semibold">{money(report.net)}</p></div>
      </div>
    </DialogContent></Dialog>
    <ReportDetailDialog row={detail} onClose={() => setDetail(null)} />
    <EditPaymentDialog payment={store.payments.find((p) => p.id === editingId) ?? null} onClose={() => setEditingId(null)} />
  </div>;
}

export function ClientBalances({ onViewBilling }: { onViewBilling: (clientId: string) => void }) {
  const store = useStore();
  const rows = useMemo(() => store.clients.filter((c) => !c.archived).map((client) => ({
    client,
    balance: clientBalance(client.id, store.appointments, store.payments, store.adjustments),
    noShows: store.appointments.filter((a) => a.clients.some((c) => c.clientId === client.id && c.status === "no_show")).length,
  })).sort((a, b) => b.balance - a.balance), [store.clients, store.appointments, store.payments, store.adjustments]);
  return (
    <section className="mt-5 overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b p-5 font-serif text-xl">Client balances</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Client</th><th className="p-3">Phone</th><th className="p-3 text-right">Balance</th><th className="p-3">Notes</th><th className="p-3" /></tr></thead>
        <tbody className="divide-y">{rows.map(({ client, balance, noShows }) => <tr key={client.id}>
          <td className="p-3 font-medium">{client.name}</td>
          <td className="p-3 text-muted-foreground">{client.phone}</td>
          <td className={`p-3 text-right font-semibold ${balance > 0 ? "text-destructive" : balance < 0 ? "text-status-completed" : ""}`}>{balance < 0 ? `${money(-balance)} credit` : money(balance)}</td>
          <td className="p-3">{noShows > 0 && <span className="rounded-full border border-status-noshow/40 bg-status-noshow/15 px-2 py-0.5 text-[11px] font-medium text-status-noshow">{noShows} no-show{noShows > 1 ? "s" : ""}</span>}</td>
          <td className="p-3 text-right"><Button variant="outline" className="h-11 whitespace-nowrap" aria-label={`View billing info for ${client.name}`} onClick={() => onViewBilling(client.id)}><ReceiptText /> View billing info</Button></td>
        </tr>)}</tbody>
      </table></div>
    </section>

  );
}
