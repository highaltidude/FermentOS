import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { copyText } from "@/lib/clipboard";

// Copy-to-clipboard with a toast and a 2 s "copied" tick on the button that
// was pressed. `copiedKey` identifies which button to show the tick on.
export function useCopyToClipboard() {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback((key: string, text: string) => {
    void copyText(text).then((ok) => {
      if (!ok) {
        toast({ title: "Couldn't copy", description: "Select the text and copy it by hand.", variant: "destructive" });
        return;
      }
      setCopiedKey(key);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    });
  }, [toast]);

  return { copiedKey, copy };
}
