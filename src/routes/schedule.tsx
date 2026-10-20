import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useToday } from "@/hooks/use-today";
import { CLIENT_PROGRESS, STATUS_CARD, StartEndControls, StatusBadge, StatusKey, StatusLabel } from "@/components/AppointmentControls";
import { ClientStatusActions } from "@/components/ClientStatusActions";
import { AppointmentSearchDialog } from "@/components/AppointmentSearchDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertTriangle, ChevronLeft, ChevronRight, CalendarCheck, CalendarPlus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { appointmentProgress, blockedSpan, formatDuration, formatTime, fromDateKey, timeToMinutes, toDateKey, type Appointment } from "@/lib/data";
import { useAvailability } from "@/lib/availability";
import { OUTSIDE_HOURS_CARD, useOutsideHours } from "@/lib/outside-hours";
import { availableTimes } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [
    { title: "Schedule | Electrolysis Scheduler" },
    { name: "description", content: "Review weekly and monthly electrolysis appointments." },
    { property: "og:title", content: "Schedule | Electrolysis Scheduler" },
    { property: "og:description", content: "Review weekly and monthly electrolysis appointments." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SchedulePage,
});

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() - next.getDay());
  next.setHours(12, 0, 0, 0);
  return next;
}

function clientNames(item: Appointment, clients: { id: string; name: string }[]) {
  return item.clients.map((entry) => clients.find((client) => client.id === entry.clientId)?.name).filter(Boolean).join(" & ");
}

