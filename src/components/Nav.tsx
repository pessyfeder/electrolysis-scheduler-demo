import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarPlus, ShieldCheck, Sparkles } from "lucide-react";
import { useLock } from "@/lib/lock";

const adminLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/schedule", label: "View Schedule" },
  { to: "/availability", label: "Edit Hours" },
  { to: "/clients", label: "Clients & Billing" },
  { to: "/backup", label: "Backup" },
] as const;

const tab = "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-muted-foreground transition-colors";
const activeTab = "bg-primary text-primary-foreground";

export function Nav() {
  const { status, lock } = useLock();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onBook = pathname.startsWith("/book");
  const unlocked = status === "unlocked";
  // The Book Appointment tab is the public screen handed to clients, so going there always locks Admin.
  const toPublicBook = () => { if (unlocked) lock(); };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/book" search={{ edit: undefined }} className="flex items-center gap-2" onClick={toPublicBook}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">Electrolysis Scheduler</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/book" search={{ edit: undefined }} className={`${tab} ${onBook ? activeTab : ""}`} onClick={toPublicBook}>
            <CalendarPlus className="h-4 w-4" /> Book Appointment
          </Link>
          <Link to="/" className={`${tab} ${!onBook ? activeTab : ""}`}>
            <ShieldCheck className="h-4 w-4" /> Admin
          </Link>
        </nav>
      </div>
      {!onBook && unlocked && (
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
            <nav className="flex flex-wrap gap-1">
              {adminLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  activeOptions={{ exact: l.to === "/" }}
                  className={tab}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
