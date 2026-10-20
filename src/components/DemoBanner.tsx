import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DEMO_MODE, DEMO_PASSWORD, resetDemo } from "@/lib/demo";

/** Strip across the top of the demo: says the records are made up, gives the Admin password, and can start the sample over. */
export function DemoBanner() {
  const { confirm, dialog } = useConfirm();
  if (!DEMO_MODE) return null;
  return (
    <div className="border-b border-border bg-accent text-accent-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          <span className="font-semibold">Demo</span> · sample clients and appointments, nothing real. Admin password:{" "}
          <span className="font-semibold">{DEMO_PASSWORD}</span>. Changes stay in this browser only.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (await confirm({ title: "Reset the demo?", description: "Your changes are removed and the sample records come back.", confirmLabel: "Yes, reset", destructive: true })) resetDemo();
          }}
        >
          Reset demo
        </Button>
      </div>
      {dialog}
    </div>
  );
}
