import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToday } from "@/hooks/use-today";
import { useAvailability } from "@/lib/availability";
import { effectiveHours, formatDuration, formatTime, fromDateKey, minutesToTime, timeToMinutes, toDateKey } from "@/lib/data";
import { availableTimes } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

/** How far ahead the month arrows go. */
const MONTHS_AHEAD = 12;

const monthStart = (key: string) => { const day = fromDateKey(key); day.setDate(1); return day; };

/**
 * The 24-hour start times a typed time could mean: "7:30 pm" → 19:30, "1930" → 19:30, "7:30" or "7" → both
 * the morning and evening time. Null when it isn't a time.
 */
export function parseTimeQuery(query: string): string[] | null {
  const match = /^(\d{1,2})(?::?(\d{2}))?(a|p)?m?$/.exec(query.toLowerCase().replace(/[\s.]/g, ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const half = match[3];
  if (minute > 59 || hour > 23 || (half && (hour < 1 || hour > 12))) return null;
  const pad = (value: number) => `${String(value).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (half) return [pad((hour % 12) + (half === "p" ? 12 : 0))];
  if (hour === 0 || hour > 12) return [pad(hour)];
  return [pad(hour % 12), pad((hour % 12) + 12)];
}

const longDay = (key: string) => fromDateKey(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/**
 * The booking's Date & time step. Choose date: a month calendar where days with an opening for this length
 * have a dot. "Check for specific time availability" narrows the dots to days with a typed start time open.
 * Then pick from the day's open times.
 */
export function AvailabilityPicker({ durationMin, excludeId, date, time, onChange }: { durationMin: number; excludeId?: string | undefined; date: string; time: string | null; onChange: (date: string, time: string | null) => void }) {
  const { appointments, blockedTimes } = useStore();
  const availability = useAvailability();
  const today = useToday();
  const [month, setMonth] = useState(() => monthStart(date < today ? today : date));
  const [query, setQuery] = useState("");
  const others = useMemo(() => appointments.filter((item) => item.id !== excludeId), [appointments, excludeId]);

  // Open start times for every bookable day of the shown month.
  const openTimes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cursor = new Date(month); cursor.getMonth() === month.getMonth(); cursor.setDate(cursor.getDate() + 1)) {
      const key = toDateKey(cursor);
      if (key >= today) map.set(key, availableTimes(key, durationMin, others, blockedTimes));
    }
    return map;
    // `availability` re-runs this when the working hours change.
  }, [month, today, durationMin, others, blockedTimes, availability]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every start time the working hours allow this month, booked or not, for the specific-time check.
  const workingTimes = useMemo(() => {
    const set = new Set<string>();
    for (const key of openTimes.keys()) {
      for (const block of effectiveHours(key)) {
        for (let minute = timeToMinutes(block.start); minute + durationMin <= timeToMinutes(block.end); minute += 5) set.add(minutesToTime(minute));
      }
    }
    return [...set].sort();
  }, [openTimes, durationMin]);

  // The start times the typed text means, kept to ones the working hours allow (empty: no filter).
  const parsed = query.trim() ? parseTimeQuery(query.trim()) : [];
  const wanted = (parsed ?? []).filter((value) => workingTimes.includes(value));
  const filtering = wanted.length > 0;
  const queryIssue = !query.trim() ? "" : parsed === null ? "Enter a time like 7:30 pm." : !filtering ? `${parsed.map(formatTime).join(" or ")} isn't within working hours this month.` : "";

  const isOpen = (key: string) => {
    const times = openTimes.get(key) ?? [];
    return filtering ? times.some((value) => wanted.includes(value)) : times.length > 0;
  };
  // The picked day's times (it may sit in another month than the one shown).
  const dayTimes = useMemo(() => openTimes.get(date) ?? (date >= today ? availableTimes(date, durationMin, others, blockedTimes) : []), [openTimes, date, today, durationMin, others, blockedTimes]);

  // Every 5-minute start that fits on the picked day, for the "Other time" list.
  const allDayTimes = useMemo(() => (date >= today ? availableTimes(date, durationMin, others, blockedTimes, new Date(), 5) : []), [date, today, durationMin, others, blockedTimes, availability]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstMonth = monthStart(today);
  const lastMonth = monthStart(today);
  lastMonth.setMonth(lastMonth.getMonth() + MONTHS_AHEAD);
  const moveMonth = (step: number) => { const next = new Date(month); next.setMonth(next.getMonth() + step); setMonth(next); };

  function pickDay(key: string) {
    const times = openTimes.get(key) ?? [];
    // Tapping a day picks a time to confirm: the checked time, otherwise the day's earliest.
    onChange(key, times.find((value) => wanted.includes(value)) ?? times[0] ?? null);
  }

  const days: string[] = [];
  for (const cursor = new Date(month); cursor.getMonth() === month.getMonth(); cursor.setDate(cursor.getDate() + 1)) days.push(toDateKey(cursor));

  return <div>
    <div className="max-w-sm">
      <label className="block font-medium" htmlFor="specific-time">Check for specific time availability</label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="specific-time" className="h-12 pl-9 pr-11 text-base" autoComplete="off" placeholder="Enter specific time" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <Button variant="ghost" size="icon" className="absolute right-0.5 top-1/2 h-11 w-11 -translate-y-1/2" aria-label="Clear specific time" onClick={() => setQuery("")}><X /></Button>}
      </div>
      {queryIssue && <p className="mt-1.5 text-sm text-destructive">{queryIssue}</p>}
    </div>

    <h2 className="mt-6 font-serif text-2xl">Choose date</h2>

    <div className="mt-4 flex items-center justify-between">
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => moveMonth(-1)}><ChevronLeft /></Button>
      <p className="font-medium">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Next month" disabled={month >= lastMonth} onClick={() => moveMonth(1)}><ChevronRight /></Button>
    </div>
    <div className="mt-1 grid grid-cols-7 gap-1.5 text-center">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => <div key={name} className="py-1 text-xs uppercase tracking-wide text-muted-foreground">{name}</div>)}
      {Array.from({ length: month.getDay() }, (_, index) => <div key={`blank-${index}`} />)}
      {days.map((key) => {
        const number = fromDateKey(key).getDate();
        if (!isOpen(key)) return <div key={key} className="flex h-13 items-center justify-center text-base text-muted-foreground/45">{number}</div>;
        const selected = key === date;
        return <button key={key} type="button" aria-pressed={selected} aria-label={longDay(key)} className={`flex h-13 flex-col items-center justify-center rounded-xl text-base font-medium transition-colors ${selected ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`} onClick={() => pickDay(key)}>
          {number}
          <span className={`mt-1 h-1.5 w-1.5 rounded-full ${selected ? "bg-primary-foreground" : "bg-primary"}`} />
        </button>;
      })}
    </div>
    {![...openTimes.keys()].some(isOpen) && <p className="mt-3 text-center text-sm text-muted-foreground">{filtering ? `No days this month have ${wanted.map(formatTime).join(" or ")} open.` : `No open days this month for ${formatDuration(durationMin)}.`} Try the next month.</p>}

    <div className="mt-6 border-t pt-6" aria-live="polite">
      {dayTimes.length === 0 ? <p className="text-muted-foreground">Tap a day with a dot to see its times.</p> : <>
        <h2 className="font-serif text-2xl">{time ? "Confirm or choose a different time" : "Choose a time"}</h2>
        <p className="mt-1 text-muted-foreground">{longDay(date)}{time ? ` at ${formatTime(time)} — tap Continue to confirm.` : ""}</p>
        <AllTimes dateKey={date} times={dayTimes} allTimes={allDayTimes} time={time} onPick={(picked) => onChange(date, picked)} />
      </>}
    </div>
  </div>;
}

