import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Phone, ReceiptText, UserPlus } from "lucide-react";
import { BillingPanel, ClientBalances } from "@/components/BillingPanel";
import { ClientCombobox } from "@/components/ClientCombobox";
import { RequiredMark } from "@/components/RequiredMark";
import { ClientBillingDialog } from "@/components/ClientBillingDialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appointmentStart, formatPhone, joinName, splitName, formatTime, fromDateKey } from "@/lib/data";
import { clientBalance } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

const PHONE_PATTERN = /^\(\d{3}\) \d{3}-\d{4}$/;

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [
    { title: "Clients & Billing | Electrolysis Scheduler" },
    { name: "description", content: "Type a name or phone number to pull up a client, review their balance, and record payments." },
    { property: "og:title", content: "Clients & Billing | Electrolysis Scheduler" },
    { property: "og:description", content: "Type a name or phone number to pull up a client, review their balance, and record payments." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClientsPage,
});

function ClientsPage() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ first: "", last: "", phone: "" });
  const [billingInfoId, setBillingInfoId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const selected = store.clients.find((client) => client.id === selectedId) ?? null;
  const balance = selected ? clientBalance(selected.id, store.appointments, store.payments, store.adjustments) : 0;
  const visits = selected
    ? store.appointments.flatMap((item) => item.clients).filter((entry) => entry.clientId === selected.id && entry.status === "completed").length
    : 0;
  // Appointments still open for this client, split into ones yet to come and past ones never marked.
  const pending = selected
    ? store.appointments.filter((item) => item.clients.some((entry) => entry.clientId === selected.id && entry.status === "scheduled")).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    : [];
  const started = (item: (typeof pending)[number]) => Boolean(item.clients.find((entry) => entry.clientId === selected?.id)?.startedAt);
  const running = pending.filter(started);
  const unmarked = pending.filter((item) => !started(item) && appointmentStart(item) <= new Date());
  const upcoming = pending.filter((item) => !started(item) && appointmentStart(item) > new Date());
  const active = store.clients.filter((client) => !client.archived).length;
  const canSave = draft.last.trim().length > 0 && PHONE_PATTERN.test(draft.phone);

  function startNew(name = "") {
    setDraft({ ...splitName(name), phone: "" });
    setEditing(false);
    setCreating(true);
  }

  function startEdit() {
    if (!selected) return;
    setDraft({ ...splitName(selected.name), phone: selected.phone });
    setCreating(false);
    setEditing(true);
    setNotice("");
  }

  function closeForm() {
    setCreating(false);
    setEditing(false);
    setDraft({ first: "", last: "", phone: "" });
  }

  function saveClient() {
    if (!canSave) return;
    if (editing && selected) {
      store.updateClient(selected.id, { name: joinName(draft.first, draft.last), phone: draft.phone });
      setNotice("Client details saved.");
    } else {
      const client = store.addClient({ name: joinName(draft.first, draft.last), phone: draft.phone });
      setSelectedId(client.id);
    }
    closeForm();
  }

  async function toggleArchive() {
    if (!selected) return;
    if (selected.archived) {
      store.setClientArchived(selected.id, false);
      setNotice("Client restored to the active list.");
      return;
    }
    if (Math.abs(balance) > 0.004) {
      setNotice(`${selected.name} has a ${balance > 0 ? "balance owed" : "credit"} of $${Math.abs(balance).toFixed(2)}. Settle it before archiving.`);
      return;
    }
    if (pending.length > 0) {
      const when = (list: typeof pending) => list.map((item) => `${fromDateKey(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${formatTime(item.time)}`).join(", ");
      const parts = [];
      if (running.length) parts.push("Their session is still running: end it first.");
      if (upcoming.length) parts.push(`Cancel the upcoming appointment${upcoming.length === 1 ? "" : "s"} (${when(upcoming)}).`);
      if (unmarked.length) parts.push(`${unmarked.length === 1 ? "A past appointment was" : `${unmarked.length} past appointments were`} never marked (${when(unmarked)}): open ${unmarked.length === 1 ? "it" : "each one"} on the Schedule and choose No-show or Cancel.`);
      setNotice(`${selected.name} can't be archived yet. ${parts.join(" ")}`);
      return;
    }
    const ok = await confirm({ title: `Archive ${selected.name}?`, description: "They'll be hidden from booking and the balances list. Their history is kept, and you can restore them any time by searching their name.", confirmLabel: "Archive client", cancelLabel: "Keep active" });
    if (!ok) return;
    store.setClientArchived(selected.id, true);
    setNotice("Client archived.");
  }

  const form = (creating || editing) && <div className="mt-4 grid items-end gap-2 border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
    {editing && <p className="text-sm font-medium sm:col-span-4">Edit client details</p>}
    <label className="block text-sm font-medium">First name <span className="font-normal text-muted-foreground">(optional)</span><Input className="mt-1 h-11 font-normal" maxLength={50} value={draft.first} onChange={(event) => setDraft((current) => ({ ...current, first: event.target.value }))} /></label>
    <label className="block text-sm font-medium">Last name<RequiredMark /><Input className="mt-1 h-11 font-normal" aria-required="true" maxLength={50} value={draft.last} onChange={(event) => setDraft((current) => ({ ...current, last: event.target.value }))} /></label>
    <label className="block text-sm font-medium">Phone<RequiredMark /><Input className="mt-1 h-11 font-normal" aria-required="true" inputMode="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: formatPhone(event.target.value) }))} /></label>
    <div className="flex gap-2">
      <Button className="h-11" disabled={!canSave} onClick={saveClient}>Save</Button>
      <Button className="h-11" variant="ghost" onClick={closeForm}>Cancel</Button>
    </div>
  </div>;

  return <main className="mx-auto max-w-5xl px-4 py-8">
    <p className="text-xs font-medium uppercase text-muted-foreground">Practitioner only</p>
    <h1 className="mt-1 font-serif text-3xl">Clients &amp; Billing</h1>
    <section className="mt-5">
      <div className="flex flex-wrap justify-end">
        <Button className="h-11" variant="outline" onClick={() => startNew()}><UserPlus /> New client</Button>
      </div>

      <div className="mt-6">
        <ClientCombobox
          clients={store.clients}
          onNewClient={startNew}
          onSelect={(client) => { setSelectedId(client.id); closeForm(); setNotice(""); }}
        />
        <p className="mt-2 text-xs text-muted-foreground">{active} client{active === 1 ? "" : "s"} on file{active !== store.clients.length ? ` · ${store.clients.length - active} archived` : ""}</p>
      </div>

      <ClientBalances onViewBilling={setBillingInfoId} />

      {creating && form}

      {selected ? <article className="mt-5 border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 font-serif text-2xl">{selected.name}{selected.archived && <span className="rounded-full border px-2 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">Archived</span>}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" /> {selected.phone}</p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-semibold ${balance > 0 ? "text-destructive" : ""}`}>${balance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">balance</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="h-11" variant="outline" onClick={() => setBillingInfoId(selected.id)}><ReceiptText /> View billing info</Button>
          <Button className="h-11" variant="outline" onClick={startEdit}><Pencil /> Edit details</Button>
          <Button className="h-11" variant="ghost" onClick={toggleArchive}>{selected.archived ? <><ArchiveRestore /> Restore client</> : <><Archive /> Archive</>}</Button>
        </div>
        {editing && form}
        {notice && <p className="mt-3 text-sm text-muted-foreground" role="status">{notice}</p>}
        <p className="mt-4 text-sm text-muted-foreground">{visits} completed visit{visits === 1 ? "" : "s"}</p>
      </article> : <p className="mt-5 border border-dashed p-6 text-center text-sm text-muted-foreground">Start typing above to pull up a client, or create a new one.</p>}

      <ClientBillingDialog client={store.clients.find((c) => c.id === billingInfoId) ?? null} onClose={() => setBillingInfoId(null)} />
    </section>

    <section className="mt-8">
      <BillingPanel />
    </section>
    {dialog}
  </main>;
}
