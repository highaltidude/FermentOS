import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useGetBreweryName, useSetBreweryName, getGetBreweryNameQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export function BreweryNamePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useGetBreweryName();
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (data !== undefined) {
      setInputValue(data.name ?? "");
    }
  }, [data]);

  const setMutation = useSetBreweryName({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBreweryNameQueryKey() });
        toast({ title: "Brewery name saved" });
      },
      onError: () => {
        toast({ title: "Failed to save brewery name", variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    setMutation.mutate({ data: { name: inputValue.trim() || null } });
  };

  if (isLoading) return <Skeleton className="h-10 rounded-md" />;

  return (
    <div className="flex items-center gap-2">
      <Input
        className="flex-1"
        placeholder="e.g. My Brewery"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        disabled={setMutation.isPending}
      />
      <Button
        size="sm"
        onClick={handleSave}
        disabled={setMutation.isPending}
      >
        {setMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}
