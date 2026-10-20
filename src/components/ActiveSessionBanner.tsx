import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { StartEndControls } from "@/components/AppointmentControls";
import { clientInSession, workedMs } from "@/lib/data";
import { useStore } from "@/lib/store";

/**
 * Persistent strip shown on every page while a session is running.
 * `isPublic` hides every client detail and control (public Book screen).
 */
export function ActiveSessionBanner({ isPublic = false }: { isPublic?: boolean }) {
  const { appointments, clients } = useStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const item = appointments.find((a) => a.clients.some(clientInSession));
  const running = item?.clients.find(clientInSession);
  // Remember the appointment last shown here. When its session is ended from this strip, the strip hides but its
  // controls stay mounted in the same place, so the "Session complete" window that follows isn't lost.
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => { if (item) setLastId(item.id); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = item ?? (lastId ? appointments.find((a) => a.id === lastId) : undefined);
  if (!shown || (isPublic && !running)) return null;

  // Time worked, which stops counting while the session is paused.
  const secs = running ? Math.floor(workedMs(running, now) / 1000) : 0;
  const paused = Boolean(running?.pausedAt);
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const timer = <Timer className={`h-4 w-4 ${paused ? "" : "animate-pulse"}`} />;
  return <div role="status" className={running ? "sticky top-16 z-10 border-b border-status-progress bg-status-progress/20 backdrop-blur" : "hidden"}>
    <div className="mx-auto flex min-h-11 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
      {isPublic
        ? <p className="flex items-center gap-2 text-sm">{timer}<span className="font-semibold">{paused ? "Session paused" : "Active session in progress"}</span></p>
        : <>
          <p className="flex items-center gap-2 text-sm">{timer}<span className="font-semibold">{paused ? "Session paused" : "Session in progress"}</span>{running && <> · {clients.find((c) => c.id === running.clientId)?.name} · <span className="font-mono tabular-nums">{elapsed}</span></>}</p>
          <StartEndControls item={shown} />
        </>}
    </div>
  </div>;
}
