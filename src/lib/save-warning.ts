import { toast } from "sonner";

const TOAST_ID = "save-failed";

/**
 * Saves to this device's storage. When the browser refuses (its storage for this app is full),
 * a warning stays on screen instead of the app stopping with an error; it clears on the next good save.
 */
export function saveToDevice(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    toast.dismiss(TOAST_ID);
    return true;
  } catch {
    toast.error("Your latest change couldn't be saved", {
      id: TOAST_ID,
      duration: Infinity,
      description: "This tablet's storage for the app is full. Changes since this message will be lost when the app closes. Go to Admin → Backup and download a backup now, then get help before adding more records.",
    });
    return false;
  }
}
