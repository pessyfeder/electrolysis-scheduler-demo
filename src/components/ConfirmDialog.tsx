import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Options = { title: string; description?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean };

/** Promise-based confirmation popup: `if (await confirm({...})) doIt()`. Render `dialog` once. */
export function useConfirm() {
  const [opts, setOpts] = useState<Options | null>(null);
  // Keep showing the last text while the popup animates closed, so it never flashes empty.
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  function confirm(next: Options) {
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; setOpts(next); setOpen(true); });
  }
  function settle(ok: boolean) { const r = resolveRef.current; resolveRef.current = null; setOpen(false); r?.(ok); }
  const dialog: ReactNode = <Dialog open={open} onOpenChange={(o) => !o && settle(false)}>
    <DialogContent>{opts && <>
      <DialogHeader><DialogTitle className="font-serif text-2xl">{opts.title}</DialogTitle>{opts.description && <DialogDescription>{opts.description}</DialogDescription>}</DialogHeader>
      <DialogFooter className="flex-wrap gap-2">
        <Button className="h-11" variant="outline" onClick={() => settle(false)}>{opts.cancelLabel ?? "Go back"}</Button>
        <Button className="h-11" variant={opts.destructive ? "destructive" : "default"} onClick={() => settle(true)}>{opts.confirmLabel}</Button>
      </DialogFooter>
    </>}</DialogContent>
  </Dialog>;
  return { confirm, dialog };
}
