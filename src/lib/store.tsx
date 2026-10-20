import type React from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { noShowCharge, RATE_PER_MINUTE } from "./scheduling";
import { saveToDevice } from "./save-warning";
import { queueSnapshot } from "./auto-backup";
import { clientInSession, clientPaused, emptyData, formatPhone, movePaidAt, pausedMsSoFar, workedMinutes, type Appointment, type BlockedTime, type Adjustment, type Client, type Payment } from "./data";

const STORAGE_KEY = "lumiere-scheduler-v2";
const clientSchema = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().regex(/^\(\d{3}\) \d{3}-\d{4}$/) });
const appointmentSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), durationMin: z.number().int().min(15).max(180), clientIds: z.array(z.string()).min(1).max(6), notes: z.string().trim().max(500) });
const paymentSchema = z.object({ clientId: z.string().min(1), amount: z.number().positive().max(100000), method: z.enum(["cash", "card", "check", "other"]), notes: z.string().trim().max(300) });
const adjustmentSchema = z.object({ clientId: z.string().min(1), amount: z.number().refine((value) => Math.abs(value) >= 0.01 && Math.abs(value) <= 100000), reason: z.string().trim().min(1).max(300) });
const sessionEditSchema = z.object({ startedAt: z.string().optional(), endedAt: z.string().optional(), pausedMs: z.number().min(0).optional(), charge: z.number().min(0).max(100000).optional(), notes: z.string().trim().max(500) });
const blockedSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), reason: z.string().trim().min(1).max(200) });
const correctSchema = z.object({ durationMin: z.number().int().min(15).max(180), clients: z.array(z.object({ clientId: z.string().min(1), startedAt: z.string().min(1), endedAt: z.string().optional() })).min(1) });

type StoreState = ReturnType<typeof emptyData>;
type Store = StoreState & {
  ready: boolean;
  addClient: (input: { name: string; phone: string }) => Client;
  addAppointment: (input: { date: string; time: string; durationMin: number; clientIds: string[]; notes: string }) => Appointment;
  updateAppointment: (id: string, input: { date: string; time: string; durationMin: number; clientIds: string[]; notes: string }) => void;
  setClientStatus: (appointmentId: string, clientId: string, status: Appointment["clients"][number]["status"]) => void;
  addPayment: (input: { clientId: string; amount: number; method: Payment["method"]; notes: string }) => void;
  addBlockedTime: (input: Omit<BlockedTime, "id">) => void;
  removeBlockedTime: (id: string) => void;
  updateClient: (id: string, input: { name: string; phone: string }) => void;
  setClientArchived: (id: string, archived: boolean) => void;
  updatePayment: (id: string, input: { amount: number; method: Payment["method"]; notes: string; date: string }) => void;
  deletePayment: (id: string) => void;
  addAdjustment: (input: { clientId: string; amount: number; reason: string }) => void;
  deleteAdjustment: (id: string) => void;
  editSession: (appointmentId: string, clientId: string, input: SessionEdit) => void;
  startClient: (appointmentId: string, clientId: string) => void;
  endClient: (appointmentId: string) => EndSummary | null;
  pauseClient: (appointmentId: string) => void;
  resumeClient: (appointmentId: string) => void;
  correctTimes: (appointmentId: string, input: { durationMin: number; clients: { clientId: string; startedAt: string; endedAt?: string }[] }) => void;
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
};

/** Changes to one client's finished (or no-show) session. Times are ISO; leave them out for a no-show. */
export type SessionEdit = { startedAt?: string; endedAt?: string; pausedMs?: number; charge?: number; notes: string };

export type EndSummary = { appointmentId: string; clientId: string; minutes: number; amount: number; pausedMinutes: number; nextClientId: string | null };

// Keep one context instance across live code reloads, so the provider and its users never point at different copies.
const contextHost = globalThis as unknown as { __lumiereStoreContext?: React.Context<Store | null> };
const StoreContext = contextHost.__lumiereStoreContext ??= createContext<Store | null>(null);

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Older sessions stored start/end on the appointment only; copy them onto the clients so per-client tools (Correct times) see them. Charges are kept as recorded. */
/** Demo clients older versions saved on first run (id, name, phone). Real clients get generated ids, so these can't collide. */
const DEMO_CLIENTS: [string, string, string][] = [
  ["c1", "Maya Thompson", "(555) 214-8830"],
  ["c2", "Jordan Lee", "(555) 872-1190"],
  ["c3", "Sofia Ramirez", "(555) 340-2271"],
  ["c4", "Ava Chen", "(555) 903-4472"],
];

