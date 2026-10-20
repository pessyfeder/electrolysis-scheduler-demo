import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Phone, Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/data";

const MAX_ROWS = 8;

type Props = {
  clients: Client[];
  onSelect: (client: Client) => void;
  onNewClient: (name: string) => void;
};

export function ClientCombobox({ clients, onSelect, onNewClient }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const matches = useMemo(() => {
    const needle = trimmed.toLowerCase();
    const list = needle
      ? clients.filter((client) => `${client.name} ${client.phone}`.toLowerCase().includes(needle))
      : clients;
    return list.slice(0, MAX_ROWS);
  }, [clients, trimmed]);

  const canCreate = trimmed.length > 0 && matches.length === 0;

  useEffect(() => setHighlight(0), [trimmed]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function choose(client: Client) {
    setQuery(client.name);
    setOpen(false);
    onSelect(client);
  }

  return (
    <div ref={wrapper} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-controls="client-options"
          aria-expanded={open}
          aria-label="Find a client"
          className="h-12 w-full pl-11 pr-11 text-base"
          placeholder="Type a client name or phone number"
          role="combobox"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlight((value) => Math.min(value + 1, Math.max(matches.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const picked = matches[highlight];
              if (picked) choose(picked);
              else if (canCreate) {
                setOpen(false);
                onNewClient(trimmed);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open && (matches.length > 0 || canCreate) && (
        <ul
          className="absolute z-20 mt-2 max-h-72 w-full overflow-auto border bg-popover p-1 shadow-md"
          id="client-options"
          role="listbox"
        >
          {matches.map((client, index) => (
            <li key={client.id} aria-selected={index === highlight} role="option">
              <button
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left",
                  index === highlight && "bg-secondary",
                )}
                onClick={() => choose(client)}
                onMouseEnter={() => setHighlight(index)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{client.name}{client.archived && <span className="ml-2 text-xs font-normal text-muted-foreground">Archived</span>}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {client.phone}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left font-medium text-primary"
                onClick={() => {
                  setOpen(false);
                  onNewClient(trimmed);
                }}
                type="button"
              >
                <UserPlus className="h-4 w-4" /> New client “{trimmed}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
