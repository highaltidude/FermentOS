import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

// Copy-to-clipboard with a toast and a 2 s "copied" tick on the button that
// was pressed. `copiedKey` identifies which button to show the tick on.
export function useCopyToClipboard() {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    }).catch(() => toast({ title: "Copy failed", variant: "destructive" }));
  }, [toast]);

  return { copiedKey, copy };
}
