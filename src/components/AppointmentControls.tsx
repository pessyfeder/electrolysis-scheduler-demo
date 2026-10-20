import { useConfirm } from "@/components/ConfirmDialog";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CreditCard, Pause, Pencil, Play, Square } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { clientInSession, formatDuration, formatDurationLong, appointmentProgress, pausedMsSoFar, PROGRESS_LABEL, workedMinutes, type Appointment, type AppointmentProgress } from "@/lib/data";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { useStore, type EndSummary } from "@/lib/store";
import { CorrectTimesDialog } from "@/components/CorrectTimesDialog";

/** Left accent + tint for calendar cards. */
export const STATUS_CARD: Record<AppointmentProgress, string> = {
  scheduled: "border-l-4 border-l-status-scheduled bg-status-scheduled/5",
  in_progress: "border-l-4 border-l-status-progress bg-status-progress/15",
  paused: "border-l-4 border-dashed border-l-status-progress bg-muted/60",
  ended: "border-l-4 border-l-status-completed bg-status-completed/5",
  cancelled: "border-l-4 border-l-status-cancelled bg-status-cancelled/10 opacity-70",
  no_show: "border-l-4 border-l-status-noshow bg-status-noshow/5",
};

/** Solid color for status dots and the key. */
export const STATUS_DOT: Record<AppointmentProgress, string> = {
  scheduled: "bg-status-scheduled",
  in_progress: "bg-status-progress",
  paused: "border-2 border-dashed border-status-progress bg-muted",
  ended: "bg-status-completed",
  cancelled: "bg-status-cancelled",
  no_show: "bg-status-noshow",
};

/** Client entry status → the matching appointment color. */
export const CLIENT_PROGRESS = { scheduled: "scheduled", completed: "ended", cancelled: "cancelled", no_show: "no_show" } as const;

/** Status shown by color only; the name is still read out by screen readers and shown on hover. */
export function StatusDot({ progress }: { progress: AppointmentProgress }) {
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[progress]}`} title={PROGRESS_LABEL[progress]}><span className="sr-only">{PROGRESS_LABEL[progress]}</span></span>;
}

/** Color dot with the status name, for an opened appointment. */
export function StatusLabel({ progress }: { progress: AppointmentProgress }) {
  return <span className="inline-flex items-center gap-1.5 text-sm font-medium"><span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[progress]}`} />{PROGRESS_LABEL[progress]}</span>;
}

export function StatusBadge({ item }: { item: Appointment }) {
  return <StatusDot progress={appointmentProgress(item)} />;
}

const KEY_ORDER: AppointmentProgress[] = ["scheduled", "in_progress", "paused", "ended", "no_show", "cancelled"];

/** Color key for the status colors used on appointments. */
export function StatusKey({ className = "" }: { className?: string }) {
  return <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${className}`} aria-label="Status color key">
    {KEY_ORDER.map((progress) => <li key={progress} className="flex items-center gap-1.5"><span aria-hidden="true" className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT[progress]}`} />{PROGRESS_LABEL[progress]}</li>)}
  </ul>;
}

function clock(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}

