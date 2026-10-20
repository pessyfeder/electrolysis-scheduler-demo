import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarPlus, Clock3, HardDriveDownload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appointmentProgress, formatDuration, formatTime, fromDateKey } from "@/lib/data";
import { useToday } from "@/hooks/use-today";
import { hoursWereDamaged, useAvailability } from "@/lib/availability";
import { OUTSIDE_HOURS_BADGE, useOutsideHours } from "@/lib/outside-hours";
import { useStore } from "@/lib/store";
import { STATUS_CARD, StartEndControls, StatusKey } from "@/components/AppointmentControls";
import { ClientStatusActions } from "@/components/ClientStatusActions";
import { BACKUP_REMINDER_DAYS, daysSinceBackup, readLastBackup } from "@/lib/backup";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Today | Electrolysis Scheduler" },
    { name: "description", content: "Today's appointments and studio totals." },
    { property: "og:title", content: "Today | Electrolysis Scheduler" },
    { property: "og:description", content: "Today's appointments and studio totals." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TodayPage,
});

function TodayPage() {
  const { appointments, clients, payments, ready } = useStore();
  const outside = useOutsideHours();
  const today = useToday();
  const entries = appointments.filter((item) => item.date === today && item.clients.some((client) => client.status !== "cancelled")).sort((a, b) => a.time.localeCompare(b.time));
  const label = fromDateKey(today).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return <main className="mx-auto max-w-6xl px-4 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><h1 className="mt-1 font-serif text-3xl">Today</h1></div><Button asChild className="h-11"><Link to="/book" search={{ edit: undefined }}><CalendarPlus /> New appointment</Link></Button></div>
    {ready && <HoursDamagedNotice />}
    {ready && outside.list.length > 0 && <RescheduleNotice />}
    {ready && (clients.length > 0 || appointments.length > 0 || payments.length > 0) && <BackupReminder />}
    <div className="mt-7 grid gap-3 sm:grid-cols-2"><Stat icon={<Clock3 />} label="Appointments" value={String(entries.length)} /><Stat icon={<Users />} label="Clients today" value={String(entries.flatMap((item) => item.clients).filter((entry) => entry.status !== "cancelled").length)} /></div>
    <section className="mt-9"><div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2"><h2 className="font-serif text-2xl">Today’s appointments</h2><StatusKey /></div>{entries.length === 0 ? <p className="mt-4 border border-dashed p-8 text-center text-muted-foreground">No appointments today.</p> : <ul className="mt-4 space-y-2">{entries.map((item) => <li key={item.id} className={`flex flex-wrap items-center gap-4 border px-4 py-4 ${STATUS_CARD[appointmentProgress(item)]}`}><div className="w-28"><p className="font-semibold">{formatTime(item.time)}</p>{outside.ids.has(item.id) && <span className={`mt-1 ${OUTSIDE_HOURS_BADGE}`}><AlertTriangle className="h-3 w-3" /> Reschedule</span>}<p className="text-xs text-muted-foreground">{formatDuration(item.durationMin)}</p></div><div className="min-w-48 flex-1"><p className="font-medium">{item.clients.map((entry) => clients.find((client) => client.id === entry.clientId)?.name).filter(Boolean).join(" & ")}</p>{item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}</div><div className="flex flex-wrap items-center gap-2"><StartEndControls item={item} />{item.clients.map((entry) => <ClientStatusActions key={entry.clientId} item={item} clientId={entry.clientId} showName={item.clients.length > 1} />)}</div></li>)}</ul>}</section>
  </main>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div><p className="mt-2 font-serif text-3xl">{value}</p></div>; }

/** Nudges the practitioner to save a backup when there has never been one, or the last is over a week old. */
function BackupReminder() {
  const [days, setDays] = useState<number | null | undefined>(undefined);
  useEffect(() => setDays(daysSinceBackup(readLastBackup(window.localStorage))), []);
  if (days === undefined || (days !== null && days < BACKUP_REMINDER_DAYS)) return null;
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-noshow/40 bg-status-noshow/10 p-4">
    <p className="flex items-center gap-2 text-sm"><HardDriveDownload className="h-5 w-5 shrink-0" />{days === null ? "You haven't backed up your records yet." : `Your last backup was ${days} days ago.`} Your records live only on this tablet.</p>
    <Button asChild className="h-11" variant="outline"><Link to="/backup">Back up now</Link></Button>
  </div>;
}

/** Shown when the saved working hours couldn't be read, so the standard hours are being used instead. */
function HoursDamagedNotice() {
  useAvailability(); // re-check after the hours are saved again
  if (!hoursWereDamaged()) return null;
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500 bg-amber-50 p-4 text-amber-950">
    <p className="flex items-center gap-2 text-sm"><AlertTriangle className="h-5 w-5 shrink-0" />Your saved working hours couldn't be read, so the standard hours are being used. Check them and save, or restore a backup.</p>
    <Button asChild className="h-11" variant="outline"><Link to="/availability">Edit Hours</Link></Button>
  </div>;
}

/** Lists upcoming bookings left outside the working hours after the hours changed; each opens on the Schedule. */
function RescheduleNotice() {
  const { clients, setHighlightId } = useStore();
  const { list } = useOutsideHours();
  const names = (item: (typeof list)[number]) => item.clients.filter((c) => c.status === "scheduled").map((c) => clients.find((client) => client.id === c.clientId)?.name ?? "Client").join(" & ");
  return <section className="mt-6 rounded-xl border border-amber-500 bg-amber-50 p-4 text-amber-950">
    <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 shrink-0" />{list.length === 1 ? "1 booked appointment is outside your business hours and needs rescheduling" : `${list.length} booked appointments are outside your business hours and need rescheduling`}</p>
    <ul className="mt-3 flex flex-col gap-2">{list.slice(0, 6).map((item) => <li key={item.id}>
      <Button asChild variant="outline" className="h-auto min-h-11 w-full justify-between whitespace-normal border-amber-400 bg-white text-left"><Link to="/schedule" onClick={() => setHighlightId(item.id)}><span><span className="font-medium">{fromDateKey(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {formatTime(item.time)}</span> <span className="text-muted-foreground">· {names(item)}</span></span><span className="text-sm font-medium">Open</span></Link></Button>
    </li>)}</ul>
    {list.length > 6 && <p className="mt-2 text-sm">and {list.length - 6} more — they're marked on the Schedule.</p>}
  </section>;
}
