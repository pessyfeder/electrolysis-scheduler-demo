import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/RequiredMark";
import { applyBackup } from "./backup";
import { DEMO_MODE, DEMO_PASSWORD, ensureDemoData } from "./demo";
import {
  autoBackupAvailable,
  deviceSnapshots,
  listSnapshots,
  snapshotNow,
  type SnapshotInfo,
} from "./auto-backup";
import {
  createLockRecord,
  readLockRecord,
  setupIssue,
  verifyPassphrase,
  wipeStudioData,
  writeLockRecord,
} from "./privacy";

/** Time with no taps or keys before Admin locks itself. */
const IDLE_LOCK_MS = 10 * 60 * 1000;

type Status = "checking" | "setup" | "locked" | "unlocked";

type Lock = {
  status: Status;
  setup: (passphrase: string, hint?: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  verify: (passphrase: string) => Promise<boolean>;
};

// Keep one context instance across live code reloads, so the provider and its users never point at different copies.
const contextHost = globalThis as unknown as { __lumiereLockContext?: React.Context<Lock | null> };
const LockContext = (contextHost.__lumiereLockContext ??= createContext<Lock | null>(null));

export function useLock() {
  const lock = useContext(LockContext);
  if (!lock) throw new Error("useLock must be used within LockProvider");
  return lock;
}

export function LockProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    // Admin always starts locked when the app opens; the password is asked again every time.
    // The demo fills in its sample records first, so nothing else loads before they exist.
    void (async () => {
      if (DEMO_MODE) await ensureDemoData();
      setStatus(readLockRecord() ? "locked" : "setup");
    })();
  }, []);

  // Admin locks itself after a stretch with no taps or keys, so records aren't left open on an unattended tablet.
  useEffect(() => {
    if (status !== "unlocked") return;
    const lockNow = () => setStatus("locked");
    let timer = window.setTimeout(lockNow, IDLE_LOCK_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lockNow, IDLE_LOCK_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((name) =>
      window.addEventListener(name, reset, { passive: true, capture: true }),
    );
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset, { capture: true }));
    };
  }, [status]);

  const value = useMemo<Lock>(
    () => ({
      status,
      async setup(passphrase, hint) {
        writeLockRecord(await createLockRecord(passphrase, hint));
        // The new password guards Admin straight away; the app opens on the public Book screen.
        setStatus("locked");
      },
      async unlock(passphrase) {
        const record = readLockRecord();
        if (!record || !(await verifyPassphrase(passphrase, record))) return false;
        setStatus("unlocked");
        return true;
      },
      lock() {
        setStatus("locked");
      },
      async verify(passphrase) {
        const record = readLockRecord();
        return record ? await verifyPassphrase(passphrase, record) : false;
      },
    }),
    [status],
  );

  // Only first-time setup blocks the whole app; once a password exists the public Book screen stays usable
  // and Admin pages are gated by <AdminGate>.
  return (
    <LockContext.Provider value={value}>
      {status === "unlocked" || status === "locked" ? children : <LockScreen status={status} />}
    </LockContext.Provider>
  );
}