function SchedulePage() {
  const { appointments, clients, blockedTimes, highlightId, setHighlightId } = useStore();
  const availability = useAvailability();
  const outside = useOutsideHours();
  const hoursOn = (key: string) => availability.overrides[key] ?? availability.weekly[fromDateKey(key).getDay()] ?? [];
  const todayKey = useToday();
  const [view, setView] = useState<"week" | "month">("week");
  const [cursor, setCursor] = useState(() => new Date());
  // When the day rolls over while the calendar is on "today", move it along to the new day.
  const [shownToday, setShownToday] = useState(todayKey);
  if (shownToday !== todayKey) {
    setShownToday(todayKey);
    if (toDateKey(cursor) === shownToday) setCursor(new Date());
  }
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [goOpen, setGoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!highlightId) return;
    const target = appointments.find((item) => item.id === highlightId);
    if (target) setCursor(fromDateKey(target.date));
    const scroll = window.setTimeout(() => document.querySelector(`[data-appointment="${highlightId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    const clear = window.setTimeout(() => setHighlightId(null), 6000);
    return () => { window.clearTimeout(scroll); window.clearTimeout(clear); };
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The soonest day with room for a minimum-length (15 minute) appointment, and a brief flash on it after jumping there.
  // Re-check every minute so "Next open" never points at a time that has already passed.
  const [minute, setMinute] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setMinute((value) => value + 1), 60000); return () => window.clearInterval(timer); }, []);
  const next = useMemo(() => {
    for (let offset = 0; offset < 180; offset++) {
      const day = new Date(); day.setHours(12, 0, 0, 0); day.setDate(day.getDate() + offset);
      const key = toDateKey(day);
      const times = availableTimes(key, 15, appointments, blockedTimes);
      if (times[0]) return { key, time: times[0] };
    }
    return null;
  }, [appointments, blockedTimes, availability, todayKey, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const [flashKey, setFlashKey] = useState<string | null>(null);
  useEffect(() => {
    if (!flashKey) return;
    const clear = window.setTimeout(() => setFlashKey(null), 6000);
    return () => window.clearTimeout(clear);
  }, [flashKey]);
  function showNext() {
    if (!next) return;
    setCursor(fromDateKey(next.key));
    setFlashKey(next.key);
  }
  const current = selected ? appointments.find((item) => item.id === selected.id) ?? selected : null;

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [cursor]);

  function move(direction: number) {
    const next = new Date(cursor);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setCursor(next);
  }

  const title = view === "week"
    ? `${weekDays[0]?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[6]?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Calendar</p>
            <h1 className="mt-1 font-serif text-3xl">Schedule</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11" onClick={() => setSearchOpen(true)}><Search className="opacity-60" /> Search appointment</Button>
            <Button variant="outline" className="h-11" disabled={!next} onClick={showNext} title="Jump to the next open time"><CalendarCheck className="opacity-60" /> {next ? `Next open: ${fromDateKey(next.key).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${formatTime(next.time)}` : "No openings soon"}</Button>
            <Button asChild className="h-11"><Link to="/book" search={{ edit: undefined }}><CalendarPlus /> New appointment</Link></Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-2 shadow-sm">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-lg" onClick={() => move(-1)} aria-label={`Previous ${view}`}><ChevronLeft /></Button>
            <div className="flex rounded-lg bg-muted p-1">
              <Button variant={toDateKey(cursor) === todayKey ? "secondary" : "ghost"} className="h-10 rounded-md px-4 shadow-sm" onClick={() => setCursor(new Date())}>Today</Button>
              <Popover open={goOpen} onOpenChange={setGoOpen}>
                <PopoverTrigger asChild><Button variant={toDateKey(cursor) !== todayKey ? "secondary" : "ghost"} className="h-10 rounded-md px-4 shadow-sm">Go to date</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={cursor} defaultMonth={cursor} onSelect={(day) => { if (day) { const next = new Date(day); next.setHours(12, 0, 0, 0); setCursor(next); setGoOpen(false); } }} className="pointer-events-auto p-3" /></PopoverContent>
              </Popover>
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-lg" onClick={() => move(1)} aria-label={`Next ${view}`}><ChevronRight /></Button>
          </div>
          <h2 className="order-last w-full text-center font-serif text-xl leading-none sm:order-none sm:w-auto">{title}</h2>
          <div className="flex rounded-lg bg-muted p-1">
            {(["week", "month"] as const).map((mode) => <Button key={mode} variant={view === mode ? "secondary" : "ghost"} className="h-10 rounded-md capitalize shadow-sm" onClick={() => setView(mode)}>{mode}</Button>)}
          </div>
        </div>
        <StatusKey className="-mt-3 px-1" />
      </header>

      {view === "week" ? (
        <div className="overflow-x-auto"><div className="grid min-w-[620px] grid-cols-7 overflow-hidden border bg-background">
          {weekDays.map((day) => {
            const key = toDateKey(day);
            const dayAppointments = appointments.filter((item) => item.date === key).sort((a, b) => a.time.localeCompare(b.time));
            const dayBlocks = blockedTimes.filter((item) => item.date === key);
            const today = key === todayKey;
            const past = key < todayKey;
            const closed = hoursOn(key).length === 0;
            const flashing = key === flashKey;
            return <div key={key} className={`flex min-h-[460px] flex-col border-r last:border-r-0 ${flashing ? "animate-pulse bg-primary/10 ring-2 ring-inset ring-primary" : ""} ${past ? "bg-muted/40" : closed ? "bg-[repeating-linear-gradient(135deg,transparent_0,transparent_8px,var(--color-muted)_8px,var(--color-muted)_10px)]" : ""}`}>
              <div className={`border-b px-1 py-1.5 text-center ${today ? "bg-primary text-primary-foreground" : past ? "bg-muted text-muted-foreground" : "bg-muted/40"}`}><p className="text-[11px] font-medium uppercase leading-none tracking-tight">{day.toLocaleDateString("en-US", { weekday: "short" })}</p><p className="mt-1 text-base font-semibold leading-none">{day.getDate()}</p></div>
              <div className={`space-y-2 p-2 ${past ? "opacity-75" : ""}`}>
                {dayAppointments.map((item) => <Button key={item.id} data-appointment={item.id} variant="outline" className={`h-auto w-full items-start justify-start whitespace-normal p-2 text-left transition-shadow ${STATUS_CARD[appointmentProgress(item)]} ${outside.ids.has(item.id) ? OUTSIDE_HOURS_CARD : ""} ${item.id === highlightId ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-2" : ""}`} onClick={() => setSelected(item)}><span className="w-full"><span className="block font-semibold">{formatTime(item.time)}</span>{outside.ids.has(item.id) && <span className="mb-1 flex items-start gap-0.5 text-[10px] font-semibold leading-tight text-amber-900"><AlertTriangle className="h-3 w-3 shrink-0" />Reschedule</span>}<span className="block text-xs text-muted-foreground">{clientNames(item, clients)}</span><span className="block text-xs text-muted-foreground">{formatDuration(item.durationMin)}</span></span></Button>)}
                {dayBlocks.map((item) => <div key={item.id} className="border border-dashed bg-muted/50 p-2 text-xs text-muted-foreground">{blockedSpan(item)}<br />{item.reason}</div>)}
                {flashing && next && <p className="rounded-md bg-primary px-2 py-1 text-center text-xs font-medium text-primary-foreground">Next open {formatTime(next.time)}</p>}
                {!dayAppointments.length && !dayBlocks.length && <p className="pt-5 text-center text-xs text-muted-foreground">{closed ? "Closed" : "No appointments"}</p>}
              </div>
            </div>;
          })}
        </div></div>
      ) : <MonthGrid cursor={cursor} appointments={appointments} clients={clients} onSelect={setSelected} highlightId={highlightId} todayKey={todayKey} hoursOn={hoursOn} outsideIds={outside.ids} flashKey={flashKey} />}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>{current && <>
          <DialogHeader><DialogTitle>{clientNames(current, clients)}</DialogTitle><DialogDescription>{fromDateKey(current.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {formatTime(current.time)} · {formatDuration(current.durationMin)}</DialogDescription></DialogHeader>
          {outside.ids.has(current.id) && <p className="flex items-start gap-2 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="font-semibold">Needs rescheduling.</span> Your hours changed and this booking is now outside them. Reschedule it or cancel it.</span></p>}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3"><StatusLabel progress={appointmentProgress(current)} /><StartEndControls item={current} /></div>
          <div className="space-y-3">{current.clients.map((entry) => {
            return <div key={entry.clientId} className="border-b pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span>{clients.find((client) => client.id === entry.clientId)?.name}</span><div className="flex items-center gap-3"><StatusLabel progress={entry.startedAt && !entry.endedAt ? (entry.pausedAt ? "paused" : "in_progress") : CLIENT_PROGRESS[entry.status]} /><ClientStatusActions item={current} clientId={entry.clientId} /></div></div>
            </div>;
          })}</div>
          {current.notes && <p className="text-sm text-muted-foreground">{current.notes}</p>}
          {appointmentProgress(current) === "scheduled" && <DialogFooter><Button asChild variant={outside.ids.has(current.id) ? "default" : "outline"} className="h-11"><Link to="/book" search={{ edit: current.id }}>Reschedule</Link></Button></DialogFooter>}
        </>}</DialogContent>
      </Dialog>
      <AppointmentSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onPick={(item) => { setSearchOpen(false); setCursor(fromDateKey(item.date)); setHighlightId(item.id); setSelected(item); }} />
      </div>
    </main>
  );
}

function MonthGrid({ cursor, appointments, clients, onSelect, highlightId, todayKey, hoursOn, outsideIds, flashKey }: { cursor: Date; appointments: Appointment[]; clients: { id: string; name: string }[]; onSelect: (item: Appointment) => void; highlightId: string | null; todayKey: string; hoursOn: (key: string) => { start: string; end: string }[]; outsideIds: Set<string>; flashKey: string | null }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day; });
  return <div className="grid grid-cols-7 overflow-hidden border">
    {days.slice(0, 7).map((day) => <div key={day.getDay()} className="border-b border-r bg-muted/40 px-1 py-1 text-center text-[11px] font-medium uppercase leading-none tracking-tight last:border-r-0">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>)}
    {days.map((day) => { const key = toDateKey(day); const entries = appointments.filter((item) => item.date === key); const muted = day.getMonth() !== cursor.getMonth() || key < todayKey; const closed = hoursOn(key).length === 0; return <div key={key} className={`min-h-[112px] border-b border-r p-1 last:border-r-0 ${muted ? "bg-muted/30 text-muted-foreground" : ""} ${key === todayKey ? "ring-2 ring-inset ring-primary" : ""} ${key === flashKey ? "animate-pulse bg-primary/10 ring-2 ring-inset ring-primary" : ""}`}><div className="flex items-baseline justify-between p-1 text-sm font-medium">{day.getDate()}{closed && <span className="text-[10px] font-normal text-muted-foreground">Closed</span>}</div>{entries.slice(0, 3).map((item) => <Button key={item.id} data-appointment={item.id} variant="ghost" className={`h-auto w-full justify-start overflow-hidden rounded-sm px-1 py-1 text-xs ${STATUS_CARD[appointmentProgress(item)]} ${outsideIds.has(item.id) ? OUTSIDE_HOURS_CARD : ""} ${item.id === highlightId ? "bg-primary/15 ring-2 ring-primary" : ""}`} onClick={() => onSelect(item)} title={outsideIds.has(item.id) ? "Outside business hours — needs rescheduling" : undefined}>{outsideIds.has(item.id) ? <AlertTriangle className="shrink-0 text-amber-700" /> : <UserRound className="shrink-0" />} <span className="truncate">{formatTime(item.time)} {clientNames(item, clients)}</span></Button>)}{entries.length > 3 && <p className="px-1 text-xs text-muted-foreground">+{entries.length - 3} more</p>}</div>; })}
  </div>;
}
