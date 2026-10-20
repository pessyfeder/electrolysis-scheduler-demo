import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequiredMark } from "@/components/RequiredMark";
import { DURATION_OPTIONS, formatDuration, formatTime, fromDateKey, isoToTime, timeToISO, workedMinutes, type Appointment } from "@/lib/data";
import { RATE_PER_MINUTE, validateAppointment } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

type Row = { start: string; end: string };

/** Lets the practitioner fix a start time, an end time, or a booked length entered by mistake. */
export function CorrectTimesDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (open: boolean) => void; item: Appointment }) {
  const { clients, appointments, blockedTimes, correctTimes } = useStore();
  const timed = item.clients.filter((client) => client.startedAt);
  const [durationMin, setDuration] = useState(item.durationMin);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!open) return;
    setDuration(item.durationMin);
    setRows(Object.fromEntries(item.clients.filter((client) => client.startedAt).map((client) => [client.clientId, { start: isoToTime(client.startedAt!), end: client.endedAt ? isoToTime(client.endedAt) : "" }])));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const name = (id: string) => clients.find((client) => client.id === id)?.name ?? "Client";
  const setRow = (clientId: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [clientId]: { ...(current[clientId] ?? { start: "", end: "" }), ...patch } }));

  function preview(clientId: string) {
    const row = rows[clientId];
    if (!row?.start || !row.end) return null;
    const client = item.clients.find((entry) => entry.clientId === clientId);
    if (!client) return null;
    // Paused time recorded during the session stays unbilled after the times are corrected.
    const minutes = workedMinutes({ ...client, startedAt: timeToISO(item.date, row.start), endedAt: timeToISO(item.date, row.end), pausedAt: undefined });
    return { minutes, amount: minutes * RATE_PER_MINUTE, pausedMinutes: Math.round((client.pausedMs ?? 0) / 60000) };
  }

  async function save() {
    const entries: { clientId: string; startedAt: string; endedAt?: string }[] = [];
    for (const client of timed) {
      const row = rows[client.clientId] ?? { start: "", end: "" };
      if (!row.start) return setError(`${name(client.clientId)} needs a start time.`);
      if (client.endedAt && !row.end) return setError(`${name(client.clientId)} already finished — keep or correct the end time.`);
      if (row.end && row.end <= row.start) return setError(`${name(client.clientId)}: the end time must be after the start time.`);
      const entry = { clientId: client.clientId, startedAt: timeToISO(item.date, row.start) };
      if (row.end) entries.push({ ...entry, endedAt: timeToISO(item.date, row.end) });
      else entries.push(entry);
    }
    if (durationMin !== item.durationMin) {
      const issue = validateAppointment({ date: item.date, time: item.time, durationMin, excludeId: item.id }, appointments, blockedTimes);
      if (issue) return setError(issue);
    }
    if (!(await confirm({ title: "Are you sure?", description: "Save the corrected times? Charges for finished sessions are recalculated from the new times.", confirmLabel: "Save times", cancelLabel: "Go back" }))) return;
    correctTimes(item.id, { durationMin, clients: entries });
    onOpenChange(false);
  }

  return (
    <><Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Correct times</DialogTitle>
          <DialogDescription>{fromDateKey(item.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · booked {formatTime(item.time)}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-5 overflow-y-auto">
          {timed.map((client) => {
            const row = rows[client.clientId] ?? { start: "", end: "" };
            const running = Boolean(client.startedAt && !client.endedAt);
            const shown = preview(client.clientId);
            return (
              <div key={client.clientId} className="space-y-2">
                {timed.length > 1 && <p className="text-sm font-medium">{name(client.clientId)}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs text-muted-foreground">Start<RequiredMark /><Input aria-required="true" type="time" step={60} className="h-11" value={row.start} onChange={(event) => setRow(client.clientId, { start: event.target.value })} /></label>
                  <label className="grid gap-1 text-xs text-muted-foreground">End{!running && <RequiredMark />}<Input type="time" step={60} className="h-11" value={row.end} disabled={running} placeholder="Running" onChange={(event) => setRow(client.clientId, { end: event.target.value })} /></label>
                </div>
                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{running ? "Still running" : "Charge"}</span>
                  {shown && <span className="font-semibold tabular-nums">{formatDuration(shown.minutes)} · ${shown.amount.toFixed(2)}{shown.pausedMinutes > 0 && <span className="ml-1 font-normal text-muted-foreground">({formatDuration(shown.pausedMinutes)} paused, not billed)</span>}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <label className="text-sm text-muted-foreground" htmlFor="correct-duration">Booked length<RequiredMark /></label>
          <Select value={String(durationMin)} onValueChange={(value) => setDuration(Number(value))}>
            <SelectTrigger id="correct-duration" className="h-11 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{DURATION_OPTIONS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{formatDuration(minutes)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button className="h-11" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-11" onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {dialog}</>
  );
}
