import { toast } from "sonner";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useToday } from "@/hooks/use-today";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, Pencil, Search, UserPlus, X } from "lucide-react";
import { useLock } from "@/lib/lock";
import { useConfirm } from "@/components/ConfirmDialog";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { ClientCalendar, FindAppointmentsForm } from "@/components/ClientCalendar";
import { RequiredMark } from "@/components/RequiredMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pastStartIssue, validateAppointment } from "@/lib/scheduling";
import { appointmentProgress, DURATION_OPTIONS, notesIssue, formatDuration, formatPhone, formatTime, fromDateKey, joinName, splitName, toDateKey, type Client } from "@/lib/data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/book")({
  validateSearch: (search: Record<string, unknown>) => ({ edit: typeof search["edit"] === "string" ? search["edit"] : undefined }),
  head: () => ({ meta: [
    { title: "New Appointment | Electrolysis Scheduler" },
    { name: "description", content: "Schedule an electrolysis appointment safely within business hours." },
    { property: "og:title", content: "New Appointment | Electrolysis Scheduler" },
    { property: "og:description", content: "Schedule an electrolysis appointment safely within business hours." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BookRoute,
});

const STEPS = ["Duration", "Date & time", "Clients", "Confirm"];
/** Lengths offered as big buttons; every other length is in the "Other length" list. */
const COMMON_DURATIONS = [15, 30, 45, 60, 90, 120];

/** A fresh form whenever the link or the Admin lock changes, so nothing picked in Admin carries over to the public screen. */
function BookRoute() {
  const search = Route.useSearch();
  const { status } = useLock();
  return <BookPage key={`${status}|${search.edit ?? ""}`} />;
}

function BookPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const store = useStore();
  const { status } = useLock();
  // Without the Admin password the Book screen is public: no client list, no rescheduling.
  const isPublic = status !== "unlocked";
  const edit = isPublic ? undefined : search.edit;
  const existing = edit ? store.appointments.find((item) => item.id === edit) : undefined;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [step, setStep] = useState(0);
  const [durationMin, setDuration] = useState(existing?.durationMin ?? 30);
  const today = useToday();
  const [date, setDate] = useState(existing?.date ?? today);
  const [time, setTime] = useState<string | null>(existing?.time ?? null);
  // When the day rolls over with yesterday still picked, move the booking to the new day (yesterday's times are gone).
  const [shownToday, setShownToday] = useState(today);
  if (shownToday !== today) {
    setShownToday(today);
    if (date < today) { setDate(today); setTime(null); }
  }
  const [clientIds, setClientIds] = useState<string[]>(existing?.clients.map((item) => item.clientId) ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [newClient, setNewClient] = useState({ first: "", last: "", phone: "" });
  const [showNew, setShowNew] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [error, setError] = useState("");
  const [guest, setGuest] = useState({ firstName: "", lastName: "", phone: "" });
  const [booked, setBooked] = useState<string | null>(null);
  // After booking, "Done" opens a read-only calendar of this client's own appointments; "Find my appointments" reaches the same view by name + phone.
  const [mine, setMine] = useState<{ ids: string[]; highlightId?: string } | null>(null);
  const [finding, setFinding] = useState(false);
  const seeded = store.ready && Boolean(edit);

  // Saved data loads just after first paint, so re-sync the form once the
  // store is ready (keeps reschedule prefill correct after a refresh).
  useEffect(() => {
    if (!seeded || !existing) return;
    setDuration(existing.durationMin);
    setDate(existing.date);
    setTime(existing.time);
    setClientIds(existing.clients.map((item) => item.clientId));
    setNotes(existing.notes);
  }, [seeded]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Leave the reschedule without saving: the appointment keeps its original time. Asks first only if something was changed. */
  async function cancelReschedule() {
    if (!existing) return;
    const changed = durationMin !== existing.durationMin || date !== existing.date || time !== existing.time || notes !== existing.notes
      || clientIds.join() !== existing.clients.map((item) => item.clientId).join();
    if (changed && !(await confirm({ title: "Are you sure?", description: `Discard your changes? The appointment stays on ${fromDateKey(existing.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(existing.time)}.`, confirmLabel: "Discard changes", cancelLabel: "Keep editing" }))) return;
    store.setHighlightId(existing.id);
    navigate({ to: "/schedule" });
  }

  // Clients already picked always stay visible; the rest are filtered by the search (name, or phone digits).
  const pickable = useMemo(() => {
    const needle = clientQuery.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    const matches = (client: Client) => !needle || client.name.toLowerCase().includes(needle) || (digits.length > 0 && client.phone.replace(/\D/g, "").includes(digits));
    const active = store.clients.filter((client) => !client.archived);
    return [...active.filter((client) => clientIds.includes(client.id)), ...active.filter((client) => !clientIds.includes(client.id) && matches(client)).sort((a, b) => a.name.localeCompare(b.name))];
  }, [store.clients, clientIds, clientQuery]);
  const guestName = joinName(guest.firstName, guest.lastName);
  const guestValid = guest.lastName.trim().length > 0 && guest.phone.replace(/\D/g, "").length === 10;
  const canContinue = step === 0 || (step === 1 && Boolean(time)) || (step === 2 && (isPublic ? guestValid : clientIds.length > 0));

  /** Start a new booking. `keepGuest` keeps the client's name and phone for "Book another appointment"; Done clears them for the next person. */
  function resetForm(keepGuest = false) {
    setStep(0); setDuration(30); setDate(toDateKey(new Date())); setTime(null);
    setMine(null); setFinding(false);
    setClientIds([]); setNotes(""); if (!keepGuest) setGuest({ firstName: "", lastName: "", phone: "" }); setError(""); setBooked(null);
  }

  function addNewClient() {
    try {
      const client = store.addClient({ name: joinName(newClient.first, newClient.last), phone: formatPhone(newClient.phone) });
      setClientIds((current) => [...current, client.id]);
      setNewClient({ first: "", last: "", phone: "" });
      setShowNew(false);
      setError("");
    } catch { setError("Enter a last name and 10-digit phone number."); }
  }

  async function finish() {
    if (!time || (edit && !existing)) return;
    if (existing && appointmentProgress(existing) !== "scheduled") { setError("Only scheduled appointments can be rescheduled."); return; }
    const noteError = notesIssue(notes);
    if (noteError) { setError(noteError); setStep(2); return; }
    const issue = pastStartIssue(date, time) ?? validateAppointment({ date, time, durationMin, ...(edit ? { excludeId: edit } : {}) }, store.appointments, store.blockedTimes);
    if (issue) { setError(issue); setStep(1); return; }
    if (edit && existing) {
      const names = clientIds.map((id) => store.clients.find((client) => client.id === id)?.name).filter(Boolean).join(" & ") || "this";
      const oldWhen = `${fromDateKey(existing.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(existing.time)}`;
      const newWhen = `${fromDateKey(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(time)}`;
      const ok = await confirm({ title: `Reschedule ${names}'s appointment?`, description: `From ${oldWhen} to ${newWhen}.`, confirmLabel: "Reschedule appointment", cancelLabel: "Keep original" });
      if (!ok) return;
    }
    let ids = clientIds;
    if (isPublic) {
      // Reuse a matching client record by name and phone number; otherwise create one. Nothing about it is shown back.
      const phone = formatPhone(guest.phone);
      const digits = phone.replace(/\D/g, "");
      // Requiring the name too means a typed phone number alone can't attach a booking to someone else.
      const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
      const matches = store.clients.filter((client) => client.phone.replace(/\D/g, "") === digits && sameName(client.name, guestName));
      // Prefer an active record; a returning client who was archived is restored rather than duplicated.
      const match = matches.find((client) => !client.archived) ?? matches[0];
      if (match?.archived) store.setClientArchived(match.id, false);
      try { ids = [match ? match.id : store.addClient({ name: guestName, phone }).id]; }
      catch { setError("Enter your last name and a 10-digit phone number."); setStep(2); return; }
    }
    const input = { date, time, durationMin, clientIds: ids, notes };
    const savedId = edit ? (store.updateAppointment(edit, input), edit) : store.addAppointment(input).id;
    const when = `${fromDateKey(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${formatTime(time)}`;
    if (isPublic) { setMine({ ids, highlightId: savedId }); setBooked(when); return; }
    store.setHighlightId(savedId);
    toast.success(edit ? "Appointment updated" : "Appointment confirmed", { description: when });
    navigate({ to: "/schedule" });
  }

  // A reschedule link whose appointment is gone (e.g. an older backup was restored) can't be saved.
  if (edit && store.ready && !existing) return <main className="mx-auto max-w-xl px-4 py-16 text-center">
    <h1 className="font-serif text-3xl">This appointment no longer exists</h1>
    <p className="mt-3 text-muted-foreground">It may have been removed when a backup was restored. Nothing was changed.</p>
    <div className="mt-8 flex flex-wrap justify-center gap-2">
      <Button asChild variant="outline" className="h-12 px-6"><Link to="/schedule">Back to schedule</Link></Button>
      <Button asChild className="h-12 px-6"><Link to="/book" search={{ edit: undefined }}><CalendarPlus /> New appointment</Link></Button>
    </div>
  </main>;

  if (!booked && isPublic && finding) return <FindAppointmentsForm onBack={() => setFinding(false)} onFound={(ids) => { setFinding(false); setMine({ ids }); }} />;
  if (!booked && isPublic && mine) return <ClientCalendar clientIds={mine.ids} highlightId={mine.highlightId} onExit={() => resetForm()} />;

  if (booked) return <main className="mx-auto max-w-xl px-4 py-16 text-center">
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-7 w-7" /></span>
    <h1 className="mt-5 font-serif text-3xl">Appointment booked</h1>
    <p className="mt-3 text-lg">{booked}</p>
    <p className="mt-1 text-muted-foreground">{formatDuration(durationMin)}</p>
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Button className="h-12 px-6" variant="outline" onClick={() => resetForm(true)}><CalendarPlus /> Book another appointment</Button>
      <Button className="h-12 px-6" onClick={() => setBooked(null)}><Check /> Done</Button>
    </div>
  </main>;

  return <main className="mx-auto max-w-3xl px-4 py-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">Appointment</p>
        <h1 className="mt-1 font-serif text-3xl">{edit ? "Reschedule appointment" : "New appointment"}</h1>
      </div>
      {isPublic && <Button variant="outline" className="h-11" onClick={() => setFinding(true)}><Search /> Find my appointments</Button>}
      {existing && <Button variant="outline" className="h-11" onClick={cancelReschedule}><X /> Cancel reschedule</Button>}
    </div>
    <ol className="mt-6 grid grid-cols-4 gap-1">{STEPS.map((label, index) => <li key={label} className="min-w-0 text-center"><span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm ${index <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{index < step ? <Check /> : index + 1}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{isPublic && label === "Clients" ? "Your details" : label}</span></li>)}</ol>

    {(step === 1 || step === 2) && <div className="mt-5"><p className="pb-1 text-xs font-medium uppercase text-muted-foreground">Your choices so far</p><dl className="divide-y border-y text-sm"><Summary label="Duration" onEdit={() => setStep(0)} value={formatDuration(durationMin)} />{step === 2 && time && <Summary label="When" onEdit={() => setStep(1)} value={`${fromDateKey(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${formatTime(time)}`} />}</dl></div>}

    <section className="mt-7 border-y py-6">
      {step === 0 && <div><h2 className="font-serif text-xl">How long?</h2><div className="mt-4 grid grid-cols-3 gap-2">{COMMON_DURATIONS.map((duration) => <Button key={duration} variant={durationMin === duration ? "default" : "outline"} className="h-14 text-base" onClick={() => { setDuration(duration); setTime(null); }}>{formatDuration(duration)}</Button>)}</div><div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm text-muted-foreground" htmlFor="other-length">Other length</label><Select value={String(durationMin)} onValueChange={(value) => { setDuration(Number(value)); setTime(null); }}><SelectTrigger id="other-length" className={`h-12 w-44 ${COMMON_DURATIONS.includes(durationMin) ? "" : "border-primary ring-2 ring-primary/30"}`}><SelectValue /></SelectTrigger><SelectContent>{DURATION_OPTIONS.map((duration) => <SelectItem className="h-10" key={duration} value={String(duration)}>{formatDuration(duration)}</SelectItem>)}</SelectContent></Select></div></div>}
      {step === 1 && <div><div><AvailabilityPicker durationMin={durationMin} excludeId={edit} date={date} time={time} onChange={(pickedDate, pickedTime) => { setDate(pickedDate); setTime(pickedTime); setError(""); }} /></div></div>}
      {step === 2 && isPublic && <div><h2 className="font-serif text-xl">Your details</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="block text-sm font-medium" htmlFor="guest-first-name">First name <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="guest-first-name" className="mt-1 h-12" autoComplete="off" maxLength={50} value={guest.firstName} onChange={(event) => { setGuest({ ...guest, firstName: event.target.value }); setError(""); }} /></div><div><label className="block text-sm font-medium" htmlFor="guest-last-name">Last name<RequiredMark /></label><Input id="guest-last-name" className="mt-1 h-12" autoComplete="off" maxLength={50} aria-required="true" value={guest.lastName} onChange={(event) => { setGuest({ ...guest, lastName: event.target.value }); setError(""); }} /></div><div><label className="block text-sm font-medium" htmlFor="guest-phone">Phone<RequiredMark /></label><Input id="guest-phone" className="mt-1 h-12" inputMode="tel" aria-required="true" autoComplete="off" placeholder="(555) 555-5555" value={guest.phone} onChange={(event) => { setGuest({ ...guest, phone: formatPhone(event.target.value) }); setError(""); }} /></div></div><label className="mt-5 block text-sm font-medium" htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea id="notes" className="mt-1" maxLength={500} placeholder="e.g. treatment area, special instructions" value={notes} onChange={(event) => { setNotes(event.target.value); setError(""); }} /></div>}
      {step === 2 && !isPublic && <div><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Who is coming?</h2><Button variant="outline" className="h-11" onClick={() => setShowNew((value) => !value)}><UserPlus /> New client</Button></div>{showNew && <div className="mt-4 grid items-end gap-2 border-b pb-4 sm:grid-cols-[1fr_1fr_1fr_auto]"><div><label className="block text-sm font-medium" htmlFor="new-client-first">First name <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="new-client-first" className="mt-1 h-11" maxLength={50} value={newClient.first} onChange={(event) => setNewClient({ ...newClient, first: event.target.value })} /></div><div><label className="block text-sm font-medium" htmlFor="new-client-name">Last name<RequiredMark /></label><Input id="new-client-name" className="mt-1 h-11" aria-required="true" maxLength={50} value={newClient.last} onChange={(event) => setNewClient({ ...newClient, last: event.target.value })} /></div><div><label className="block text-sm font-medium" htmlFor="new-client-phone">Phone<RequiredMark /></label><Input id="new-client-phone" className="mt-1 h-11" inputMode="tel" aria-required="true" value={newClient.phone} onChange={(event) => setNewClient({ ...newClient, phone: formatPhone(event.target.value) })} /></div><Button className="h-11" onClick={addNewClient}>Save</Button></div>}<Input className="mt-4 h-12 text-base" aria-label="Search clients" placeholder="Search by name or phone" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} /><div className="mt-3 grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">{pickable.map((client) => { const selected = clientIds.includes(client.id); return <Button key={client.id} variant={selected ? "secondary" : "outline"} className="h-auto min-h-14 justify-between whitespace-normal p-3 text-left" onClick={() => setClientIds((current) => selected ? current.filter((id) => id !== client.id) : [...current, client.id])}><span><span className="block font-medium">{client.name}</span><span className="block text-xs text-muted-foreground">{client.phone}</span></span>{selected && <Check />}</Button>; })}{pickable.length === 0 && <div className="border border-dashed p-4 text-center text-sm text-muted-foreground sm:col-span-2"><p>No clients match “{clientQuery.trim()}”.</p><Button variant="outline" className="mt-2 h-11" onClick={() => { setNewClient({ ...(/\d/.test(clientQuery) ? { first: "", last: "" } : splitName(clientQuery)), phone: /\d/.test(clientQuery) ? formatPhone(clientQuery) : "" }); setShowNew(true); }}><UserPlus /> Add as new client</Button></div>}</div><label className="mt-5 block text-sm font-medium" htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea id="notes" className="mt-1" maxLength={500} placeholder="e.g. treatment area, special instructions" value={notes} onChange={(event) => { setNotes(event.target.value); setError(""); }} /></div>}
      {step === 3 && <div><h2 className="font-serif text-xl">Ready to schedule</h2><dl className="mt-4 divide-y border-y"><Summary label="When" onEdit={() => setStep(1)} value={`${fromDateKey(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${time ? formatTime(time) : ""}`} /><Summary label="Duration" onEdit={() => setStep(0)} value={formatDuration(durationMin)} /><Summary label={isPublic ? "Client" : "Clients"} onEdit={() => setStep(2)} value={isPublic ? guestName : clientIds.map((id) => store.clients.find((client) => client.id === id)?.name).filter(Boolean).join(", ")} /></dl><p className="mt-5 text-sm text-muted-foreground">Appointments cancelled with less than 24 hours’ notice may still be charged.</p></div>}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </section>
    <div className="mt-5 flex justify-between"><Button variant="outline" className="h-11" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ArrowLeft /> Back</Button>{step < 3 ? <Button className="h-11" disabled={!canContinue} onClick={() => { if (step === 2) { const issue = notesIssue(notes); if (issue) { setError(issue); return; } } setError(""); setStep((current) => current + 1); }}>Continue <ArrowRight /></Button> : <Button className="h-11" onClick={finish}><Check /> {edit ? "Save changes" : "Confirm"}</Button>}</div>
    {confirmDialog}</main>;
}

function Summary({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) { return <div className="flex items-center justify-between gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="flex items-center gap-1 text-right font-medium">{value}<Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}><Pencil className="h-4 w-4" /></Button></dd></div>; }