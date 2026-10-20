import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { RequiredMark } from "@/components/RequiredMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration, formatPhone, formatTime, fromDateKey, splitName, toDateKey, type Appointment, type Client } from "@/lib/data";
import { useStore } from "@/lib/store";

/** The public screen returns to the start after this long without a tap, so one client's bookings are never left showing. */
const IDLE_MS = 2 * 60_000;
/** Wrong lookups allowed before a short wait, so a stranger can't guess phone numbers. */
const LOOKUP_TRIES = 5;
const LOOKUP_WAIT_MS = 60_000;
let failedLookups = 0;
let lookupBlockedUntil = 0;

const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
const STATUS_LABEL = { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" } as const;

/**
 * "Find my appointments": the client types their last name and full phone number (first name is optional, as when booking).
 * Only a record matching both is revealed; nothing is listed or hinted at otherwise.
 */
export function FindAppointmentsForm({ onFound, onBack }: { onFound: (clientIds: string[]) => void; onBack: () => void }) {
  const { clients } = useStore();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const digits = phone.replace(/\D/g, "");
  const valid = last.trim().length > 0 && digits.length === 10;

  function find() {
    if (Date.now() < lookupBlockedUntil) { setError("Too many tries. Please wait a minute, or ask the practitioner."); return; }
    const matches = clients.filter((client: Client) => {
      const name = splitName(client.name);
      return client.phone.replace(/\D/g, "") === digits && same(name.last, last) && (!first.trim() || same(name.first, first));
    });
    if (!matches.length) {
      failedLookups += 1;
      if (failedLookups >= LOOKUP_TRIES) { failedLookups = 0; lookupBlockedUntil = Date.now() + LOOKUP_WAIT_MS; }
      setError("We couldn't find an appointment with those details. Check the spelling and phone number.");
      return;
    }
    failedLookups = 0;
    onFound(matches.map((client) => client.id));
  }

  return <main className="mx-auto max-w-xl px-4 py-10">
    <h1 className="font-serif text-3xl">Find my appointments</h1>
    <p className="mt-2 text-muted-foreground">Enter your name and phone number exactly as you gave them when booking.</p>
    <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (valid) find(); }}>
      <div><label className="block text-sm font-medium" htmlFor="find-first">First name <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="find-first" className="mt-1 h-12" autoComplete="off" maxLength={50} value={first} onChange={(event) => { setFirst(event.target.value); setError(""); }} /></div>
      <div><label className="block text-sm font-medium" htmlFor="find-last">Last name<RequiredMark /></label><Input id="find-last" className="mt-1 h-12" autoComplete="off" maxLength={50} aria-required="true" value={last} onChange={(event) => { setLast(event.target.value); setError(""); }} /></div>
      <div className="sm:col-span-2"><label className="block text-sm font-medium" htmlFor="find-phone">Phone<RequiredMark /></label><Input id="find-phone" className="mt-1 h-12" inputMode="tel" autoComplete="off" aria-required="true" placeholder="(555) 555-5555" value={phone} onChange={(event) => { setPhone(formatPhone(event.target.value)); setError(""); }} /></div>
      {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
      <div className="mt-2 flex justify-between sm:col-span-2">
        <Button type="button" variant="outline" className="h-11" onClick={onBack}><ArrowLeft /> Back</Button>
        <Button type="submit" className="h-11" disabled={!valid}><Search /> Find</Button>
      </div>
    </form>
  </main>;
}

const longDay = (key: string) => fromDateKey(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/**
 * A read-only month calendar of ONE client's own appointments, with the same list underneath. Other clients' bookings
 * (and anyone else on a shared appointment) are never shown. `highlightId` marks the booking just made.
 */
export function ClientCalendar({ clientIds, highlightId, onExit }: { clientIds: string[]; highlightId?: string | undefined; onExit: () => void }) {
  const { appointments } = useStore();
  const mine = useMemo(() => appointments
    .filter((item) => item.clients.some((entry) => clientIds.includes(entry.clientId)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [appointments, clientIds]);
  const focus = mine.find((item) => item.id === highlightId) ?? mine.find((item) => item.date >= toDateKey(new Date())) ?? mine[mine.length - 1];
  const [month, setMonth] = useState(() => { const day = focus ? fromDateKey(focus.date) : new Date(); day.setDate(1); return day; });
  const [tick, setTick] = useState(0);

  // Back to the start screen after a couple of minutes without a tap or key press.
  useEffect(() => {
    const timer = window.setTimeout(onExit, IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [tick, onExit]);

  const statusOf = (item: Appointment) => {
    const entry = item.clients.find((client) => clientIds.includes(client.clientId));
    return entry ? STATUS_LABEL[entry.status] : "";
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day; });
  const todayKey = toDateKey(new Date());
  const upcoming = mine.filter((item) => item.date >= todayKey && statusOf(item) === "Scheduled");
  const earlier = mine.filter((item) => !upcoming.includes(item)).reverse();
  const row = (item: Appointment) => <li key={item.id} className={`flex flex-wrap items-center justify-between gap-2 py-3 ${item.id === highlightId ? "font-semibold" : ""}`}>
    <span>{longDay(item.date)} at {formatTime(item.time)}</span>
    <span className="text-sm text-muted-foreground">{formatDuration(item.durationMin)} · {statusOf(item)}</span>
  </li>;

  return <main className="mx-auto max-w-3xl px-4 py-8" onPointerDown={() => setTick((value) => value + 1)} onKeyDown={() => setTick((value) => value + 1)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-3xl">Your appointments</h1>
      <Button className="h-11" onClick={onExit}><ArrowLeft /> Done</Button>
    </div>
    <div className="mt-6 flex items-center justify-between rounded-xl border bg-card p-2">
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button>
      <h2 className="font-serif text-xl">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button>
    </div>
    <div className="mt-3 grid grid-cols-7 overflow-hidden border">
      {days.slice(0, 7).map((day) => <div key={day.getDay()} className="border-b border-r bg-muted/40 px-1 py-1 text-center text-[11px] font-medium uppercase last:border-r-0">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>)}
      {days.map((day) => {
        const key = toDateKey(day);
        const entries = mine.filter((item) => item.date === key);
        const outside = day.getMonth() !== month.getMonth();
        return <div key={key} className={`min-h-[76px] border-b border-r p-1 last:border-r-0 ${outside ? "bg-muted/30 text-muted-foreground" : ""} ${key === todayKey ? "ring-2 ring-inset ring-primary" : ""}`}>
          <div className="px-1 text-sm font-medium">{day.getDate()}</div>
          {entries.map((item) => <div key={item.id} className={`mt-1 rounded-sm px-1 py-0.5 text-xs ${item.id === highlightId ? "animate-pulse bg-primary text-primary-foreground" : "bg-primary/15"}`}>{formatTime(item.time)}</div>)}
        </div>;
      })}
    </div>
    {mine.length === 0 && <p className="mt-6 text-center text-muted-foreground">No appointments found.</p>}
    {upcoming.length > 0 && <><h2 className="mt-8 font-serif text-xl">Upcoming</h2><ul className="mt-2 divide-y border-y">{upcoming.map(row)}</ul></>}
    {earlier.length > 0 && <><h2 className="mt-8 font-serif text-xl">Previous</h2><ul className="mt-2 divide-y border-y">{earlier.map(row)}</ul></>}
  </main>;
}
