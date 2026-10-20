import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notesIssue } from "../lib/data";
import { StoreProvider, useStore } from "../lib/store";
import { useToday } from "../hooks/use-today";

describe("booking notes", () => {
  it("accept ordinary notes, any alphabet, and numbers", () => {
    for (const note of ["Strengths noted", "Lengths of hair", "Phone: 555-1234", "Call at 7:30pm", "1/2 hr extra", "שפה עליונה", "Lèvre supérieure, côté gauche", "Rx cream 2x/day"]) {
      expect(notesIssue(note), note).toBeNull();
    }
  });

  it("still reject keyboard mashing, repeats and symbol strings", () => {
    for (const note of ["sdfghjkl", "aaaaaa", "!!!???###", "qwrtpsdfg", "12", "- - -"]) {
      expect(notesIssue(note), note).not.toBeNull();
    }
  });
});

describe("hand-set charges", () => {
  afterEach(() => window.localStorage.clear());

  it("are forgotten when a no-show is undone, so the next session bills from its clock", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StoreProvider>{children}</StoreProvider>;
    const { result } = renderHook(() => useStore(), { wrapper });
    let appointmentId = "";
    let clientId = "";
    act(() => {
      clientId = result.current.addClient({ name: "Dana Test", phone: "5550001111" }).id;
      appointmentId = result.current.addAppointment({ date: "2030-01-07", time: "10:30", durationMin: 30, clientIds: [clientId], notes: "" }).id;
    });
    act(() => result.current.setClientStatus(appointmentId, clientId, "no_show"));
    act(() => result.current.editSession(appointmentId, clientId, { charge: 20, notes: "" }));
    const client = () => result.current.appointments[0]!.clients[0]!;
    expect(client().customCharge).toBe(true);

    act(() => result.current.setClientStatus(appointmentId, clientId, "scheduled"));
    expect(client().customCharge).toBeUndefined();

    act(() => result.current.startClient(appointmentId, clientId));
    act(() => { result.current.endClient(appointmentId); });
    expect(client().status).toBe("completed");
    expect(client().customCharge).toBeUndefined();

    // Correcting the times now re-bills the session.
    act(() => result.current.correctTimes(appointmentId, { durationMin: 30, clients: [{ clientId, startedAt: "2030-01-07T15:30:00.000Z", endedAt: "2030-01-07T15:50:00.000Z" }] }));
    expect(client().charge).toBe(50);
  });
});

describe("correcting a shared appointment's length", () => {
  afterEach(() => window.localStorage.clear());

  it("re-bills a no-show for the new booked length, but leaves a hand-set no-show charge alone", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StoreProvider>{children}</StoreProvider>;
    const { result } = renderHook(() => useStore(), { wrapper });
    let appointmentId = "";
    const ids: string[] = [];
    act(() => {
      for (const [name, phone] of [["Ana Test", "5550001111"], ["Bea Test", "5550002222"], ["Cy Test", "5550003333"]] as const) ids.push(result.current.addClient({ name, phone }).id);
      appointmentId = result.current.addAppointment({ date: "2030-01-07", time: "10:30", durationMin: 30, clientIds: ids, notes: "" }).id;
    });
    const [timed, noShow, handSet] = ids as [string, string, string];
    act(() => result.current.setClientStatus(appointmentId, noShow, "no_show"));
    act(() => result.current.setClientStatus(appointmentId, handSet, "no_show"));
    act(() => result.current.editSession(appointmentId, handSet, { charge: 10, notes: "" }));
    act(() => result.current.startClient(appointmentId, timed));
    const charge = (id: string) => result.current.appointments[0]!.clients.find((c) => c.clientId === id)!.charge;
    expect(charge(noShow)).toBe(75);

    act(() => result.current.correctTimes(appointmentId, { durationMin: 45, clients: [{ clientId: timed, startedAt: result.current.appointments[0]!.clients[0]!.startedAt! }] }));
    expect(charge(noShow)).toBe(112.5);
    expect(charge(handSet)).toBe(10);
  });
});

describe("today", () => {
  afterEach(() => vi.useRealTimers());

  it("rolls over to the new day at midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 7, 23, 59, 30));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2030-01-07");
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current).toBe("2030-01-08");
  });
});
