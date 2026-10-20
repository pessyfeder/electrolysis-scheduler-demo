import { useEffect, useState } from "react";
import { toDateKey } from "@/lib/data";

/**
 * Today's local date key ("YYYY-MM-DD") that rolls over at midnight, so a tablet left open overnight
 * shows the new day. Checks every minute and whenever the tablet wakes or the app comes back into view.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const check = () => setToday(toDateKey(new Date()));
    const timer = window.setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}