/** Removes the demo clients plus their appointment entries and payments, leaving every real record untouched. */
export function removeDemoRecords(state: StoreState): StoreState {
  const demo = new Set(DEMO_CLIENTS.filter(([id, name, phone]) => state.clients.some((c) => c.id === id && c.name === name && c.phone === phone)).map(([id]) => id));
  if (!demo.size) return state;
  return {
    ...state,
    clients: state.clients.filter((c) => !demo.has(c.id)),
    appointments: state.appointments
      .map((a) => ({ ...a, clients: a.clients.filter((c) => !demo.has(c.clientId)) }))
      .filter((a) => a.clients.length > 0),
    payments: state.payments.filter((p) => !demo.has(p.clientId)),
    adjustments: (state.adjustments ?? []).filter((a) => !demo.has(a.clientId)),
  };
}

export function migrateLegacyTimes(state: StoreState): StoreState {
  let changed = false;
  const appointments = state.appointments.map((item) => {
    if (!item.startedAt || item.clients.some((c) => c.startedAt)) return item;
    const startedAt = item.startedAt;
    const endedAt = item.endedAt;
    let clients = item.clients.map((c) => c.status === "completed" ? { ...c, startedAt, endedAt: endedAt ?? startedAt } : c);
    if (!clients.some((c) => c.startedAt) && !endedAt) {
      // Legacy session still running: attach it to the first waiting client.
      const first = clients.find((c) => c.status === "scheduled");
      if (first) clients = clients.map((c) => c === first ? { ...c, startedAt } : c);
    }
    if (!clients.some((c) => c.startedAt)) return item;
    changed = true;
    return { ...item, clients };
  });
  return changed ? { ...state, appointments } : state;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => emptyData());
  const [ready, setReady] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setState(removeDemoRecords(migrateLegacyTimes({ ...emptyData(), ...(JSON.parse(saved) as Partial<StoreState>) }))); } catch {
        // Never delete records that can't be read: keep the unreadable copy aside (and in a backup it stays recoverable) and say so.
        try { window.localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, saved); } catch { /* storage full: leave the original in place */ }
        window.localStorage.removeItem(STORAGE_KEY);
        toast.error("Your saved records couldn't be read", { id: "records-unreadable", duration: Infinity, description: "The app is starting empty. The unreadable copy was kept on this tablet; get help before adding new records, or restore a backup from Admin → Backup." });
      }
    }
    setReady(true);
  }, []);

  // What this tab last wrote, so a change made by another tab (the installed app plus a browser tab) can be told apart from our own.
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const text = JSON.stringify(state);
    lastSaved.current = text;
    if (saveToDevice(STORAGE_KEY, text)) queueSnapshot();
  }, [ready, state]);

  // Another tab saved newer records: show them here instead of overwriting them on our next save.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue || event.newValue === lastSaved.current) return;
      try { setState(removeDemoRecords(migrateLegacyTimes({ ...emptyData(), ...(JSON.parse(event.newValue) as Partial<StoreState>) }))); } catch { /* unreadable write: our next save replaces it */ }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<Store>(() => ({
    ...state,
    ready,
    highlightId,
    setHighlightId,
    startClient(appointmentId, clientId) {
      const now = new Date().toISOString();
      setState((current) => current.appointments.some((a) => a.clients.some((c) => c.startedAt && !c.endedAt)) ? current : ({ ...current, appointments: current.appointments.map((a) => a.id !== appointmentId ? a : { ...a, startedAt: a.startedAt ?? now, clients: a.clients.map((c) => c.clientId === clientId && c.status === "scheduled" && !c.startedAt ? { ...c, startedAt: now } : c) }) }));
    },
    endClient(appointmentId) {
      const item = state.appointments.find((a) => a.id === appointmentId);
      const running = item?.clients.find((c) => c.startedAt && !c.endedAt);
      if (!item || !running) return null;
      const now = Date.now();
      const endedAt = new Date(now).toISOString();
      // Ending while paused closes the pause at the end time, so the paused stretch is never billed.
      // A timed session is billed from its clock, so any earlier hand-set charge flag is dropped.
      const finished = { ...running, endedAt, pausedMs: pausedMsSoFar(running, now), pausedAt: undefined, customCharge: undefined, status: "completed" as const };
      const minutes = workedMinutes(finished, now);
      const amount = minutes * RATE_PER_MINUTE;
      const next = item.clients.find((c) => c.status === "scheduled" && !c.startedAt && c.clientId !== running.clientId);
      setState((current) => ({ ...current, appointments: current.appointments.map((a) => a.id !== appointmentId ? a : { ...a, endedAt: next ? undefined : endedAt, clients: a.clients.map((c) => c.clientId === running.clientId ? { ...finished, charge: amount } : c) } as typeof a) }));
      return { appointmentId, clientId: running.clientId, minutes, amount, pausedMinutes: Math.round((finished.pausedMs ?? 0) / 60000), nextClientId: next?.clientId ?? null };
    },
    pauseClient(appointmentId) {
      const pausedAt = new Date().toISOString();
      setState((current) => ({ ...current, appointments: current.appointments.map((a) => a.id !== appointmentId ? a : { ...a, clients: a.clients.map((c) => clientInSession(c) && !c.pausedAt ? { ...c, pausedAt } : c) }) }));
    },
    resumeClient(appointmentId) {
      const now = Date.now();
      setState((current) => ({ ...current, appointments: current.appointments.map((a) => a.id !== appointmentId ? a : { ...a, clients: a.clients.map((c) => clientPaused(c) ? { ...c, pausedMs: pausedMsSoFar(c, now), pausedAt: undefined } : c) }) }));
    },
    correctTimes(appointmentId, input) {
      const parsed = correctSchema.parse(input);
      setState((current) => ({
        ...current,
        appointments: current.appointments.map((item) => {
          if (item.id !== appointmentId) return item;
          const patch = new Map(parsed.clients.map((entry) => [entry.clientId, entry]));
          const clients = item.clients.map((client) => {
            const next = patch.get(client.clientId);
            // No-shows are billed the full booked length, so a corrected length re-bills them (unless set by hand).
            if (!next) return client.status === "no_show" && !client.customCharge ? { ...client, charge: noShowCharge(parsed) } : client;
            const charge = next.endedAt && !client.customCharge ? workedMinutes({ ...client, startedAt: next.startedAt, endedAt: next.endedAt }) * RATE_PER_MINUTE : client.charge;
            return { ...client, startedAt: next.startedAt, endedAt: next.endedAt, charge, status: next.endedAt ? ("completed" as const) : client.status };
          });
          const started = clients.map((client) => client.startedAt).filter((value): value is string => Boolean(value));
          const ended = clients.map((client) => client.endedAt).filter((value): value is string => Boolean(value));
          const active = clients.filter((client) => client.status !== "cancelled");
          return {
            ...item,
            durationMin: parsed.durationMin,
            startedAt: started.length ? new Date(Math.min(...started.map((value) => Date.parse(value)))).toISOString() : item.startedAt,
            endedAt: started.length && active.length && active.every((client) => client.endedAt) ? new Date(Math.max(...ended.map((value) => Date.parse(value)))).toISOString() : undefined,
            clients,
          } as typeof item;
        }),
      }));
    },
    addClient(input) {
      const parsed = clientSchema.parse({ ...input, phone: formatPhone(input.phone) });
      const client: Client = { ...parsed, id: nextId("client"), createdAt: new Date().toISOString(), archived: false };
      setState((current) => ({ ...current, clients: [...current.clients, client] }));
      return client;
    },
    addAppointment(input) {
      const parsed = appointmentSchema.parse(input);
      const appointment: Appointment = { id: nextId("appointment"), date: parsed.date, time: parsed.time, durationMin: parsed.durationMin, notes: parsed.notes, clients: parsed.clientIds.map((clientId) => ({ clientId, status: "scheduled", charge: 0 })) };
      setState((current) => ({ ...current, appointments: [...current.appointments, appointment] }));
      return appointment;
    },
    updateAppointment(id, input) {
      const parsed = appointmentSchema.parse(input);
      setState((current) => ({ ...current, appointments: current.appointments.map((item) => item.id === id ? { ...item, date: parsed.date, time: parsed.time, durationMin: parsed.durationMin, notes: parsed.notes, clients: parsed.clientIds.map((clientId) => item.clients.find((client) => client.clientId === clientId) ?? { clientId, status: "scheduled", charge: 0 }) } : item) }));
    },
    setClientStatus(appointmentId, clientId, status) {
      setState((current) => ({ ...current, appointments: current.appointments.map((item) => item.id === appointmentId ? { ...item, clients: item.clients.map((client) => client.clientId === clientId ? { ...client, status, charge: status === "completed" || status === "no_show" ? noShowCharge(item) : 0, customCharge: undefined } : client) } : item) }));
    },
    addPayment(input) {
      const parsed = paymentSchema.parse(input);
      const payment: Payment = { ...parsed, id: nextId("payment"), paidAt: new Date().toISOString() };
      setState((current) => ({ ...current, payments: [...current.payments, payment] }));
    },
    updateClient(id, input) {
      const parsed = clientSchema.parse({ ...input, phone: formatPhone(input.phone) });
      setState((current) => ({ ...current, clients: current.clients.map((client) => client.id === id ? { ...client, ...parsed } : client) }));
    },
    setClientArchived(id, archived) {
      setState((current) => ({ ...current, clients: current.clients.map((client) => client.id === id ? { ...client, archived } : client) }));
    },
    updatePayment(id, input) {
      const parsed = paymentSchema.omit({ clientId: true }).extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input);
      setState((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === id ? { ...payment, amount: parsed.amount, method: parsed.method, notes: parsed.notes, paidAt: movePaidAt(payment.paidAt, parsed.date) } : payment) }));
    },
    deletePayment(id) {
      setState((current) => ({ ...current, payments: current.payments.filter((payment) => payment.id !== id) }));
    },
    addAdjustment(input) {
      const parsed = adjustmentSchema.parse(input);
      const adjustment: Adjustment = { ...parsed, amount: Math.round(parsed.amount * 100) / 100, id: nextId("adjustment"), createdAt: new Date().toISOString() };
      setState((current) => ({ ...current, adjustments: [...current.adjustments, adjustment] }));
    },
    deleteAdjustment(id) {
      setState((current) => ({ ...current, adjustments: current.adjustments.filter((item) => item.id !== id) }));
    },
    editSession(appointmentId, clientId, input) {
      const parsed = sessionEditSchema.parse(input);
      setState((current) => ({
        ...current,
        appointments: current.appointments.map((item) => {
          if (item.id !== appointmentId) return item;
          const clients = item.clients.map((client) => {
            if (client.clientId !== clientId) return client;
            const timed = parsed.startedAt && parsed.endedAt ? { ...client, startedAt: parsed.startedAt, endedAt: parsed.endedAt, pausedMs: parsed.pausedMs ?? 0, pausedAt: undefined } : client;
            // A typed charge wins; otherwise a timed session is re-billed from its (possibly corrected) times.
            const custom = parsed.charge !== undefined;
            const charge = custom ? Math.round(parsed.charge! * 100) / 100 : timed.startedAt && timed.endedAt ? workedMinutes(timed) * RATE_PER_MINUTE : client.charge;
            return { ...timed, charge, customCharge: custom || undefined };
          });
          const started = clients.map((c) => c.startedAt).filter((value): value is string => Boolean(value)).map(Date.parse);
          const ended = clients.map((c) => c.endedAt).filter((value): value is string => Boolean(value)).map(Date.parse);
          const allDone = clients.every((c) => c.status === "cancelled" || c.status === "no_show" || Boolean(c.endedAt));
          return {
            ...item,
            notes: parsed.notes,
            clients,
            startedAt: started.length ? new Date(Math.min(...started)).toISOString() : item.startedAt,
            endedAt: started.length && allDone && ended.length ? new Date(Math.max(...ended)).toISOString() : item.endedAt,
          } as typeof item;
        }),
      }));
    },
    addBlockedTime(input) {
      const parsed = blockedSchema.parse(input);
      setState((current) => ({ ...current, blockedTimes: [...current.blockedTimes, { ...parsed, id: nextId("blocked") }] }));
    },
    removeBlockedTime(id) {
      setState((current) => ({ ...current, blockedTimes: current.blockedTimes.filter((item) => item.id !== id) }));
    },
  }), [ready, state, highlightId]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used within StoreProvider");
  return store;
}