/** Renders practitioner-only content, or the inline Admin password screen while locked. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status } = useLock();
  return status === "unlocked" ? <>{children}</> : <LockScreen status={status} />;
}

function LockScreen({ status }: { status: Status }) {
  const { setup, unlock } = useLock();
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "wipe": forgot the password, so the last resort is erasing the tablet.
  const [hint, setHint] = useState("");
  const [mode, setMode] = useState<"unlock" | "wipe">("unlock");
  const [erasing, setErasing] = useState(false);
  const [latestCopy, setLatestCopy] = useState<SnapshotInfo | null>(null);
  // After an erase, the automatic copy kept on this tablet can bring everything back (including the old password).
  useEffect(() => {
    if (status !== "setup" || !autoBackupAvailable()) return;
    void listSnapshots(deviceSnapshots)
      .then((list) => setLatestCopy(list[0] ?? null))
      .catch(() => {});
  }, [status]);

  function switchMode(next: typeof mode) {
    setMode(next);
    setError("");
    setPassphrase("");
    setConfirmation("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (status === "setup") {
      const issue = setupIssue(passphrase, confirmation);
      if (issue) {
        setError(issue);
        return;
      }
      setBusy(true);
      await setup(passphrase, hint);
      return;
    }
    setBusy(true);
    const ok = await unlock(passphrase);
    setBusy(false);
    if (!ok) {
      setError("That password doesn’t match.");
      setPassphrase("");
    }
  }

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="font-display text-lg font-semibold tracking-tight text-muted-foreground">
          Electrolysis Scheduler
        </p>
      </div>
    );
  }

  const newPasswordFields = (
    <>
      <label className="mt-5 block text-sm font-medium" htmlFor="new-password">
        Password
        <RequiredMark />
      </label>
      <Input
        id="new-password"
        className="mt-1 h-12"
        type="password"
        autoComplete="new-password"
        autoFocus={status === "setup"}
        aria-required="true"
        value={passphrase}
        onChange={(event) => setPassphrase(event.target.value)}
      />
      <label className="mt-3 block text-sm font-medium" htmlFor="confirm-password">
        Confirm password
        <RequiredMark />
      </label>
      <Input
        id="confirm-password"
        className="mt-1 h-12"
        type="password"
        autoComplete="new-password"
        aria-required="true"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
    </>
  );

  const eraseOption = (
    <div className="mt-5 border border-dashed p-4">
      <p className="text-sm font-medium">Erase and start over?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This erases every appointment, client and payment stored on this tablet, then lets you
        choose a new password. An automatic copy stays on this tablet: after you erase, the password
        screen offers to restore it. A backup file can also be restored from Admin → Backup.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {erasing ? (
          <p className="w-full text-sm font-semibold text-destructive">
            Are you sure? Every appointment, client and payment on this tablet will be erased. An
            automatic copy is kept on this tablet and can be restored afterwards, but only from the
            password screen that follows.
          </p>
        ) : null}
        <Button
          className="h-11"
          variant="destructive"
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!erasing) {
              setErasing(true);
              return;
            }
            setBusy(true);
            // Make sure the latest records are in the automatic copy before anything is erased.
            await snapshotNow();
            wipeStudioData();
            window.location.reload();
          }}
        >
          {erasing ? "Yes, erase everything" : "Erase and reset"}
        </Button>
        <Button
          className="h-11"
          variant="ghost"
          type="button"
          onClick={() => {
            setErasing(false);
            switchMode("unlock");
          }}
        >
          Keep trying
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <form className="w-full max-w-md border bg-card p-6 sm:p-8" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Electrolysis Scheduler
          </span>
        </div>

        {status === "setup" ? (
          <>
            <h1 className="mt-6 font-serif text-2xl">Choose your practitioner password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The calendar, clients, payments and balances on this tablet stay behind this password.
            </p>
            {latestCopy && (
              <div className="mt-4 border border-dashed p-4">
                <p className="text-sm font-medium">Automatic copy found on this tablet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Saved {new Date(latestCopy.summary.exportedAt).toLocaleString("en-US")} ·{" "}
                  {latestCopy.summary.clients} clients · {latestCopy.summary.appointments}{" "}
                  appointments · {latestCopy.summary.payments} payments. Restoring brings back the
                  records and the password that was in use then.
                </p>
                <Button
                  className="mt-3 h-11"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    applyBackup(window.localStorage, latestCopy.backup);
                    window.location.reload();
                  }}
                >
                  Restore the automatic copy
                </Button>
              </div>
            )}
            {newPasswordFields}
            <label className="mt-3 block text-sm font-medium" htmlFor="password-hint">
              Password hint (optional)
            </label>
            <Input
              id="password-hint"
              className="mt-1 h-12"
              autoComplete="off"
              maxLength={100}
              value={hint}
              onChange={(event) => setHint(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown under "Forgot password?". Don't write the password itself.
            </p>
          </>
        ) : mode !== "unlock" ? (
          <>
            <h1 className="mt-6 font-serif text-2xl">Reset your password</h1>
            {readLockRecord()?.hint && (
              <p className="mt-4 border p-3 text-sm">
                <span className="font-medium">Your hint:</span> {readLockRecord()?.hint}
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              If the hint doesn't help, the only way back in is to erase the records on this tablet.
            </p>
            {eraseOption}
          </>
        ) : (
          <>
            <h1 className="mt-6 font-serif text-2xl">Admin</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your password to open the dashboard, schedule, hours, clients and billing.
            </p>
            {DEMO_MODE && (
              <p className="mt-3 border p-3 text-sm">
                This is a demo. The password is <span className="font-semibold">{DEMO_PASSWORD}</span>.
              </p>
            )}
            <label className="mt-5 block text-sm font-medium" htmlFor="unlock-password">
              Password
              <RequiredMark />
            </label>
            <Input
              id="unlock-password"
              className="mt-1 h-12"
              type="password"
              autoComplete="current-password"
              autoFocus
              aria-required="true"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {mode === "unlock" && (
          <Button className="mt-5 h-12 w-full" disabled={busy} type="submit">
            {busy ? "Please wait…" : status === "setup" ? "Start using the scheduler" : "Unlock"}
          </Button>
        )}

        {status === "locked" && mode === "unlock" && (
          <button
            className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
            type="button"
            onClick={() => switchMode("wipe")}
          >
            Forgot password?
          </button>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          Everything stays on this tablet. Nothing is sent to the internet.
        </p>
      </form>
    </div>
  );
}
