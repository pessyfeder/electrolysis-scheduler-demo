import { useEffect, useState } from "react";
import { useToday } from "@/hooks/use-today";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CalendarOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/RequiredMark";
import { blocksIssue, setAvailability, sortBlocks, useAvailability, type Availability } from "@/lib/availability";
import { ALL_DAY, blockedSpan, formatTime, fromDateKey, toDateKey, type BusinessBlock } from "@/lib/data";
import { useConfirm } from "@/components/ConfirmDialog";
import { appointmentsOutsideHours, blockedTimeIssue } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/availability")({
  head: () => ({ meta: [
    { title: "Hours & Availability | Electrolysis Scheduler" },
    { name: "description", content: "Set weekly working hours, change hours for a specific date, and block out time." },
    { property: "og:title", content: "Hours & Availability | Electrolysis Scheduler" },
    { property: "og:description", content: "Set weekly working hours, change hours for a specific date, and block out time." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AvailabilityPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function RangeEditor({ blocks, onChange }: { blocks: BusinessBlock[]; onChange: (next: BusinessBlock[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {blocks.length === 0 && <p className="py-2 text-sm text-muted-foreground">Closed</p>}
      {blocks.map((block, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input type="time" aria-label="Start time" className="w-36" value={block.start} onChange={(e) => onChange(blocks.map((b, i) => i === index ? { ...b, start: e.target.value } : b))} />
          <span className="text-muted-foreground">to</span>
          <Input type="time" aria-label="End time" className="w-36" value={block.end} onChange={(e) => onChange(blocks.map((b, i) => i === index ? { ...b, end: e.target.value } : b))} />
          <Button variant="ghost" size="icon" aria-label="Remove time range" onClick={() => onChange(blocks.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>
      ))}
      <div><Button variant="outline" onClick={() => onChange([...blocks, { start: "10:00", end: "13:00" }])}><Plus /> Add hours</Button></div>
    </div>
  );
}

function AvailabilityPage() {
  const availability = useAvailability();
  const { appointments, clients, blockedTimes, addBlockedTime, removeBlockedTime } = useStore();
  const { confirm, dialog } = useConfirm();
  const [weekly, setWeekly] = useState(availability.weekly);
  const [weeklyMsg, setWeeklyMsg] = useState<{ error?: string; ok?: string }>({});
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [date, setDate] = useState(toDateKey(new Date()));
  const [dateBlocks, setDateBlocks] = useState<BusinessBlock[]>([]);
  const [dateMsg, setDateMsg] = useState<{ error?: string; ok?: string }>({});
  const [block, setBlock] = useState({ date: toDateKey(new Date()), startTime: "10:30", endTime: "11:30", reason: "" });
  const [blockMsg, setBlockMsg] = useState<{ error?: string; ok?: string }>({});
  const [blockAllDay, setBlockAllDay] = useState(false);

  useEffect(() => setWeekly(availability.weekly), [availability.weekly]);
  useEffect(() => {
    setDateBlocks(availability.overrides[date] ?? availability.weekly[fromDateKey(date).getDay()] ?? []);
  }, [date, availability]);

  const longDate = (key: string) => fromDateKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  /** Every change on this page asks "Are you sure?" before it is saved. */
  function sure(description: string, confirmLabel: string) {
    return confirm({ title: "Are you sure?", description, confirmLabel, cancelLabel: "Go back" });
  }

  /** Hours as they would be after a change, so bookings that no longer fit can be listed before saving. */
  function hoursWith(weeklyNext: Availability["weekly"], overridesNext: Availability["overrides"]) {
    return (key: string) => overridesNext[key] ?? weeklyNext[fromDateKey(key).getDay()] ?? [];
  }

  /** Warning sentence naming the upcoming bookings that fall outside the proposed hours (empty when none). */
  function outsideWarning(hoursFor: (key: string) => BusinessBlock[]) {
    const list = appointmentsOutsideHours(appointments, hoursFor);
    if (!list.length) return { text: "", count: 0 };
    const shown = list.slice(0, 5).map((item) => {
      const names = item.clients.filter((c) => c.status === "scheduled").map((c) => clients.find((client) => client.id === c.clientId)?.name ?? "Client").join(" & ");
      return `${fromDateKey(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${formatTime(item.time)} (${names})`;
    }).join("; ");
    const more = list.length > 5 ? `; and ${list.length - 5} more` : "";
    const many = list.length === 1 ? "1 booked appointment falls" : `${list.length} booked appointments fall`;
    return { text: ` Warning: ${many} outside these hours: ${shown}${more}. They stay booked — reschedule or cancel them if needed.`, count: list.length };
  }

  const keptNote = (count: number) => count ? ` ${count} booked appointment${count === 1 ? " is" : "s are"} now outside your hours — check the Schedule.` : "";

  async function saveWeekly() {
    for (let d = 0; d < 7; d++) {
      const issue = blocksIssue(weekly[d] ?? []);
      if (issue) return setWeeklyMsg({ error: `${DAYS[d]}: ${issue}` });
    }
    const sorted = Object.fromEntries(Object.entries(weekly).map(([d, b]) => [d, sortBlocks(b)]));
    const warning = outsideWarning(hoursWith(sorted, availability.overrides));
    if (!(await sure(`Save the new weekly hours? Booking will only offer times inside them.${warning.text}`, warning.count ? "Save anyway" : "Save weekly hours"))) return;
    setAvailability({ ...availability, weekly: sorted });
    setWeeklyOpen(false);
    setWeeklyMsg({ ok: `Weekly hours saved.${keptNote(warning.count)}` });
  }

  /** Weekly hours are edited in a popup that always starts from the saved hours. */
  function openWeekly(open: boolean) {
    setWeekly(availability.weekly);
    setWeeklyMsg({});
    setWeeklyOpen(open);
  }

  async function saveDate(closed: boolean) {
    const blocks = closed ? [] : dateBlocks;
    const issue = blocksIssue(blocks);
    if (issue) return setDateMsg({ error: issue });
    const overrides = { ...availability.overrides, [date]: sortBlocks(blocks) };
    const warning = outsideWarning(hoursWith(availability.weekly, overrides));
    if (!(await sure(`${closed ? `Mark ${longDate(date)} as closed?` : `Save these hours for ${longDate(date)} only?`}${warning.text}`, warning.count ? "Save anyway" : closed ? "Mark closed" : "Save hours"))) return;
    setAvailability({ ...availability, overrides });
    setDateMsg({ ok: `${closed ? "Marked closed." : "Hours saved for this date."}${keptNote(warning.count)}` });
  }

  async function clearDate(key: string) {
    const { [key]: _removed, ...rest } = availability.overrides;
    const warning = outsideWarning(hoursWith(availability.weekly, rest));
    if (!(await sure(`Use the regular weekly hours again on ${longDate(key)}?${warning.text}`, warning.count ? "Save anyway" : "Use weekly hours"))) return;
    setAvailability({ ...availability, overrides: rest });
    setDateMsg({ ok: `Weekly hours restored for that date.${keptNote(warning.count)}` });
  }

  async function removeBlock(id: string) {
    if (!(await sure("Remove this blocked time? Appointments can be booked then again.", "Remove block"))) return;
    removeBlockedTime(id);
    setBlockMsg({ ok: "Blocked time removed." });
  }

  async function saveBlock() {
    const toSave = blockAllDay ? { ...block, ...ALL_DAY } : block;
    const issue = blockedTimeIssue(toSave, appointments);
    if (issue) return setBlockMsg({ error: issue });
    if (!(await sure(blockAllDay ? `Block all of ${longDate(block.date)}? No appointments can be booked that day.` : `Block ${longDate(block.date)}, ${formatTime(block.startTime)}–${formatTime(block.endTime)}? No appointments can be booked then.`, blockAllDay ? "Block day" : "Block time"))) return;
    addBlockedTime({ ...toSave, reason: toSave.reason.trim() });
    setBlock({ ...block, reason: "" });
    setBlockMsg({ ok: "Time blocked." });
  }

  const today = useToday();
  const overrides = Object.entries(availability.overrides).filter(([k]) => k >= today).sort(([a], [b]) => a.localeCompare(b));
  const blocks = [...blockedTimes].filter((b) => b.date >= today).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const msg = (m: { error?: string; ok?: string }) => m.error ? <p className="text-sm text-destructive">{m.error}</p> : m.ok ? <p className="text-sm text-muted-foreground">{m.ok}</p> : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Availability</p>
          <h1 className="font-serif text-4xl">Hours</h1>
          <p className="mt-1 text-sm text-muted-foreground">Booking only offers times inside these hours. Existing appointments are not moved.</p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => openWeekly(true)}><CalendarClock /> Change weekly hours</Button>
      </header>
      {!weeklyOpen && weeklyMsg.ok && <div className="mb-6">{msg(weeklyMsg)}</div>}

      <Dialog open={weeklyOpen} onOpenChange={openWeekly}>
        <DialogContent className="flex max-h-[90vh] max-w-xl flex-col">
          <DialogHeader>
            <DialogTitle>Weekly hours</DialogTitle>
            <DialogDescription>Changes the regular hours for every week. Dates with their own hours keep them.</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex flex-col divide-y divide-border overflow-y-auto px-1">
            {DAYS.map((name, d) => (
              <div key={name} className="grid gap-2 py-3 sm:grid-cols-[110px_1fr]">
                <span className="pt-3 font-medium">{name}</span>
                <RangeEditor blocks={weekly[d] ?? []} onChange={(next) => { setWeeklyMsg({}); setWeekly({ ...weekly, [d]: next }); }} />
              </div>
            ))}
          </div>
          {weeklyMsg.error && msg(weeklyMsg)}
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="h-11" onClick={() => openWeekly(false)}>Cancel</Button>
            <Button className="h-11" onClick={saveWeekly}>Save weekly hours</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <div className="flex max-w-3xl flex-col gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-1 text-lg font-semibold">Change hours for one date</h2>
            <p className="mb-4 text-sm text-muted-foreground">Add extra hours, shorten a day, or close it — only for that date.</p>
            <div className="mb-3 flex flex-col gap-1.5">
              <Label htmlFor="override-date">Date<RequiredMark /></Label>
              <Input id="override-date" type="date" className="w-48" value={date} onChange={(e) => { setDateMsg({}); setDate(e.target.value); }} />
            </div>
            <RangeEditor blocks={dateBlocks} onChange={(next) => { setDateMsg({}); setDateBlocks(next); }} />
            <div className="mt-4 flex flex-col gap-3">
              {msg(dateMsg)}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveDate(false)}>Save for this date</Button>
                <Button variant="outline" onClick={() => saveDate(true)}><CalendarOff /> Closed this day</Button>
              </div>
            </div>
            {overrides.length > 0 && (
              <ul className="mt-5 flex flex-col divide-y divide-border border-t border-border">
                {overrides.map(([key, list]) => (
                  <li key={key} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-medium">{longDate(key)}</span> · {list.length ? list.map((b) => `${formatTime(b.start)}–${formatTime(b.end)}`).join(", ") : "Closed"}</span>
                    <Button variant="ghost" onClick={() => clearDate(key)}>Use weekly hours</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-lg font-semibold">Block out time</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor="b-date">Date<RequiredMark /></Label><Input id="b-date" type="date" min={today} value={block.date} onChange={(e) => { setBlockMsg({}); setBlock({ ...block, date: e.target.value }); }} /></div>
              {!blockAllDay && <><div className="flex flex-col gap-1.5"><Label htmlFor="b-start">From<RequiredMark /></Label><Input id="b-start" type="time" value={block.startTime} onChange={(e) => setBlock({ ...block, startTime: e.target.value })} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="b-end">To<RequiredMark /></Label><Input id="b-end" type="time" value={block.endTime} onChange={(e) => setBlock({ ...block, endTime: e.target.value })} /></div></>}
            </div>
            <label className="mt-3 flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm font-medium"><Checkbox className="h-5 w-5" checked={blockAllDay} onCheckedChange={(checked) => { setBlockMsg({}); setBlockAllDay(checked === true); }} />Block entire day</label>
            <div className="mt-3 flex flex-col gap-1.5"><Label htmlFor="b-reason">Reason<RequiredMark /></Label><Input id="b-reason" value={block.reason} maxLength={200} placeholder="e.g. Doctor appointment" onChange={(e) => setBlock({ ...block, reason: e.target.value })} /></div>
            <div className="mt-4 flex flex-col gap-3">
              {msg(blockMsg)}
              <div><Button onClick={saveBlock}>{blockAllDay ? "Block day" : "Block time"}</Button></div>
            </div>
            {blocks.length > 0 && (
              <ul className="mt-5 flex flex-col divide-y divide-border border-t border-border">
                {blocks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-medium">{longDate(b.date)}</span> · {blockedSpan(b)} · {b.reason}</span>
                    <Button variant="ghost" size="icon" aria-label={`Remove blocked time on ${longDate(b.date)}`} onClick={() => removeBlock(b.id)}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      {dialog}
    </main>
  );
}