export function StartEndControls({ item }: { item: Appointment }) {
  const { startClient, endClient, pauseClient, resumeClient, clients, appointments } = useStore();
  const navigate = useNavigate();
  const busyElsewhere = appointments.some((a) => a.id !== item.id && a.clients.some(clientInSession));
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [paying, setPaying] = useState<EndSummary | null>(null);
  const [ending, setEnding] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client";
  const first = (id: string) => name(id).split(" ")[0];
  const running = item.clients.find(clientInSession);
  const waitingAll = item.clients.filter((c) => c.status === "scheduled" && !c.startedAt);
  const waiting = waitingAll[0];
  const shared = item.clients.length > 1;
  const { confirm, dialog: confirmDialog } = useConfirm();
  async function start(clientId: string) { if (!(await confirm({ title: "Are you sure?", description: `Start ${name(clientId)}'s session? The clock starts now and billing is based on the time recorded.`, confirmLabel: "Start session" }))) return; startClient(item.id, clientId); }
  function end() { setEnding(false); setSummary(endClient(item.id)); }
  function openCorrect() { setCorrecting(true); }
  const elapsedMin = running ? workedMinutes(running) : 0;
  const pausedMin = running ? Math.round(pausedMsSoFar(running) / 60000) : 0;
  const paused = Boolean(running?.pausedAt);
  const confirmEnd = <Dialog open={ending} onOpenChange={setEnding}>
    <DialogContent>
      <DialogHeader><DialogTitle className="font-serif text-2xl">Are you sure?</DialogTitle><DialogDescription>End {running ? `${name(running.clientId)}'s` : "this"} session? Review the time before stopping the clock.</DialogDescription></DialogHeader>
      {running && <div className="divide-y rounded-lg border">
        <div className="flex justify-between p-4"><span className="text-muted-foreground">Client</span><span className="font-semibold">{name(running.clientId)}</span></div>
        <div className="flex justify-between p-4"><span className="text-muted-foreground">Started</span><span className="font-semibold">{clock(running.startedAt)}</span></div>
        <div className="flex justify-between p-4"><span className="text-muted-foreground">Time worked (billed)</span><span className="font-semibold">{formatDuration(elapsedMin)}</span></div>
        {pausedMin > 0 && <div className="flex justify-between p-4"><span className="text-muted-foreground">Paused (not billed)</span><span className="font-semibold">{formatDuration(pausedMin)}</span></div>}
      </div>}
      <DialogFooter className="flex-wrap gap-2">
        <Button className="h-11" variant="outline" onClick={() => setEnding(false)}>Keep running</Button>
        <Button className="h-11" variant="destructive" onClick={end}><Square /> End session</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
  const popup = <Dialog open={Boolean(summary)} onOpenChange={(open) => !open && setSummary(null)}>
    <DialogContent>{summary && <>
      <DialogHeader><DialogTitle className="font-serif text-2xl">Session complete</DialogTitle><DialogDescription>Billed for actual time worked.</DialogDescription></DialogHeader>
      <div className="divide-y rounded-lg border">
        <div className="flex justify-between p-4"><span className="text-muted-foreground">Client</span><span className="font-semibold">{name(summary.clientId)}</span></div>
        <div className="flex justify-between p-4"><span className="text-muted-foreground">Duration</span><span className="font-semibold">{formatDuration(summary.minutes)}</span></div>
        {summary.pausedMinutes > 0 && <div className="flex justify-between p-4"><span className="text-muted-foreground">Paused (not billed)</span><span className="font-semibold">{formatDuration(summary.pausedMinutes)}</span></div>}
        <div className="flex justify-between p-4"><span className="text-muted-foreground">Amount owed</span><span className="text-lg font-semibold">${summary.amount.toFixed(2)}</span></div>
      </div>
      {summary.nextClientId && <p className="rounded-lg bg-muted p-3 text-sm">{waitingAll.length > 1 ? "Choose who to start next." : `${name(summary.nextClientId)} is still waiting on this appointment.`}</p>}
      <DialogFooter className="flex-wrap gap-2">
        <Button className="h-11" variant="outline" onClick={() => setSummary(null)}>Done</Button>
        <Button className="h-11" variant="outline" onClick={() => { setPaying(summary); setSummary(null); }}><CreditCard /> Record payment</Button>
        {waitingAll.map((c) => <Button key={c.clientId} className="h-11" onClick={() => { setSummary(null); void start(c.clientId); }}><Play /> Start {first(c.clientId)}</Button>)}
      </DialogFooter>
    </>}</DialogContent>
  </Dialog>;
  const payment = <RecordPaymentDialog open={Boolean(paying)} onOpenChange={(o: boolean) => { if (!o) setPaying(null); }} clientIds={paying ? [paying.clientId] : undefined} defaultAmount={paying?.amount} onSaved={() => void navigate({ to: "/clients" })} />;
  let control = null;
  if (running) control = <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">{shared ? `${first(running.clientId)} · ` : ""}{paused ? `paused since ${clock(running.pausedAt)}` : `started ${clock(running.startedAt)}`}</span>{paused
    ? <Button className="h-11" onClick={() => resumeClient(item.id)}><Play /> Resume</Button>
    : <Button className="h-11" variant="outline" onClick={() => pauseClient(item.id)}><Pause /> Pause</Button>}<Button className="h-11" variant="destructive" onClick={() => setEnding(true)}><Square /> End{shared ? ` ${first(running.clientId)}` : ""}</Button></div>;
  else if (waiting && busyElsewhere) control = <span className="text-xs text-muted-foreground">Another session is running</span>;
  else if (waiting) control = <div className="flex flex-wrap items-center gap-2">{waitingAll.map((c) => <Button key={c.clientId} className="h-11" onClick={() => start(c.clientId)}><Play /> Start{shared ? ` ${first(c.clientId)}` : ""}</Button>)}</div>;
  else if (item.startedAt && item.endedAt) control = <span className="flex flex-col text-right text-xs text-muted-foreground"><span className="font-bold text-foreground">Actual duration:</span><span>{formatDurationLong(item.clients.filter((c) => c.startedAt && c.endedAt).reduce((sum, c) => sum + workedMinutes(c), 0))}</span><span>{clock(item.startedAt)} – {clock(item.endedAt)}</span></span>;
  const timed = item.clients.some((c) => c.startedAt);
  const editBtn = timed && <Button size="icon" variant="ghost" className="h-11 w-11 text-muted-foreground" onClick={openCorrect} aria-label="Correct times"><Pencil /></Button>;
  return <><span className="inline-flex items-center gap-1">{control}{editBtn}</span>{confirmDialog}{popup}{payment}{confirmEnd}<CorrectTimesDialog open={correcting} onOpenChange={setCorrecting} item={item} /></>;
}
