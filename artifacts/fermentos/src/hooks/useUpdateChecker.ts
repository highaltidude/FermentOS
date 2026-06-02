import { useEffect, useRef } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "fermentos_update_first_seen";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function checkForUpdate(): Promise<{ updateAvailable: boolean; hash: string; message: string } | null> {
  try {
    const res = await fetch("/api/admin/version");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function useUpdateChecker() {
  const toastShownRef = useRef(false);

  useEffect(() => {
    async function run() {
      const data = await checkForUpdate();
      if (!data) return;

      if (!data.updateAvailable) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      const now = Date.now();
      const stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        localStorage.setItem(STORAGE_KEY, String(now));
        return;
      }

      const firstSeen = Number(stored);
      if (now - firstSeen < TWENTY_FOUR_HOURS_MS) return;

      if (toastShownRef.current) return;
      toastShownRef.current = true;

      toast("A FermentOS update is available", {
        description: data.message,
        duration: Infinity,
        action: {
          label: "View Update",
          onClick: () => {
            window.location.href = "/settings?tab=system&section=updates";
          },
        },
        cancel: {
          label: "Dismiss",
          onClick: () => {},
        },
      });
    }

    run();
    const id = setInterval(run, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
