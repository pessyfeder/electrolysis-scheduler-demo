import { useEffect, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientCalendar, FindAppointmentsForm } from "../components/ClientCalendar";
import { StoreProvider, useStore } from "../lib/store";

/** Seeds two clients (one with a shared appointment) before rendering the screen under test. */
function Seeded({ children, seeded }: { children: (ids: { maya: string; jordan: string; mine: string }) => React.ReactNode; seeded?: (ids: { maya: string; jordan: string; mine: string }) => void }) {
  const store = useStore();
  const [ids, setIds] = useState<{ maya: string; jordan: string; mine: string } | null>(null);
  useEffect(() => {
    if (ids) return;
    const maya = store.addClient({ name: "Maya Thompson", phone: "5552148830" }).id;
    const jordan = store.addClient({ name: "Jordan Lee", phone: "5558721190" }).id;
    const mine = store.addAppointment({ date: "2030-01-07", time: "10:30", durationMin: 30, clientIds: [maya], notes: "private note" }).id;
    store.addAppointment({ date: "2030-01-09", time: "19:30", durationMin: 45, clientIds: [jordan], notes: "" });
    const next = { maya, jordan, mine };
    seeded?.(next);
    setIds(next);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  return ids ? <>{children(ids)}</> : null;
}

const wrap = (ui: React.ReactNode) => render(<StoreProvider>{ui}</StoreProvider>);

describe("client calendar", () => {
  afterEach(() => { window.localStorage.clear(); vi.useRealTimers(); });

  it("shows only the client's own appointments, never other clients' bookings or notes", () => {
    wrap(<Seeded>{(ids) => <ClientCalendar clientIds={[ids.maya]} highlightId={ids.mine} onExit={() => {}} />}</Seeded>);
    expect(screen.getAllByText(/10:30 AM/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/7:30 PM/)).toBeNull();
    expect(screen.queryByText(/Jordan/)).toBeNull();
    expect(screen.queryByText(/private note/)).toBeNull();
  });

  it("returns to the start after two idle minutes", () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    wrap(<Seeded>{(ids) => <ClientCalendar clientIds={[ids.maya]} onExit={exit} />}</Seeded>);
    act(() => { vi.advanceTimersByTime(2 * 60_000 + 10); });
    expect(exit).toHaveBeenCalled();
  });
});

describe("find my appointments", () => {
  afterEach(() => window.localStorage.clear());

  const fill = (first: string, last: string, phone: string) => {
    if (first) fireEvent.change(screen.getByLabelText(/First name/), { target: { value: first } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: last } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: phone } });
    fireEvent.click(screen.getByRole("button", { name: /Find/ }));
  };

  it("reveals a record only when last name and phone both match", () => {
    const found = vi.fn();
    wrap(<Seeded>{() => <FindAppointmentsForm onFound={found} onBack={() => {}} />}</Seeded>);
    fill("", "Thompson", "5559999999");
    expect(found).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't find/);
    fill("", "thompson", "(555) 214-8830");
    expect(found).toHaveBeenCalledTimes(1);
    expect(found.mock.calls[0]![0]).toHaveLength(1);
  });

  it("a wrong first name does not match", () => {
    const found = vi.fn();
    wrap(<Seeded>{() => <FindAppointmentsForm onFound={found} onBack={() => {}} />}</Seeded>);
    fill("Zed", "Thompson", "5552148830");
    expect(found).not.toHaveBeenCalled();
  });
});