/** The most times shown as buttons; every other open time is in the "Other time" list. */
const MAX_SUGGESTED = 6;

/** Up to six open times spread evenly across the day (all of them when there are six or fewer). */
export function suggestedTimes(times: string[]): string[] {
  if (times.length <= MAX_SUGGESTED) return times;
  return Array.from({ length: MAX_SUGGESTED }, (_, index) => times[Math.round((index * (times.length - 1)) / (MAX_SUGGESTED - 1))]!);
}

/** Open start times of the day: a few evenly spread buttons, plus a list of every 5-minute start. */
function AllTimes({ dateKey, times, allTimes, time, onPick }: { dateKey: string; times: string[]; allTimes: string[]; time: string | null; onPick: (time: string) => void }) {
  const shown = suggestedTimes(times);
  const other = time !== null && !shown.includes(time);
  return <div>
    <div className="mt-3 grid grid-cols-3 gap-2">{shown.map((value) => <Button key={value} variant={value === time ? "default" : "outline"} className="h-12" onClick={() => onPick(value)}>{formatTime(value)}</Button>)}</div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="text-sm text-muted-foreground" htmlFor="other-time">Other time</label>
      <Select key={dateKey} value={other ? time : ""} onValueChange={onPick}>
        <SelectTrigger id="other-time" className={`h-12 w-44 ${other ? "border-primary ring-2 ring-primary/30" : ""}`}><SelectValue placeholder="Choose" /></SelectTrigger>
        <SelectContent>{allTimes.map((value) => <SelectItem className="h-10" key={value} value={value}>{formatTime(value)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  </div>;
}
