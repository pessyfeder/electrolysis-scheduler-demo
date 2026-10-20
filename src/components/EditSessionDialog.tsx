import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { RequiredMark } from "@/components/RequiredMark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, formatTime, fromDateKey, isoToTime, notesIssue, statusLabel, timeToISO, workedMinutes, type Appointment } from "@/lib/data";
import { RATE_PER_MINUTE } from "@/lib/scheduling";
import { useStore, type SessionEdit } from "@/lib/store";

/**
 * Fix one client's finished session from the billing window: start / end times, paused minutes,
 * the charge (worked out from the time, or typed in), and the appointment notes.
 */
export function EditSessionDialog({ item, clientId, onClose }: { item: Appointment | null; clientId: string | null; onClose: () => void }) {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const entry = item?.clients.find((c) => c.clientId === clientId) ?? null;
  const timed = Boolean(entry?.startedAt && entry?.endedAt);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pausedMin, setPausedMin] = useState("0");
  const [manual, setManual] = useState(false);
  const [charge, setCharge] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item || !entry) return;
    setStart(entry.startedAt ? isoToTime(entry.startedAt) : "");
    setEnd(entry.endedAt ? isoToTime(entry.endedAt) : "");
    setPausedMin(String(Math.round((entry.pausedMs ?? 0) / 60000)));
    // Sessions without times (no-shows) always take a typed charge.
    setManual(Boolean(entry.customCharge) || !(entry.startedAt && entry.endedAt));
    setCharge(entry.charge.toFixed(2));
    setNotes(item.notes);
    setError("");
  }, [item?.id, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !entry) return null;
  const name = store.clients.find((c) => c.id === entry.clientId)?.name ?? "Client";
  const shared = item.clients.length > 1;

  const paused = Number(pausedMin);
  const timesValid = timed && start && end && end > start && paused >= 0;
  const worked = timesValid ? workedMinutes({ ...entry, startedAt: timeToISO(item.date, start), endedAt: timeToISO(item.date, end), pausedMs: paused * 60000, pausedAt: undefined }) : null;
  const calculated = worked !== null ? worked * RATE_PER_MINUTE : null;

  async function save() {
    if (!item || !entry) return;
    const edit: SessionEdit = { notes };
    if (timed) {
      if (!start || !end) return setError("Enter both a start and an end time.");
      if (end <= start) return setError("The end time must be after the start time.");
      if (!(paused >= 0) || !Number.isInteger(paused)) return setError("Paused time must be a whole number of minutes (0 or more).");
      const span = (Date.parse(timeToISO(item.date, end)) - Date.parse(timeToISO(item.date, start))) / 60000;
      if (paused >= span) return setError("Paused time can't be as long as the whole session.");
      edit.startedAt = timeToISO(item.date, start);
      edit.endedAt = timeToISO(item.date, end);
      edit.pausedMs = paused * 60000;
    }
    if (manual) {
      if (charge.trim() === "" || !(Number(charge) >= 0)) return setError("Enter a charge of $0 or more.");
      edit.charge = Number(charge);
    }
    const noteError = notesIssue(notes);
    if (noteError) return setError(noteError);
    const newCharge = manual ? Number(charge) : calculated ?? entry.charge;
    const ok = await confirm({
      title: "Are you sure?",
      description: `Save the changes to ${name}'s session? The charge will be $${newCharge.toFixed(2)} and their balance updates to match.`,
      confirmLabel: "Save session",
      cancelLabel: "Go back",
    });
    if (!ok) return;
    store.editSession(item.id, entry.clientId, edit);
    onClose();
  }

  return <>
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit session</DialogTitle>
          <DialogDescription>{name} · {fromDateKey(item.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · booked {formatTime(item.time)} · {statusLabel(entry.status)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {timed && <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">Start<RequiredMark /><Input aria-required="true" className="h-11" type="time" step={60} value={start} onChange={(e) => { setStart(e.target.value); setError(""); }} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">End<RequiredMark /><Input aria-required="true" className="h-11" type="time" step={60} value={end} onChange={(e) => { setEnd(e.target.value); setError(""); }} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Paused (min)<Input className="h-11" type="number" min="0" step="1" value={pausedMin} onChange={(e) => { setPausedMin(e.target.value); setError(""); }} /></label>
          </div>}
          <div className="grid gap-2">
            <p className="text-sm font-medium">Charge{manual && <RequiredMark />}</p>
            {timed && <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How the charge is set">
              <Button className="h-11" type="button" role="radio" aria-checked={!manual} variant={!manual ? "default" : "outline"} onClick={() => setManual(false)}>From time worked</Button>
              <Button className="h-11" type="button" role="radio" aria-checked={manual} variant={manual ? "default" : "outline"} onClick={() => setManual(true)}>Set amount</Button>
            </div>}
            {manual
              ? <Input className="h-11" type="number" min="0" step="0.01" aria-label="Charge amount" aria-required="true" value={charge} onChange={(e) => { setCharge(e.target.value); setError(""); }} />
              : <p className="rounded-md bg-muted px-3 py-2 text-sm">{worked !== null && calculated !== null ? <>{formatDuration(worked)} worked · <span className="font-semibold">${calculated.toFixed(2)}</span></> : "Enter valid times to work out the charge."}</p>}
          </div>
          <label className="grid gap-1 text-sm font-medium" htmlFor="session-notes">Notes{shared && <span className="text-xs font-normal text-muted-foreground">Shared by everyone on this appointment</span>}
            <Textarea id="session-notes" maxLength={500} value={notes} onChange={(e) => { setNotes(e.target.value); setError(""); }} />
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button className="h-11" variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="h-11" onClick={save}>Save session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {dialog}
  </>;
}
