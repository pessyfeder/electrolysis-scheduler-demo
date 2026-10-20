import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/AppointmentControls";
import { formatTime, fromDateKey, searchAppointments, type Appointment } from "@/lib/data";
import { useStore } from "@/lib/store";

/** Search Appointment: find a booking by client name or phone and/or date, then open it on the Schedule. */
export function AppointmentSearchDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (item: Appointment) => void }) {
  const { appointments, clients } = useStore();
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const results = useMemo(() => searchAppointments(query, date, appointments, clients), [query, date, appointments, clients]);
  const names = (item: Appointment) => item.clients.map((entry) => clients.find((client) => client.id === entry.clientId)?.name).filter(Boolean).join(" & ") || "(no client)";

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
      <DialogHeader><DialogTitle>Search appointment</DialogTitle><DialogDescription>Find a booking by client name or phone, by date, or both.</DialogDescription></DialogHeader>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input className="h-12 text-base" aria-label="Client name or phone" placeholder="Client name or phone" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="flex items-center gap-1">
          <Input className="h-12 w-44" type="date" aria-label="On date" value={date} onChange={(event) => setDate(event.target.value)} />
          {date && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Any date" onClick={() => setDate("")}><X /></Button>}
        </div>
      </div>
      <div className="min-h-40 flex-1 overflow-y-auto border-y">
        {!query.trim() && !date ? <p className="p-6 text-center text-sm text-muted-foreground">Type a name or phone, or pick a date, to search.</p>
          : results.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No matching appointments.</p>
          : <ul className="divide-y">{results.map((item) => <li key={item.id}>
            <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-2 py-3 text-left hover:bg-muted/60 active:bg-muted" onClick={() => onPick(item)}>
              <span className="flex items-center gap-3"><StatusBadge item={item} /><span><span className="block font-semibold">{fromDateKey(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {formatTime(item.time)}</span><span className="block text-sm text-muted-foreground">{names(item)}</span></span></span>
            </button>
          </li>)}</ul>}
      </div>
      {results.length > 0 && <p className="text-xs text-muted-foreground">Tap an appointment to open it on the schedule.</p>}
    </DialogContent>
  </Dialog>;
}
