import { useEffect, useState } from "react";
import { Undo2, UserX, XCircle } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatDuration, type Appointment } from "@/lib/data";
import { canMarkNoShow, noShowCharge } from "@/lib/scheduling";
import { useStore } from "@/lib/store";

/** Re-render once a minute so buttons that depend on the clock (No-show) appear on time. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);
}

/**
 * Cancel / No-show / Undo no-show for one client on an appointment.
 * No-show only appears once the booked start time has passed, and bills the full booked length.
 */
export function ClientStatusActions({ item, clientId, showName = false }: { item: Appointment; clientId: string; showName?: boolean }) {
  useMinuteTick();
  const { clients, setClientStatus } = useStore();
  const { confirm, dialog } = useConfirm();
  const entry = item.clients.find((c) => c.clientId === clientId);
  if (!entry) return null;
  const name = clients.find((c) => c.id === clientId)?.name ?? "this client";
  const label = showName ? ` ${name.split(" ")[0]}` : "";
  const charge = `$${noShowCharge(item).toFixed(2)}`;

  async function cancel() {
    if (await confirm({ title: `Cancel ${name}'s appointment?`, description: "This frees the time slot.", confirmLabel: "Cancel appointment", cancelLabel: "Keep appointment", destructive: true })) setClientStatus(item.id, clientId, "cancelled");
  }
  async function noShow() {
    if (await confirm({ title: `Mark ${name} as a no-show?`, description: `${name} will be charged ${charge} for the full booked ${formatDuration(item.durationMin)}.`, confirmLabel: `Mark no-show (${charge})`, cancelLabel: "Go back", destructive: true })) setClientStatus(item.id, clientId, "no_show");
  }
  async function undo() {
    if (await confirm({ title: `Undo ${name}'s no-show?`, description: `The ${charge} no-show charge is removed and the appointment goes back to Scheduled, so the session can still be started.`, confirmLabel: "Undo no-show" })) setClientStatus(item.id, clientId, "scheduled");
  }

  const waiting = entry.status === "scheduled" && !entry.startedAt;
  return <>
    {waiting && canMarkNoShow(item, entry) && <Button className="h-11" variant="outline" onClick={noShow}><UserX /> No-show{label}</Button>}
    {waiting && <Button className="h-11" variant="ghost" onClick={cancel} aria-label={`Cancel ${name}'s appointment`}><XCircle /> Cancel{label}</Button>}
    {entry.status === "no_show" && <Button className="h-11" variant="ghost" onClick={undo}><Undo2 /> Undo no-show{label}</Button>}
    {dialog}
  </>;
}
