import { cn } from "@/lib/utils";

export function Switch({ checked, onChange, disabled, title }: { checked: boolean; onChange: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted border border-border",
      )}
      role="switch"
      aria-checked={checked}
      title={title}
    >
      <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}
