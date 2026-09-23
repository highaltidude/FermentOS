import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Copy, KeyRound, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../shared";

type ApiToken = {
  id: number;
  name: string;
  prefix: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
};

export function ApiAccessPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(false);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<"read" | "write">("write");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{ id: number; token: string } | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/auth/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { required: boolean; tokens: ApiToken[] };
      setRequired(data.required);
      setTokens(data.tokens);
    } catch (e) {
      toast({ title: "Failed to load API access settings", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (next: boolean) => {
    if (next && tokens.length === 0) {
      toast({ title: "Create a token first", description: "Add at least one API token before enabling lockdown.", variant: "destructive" });
      return;
    }
    setSavingToggle(true);
    try {
      const res = await fetch(`${BASE}api/admin/auth/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ required: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setRequired(next);
      toast({ title: next ? "API lockdown enabled" : "API lockdown disabled" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingToggle(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE}api/admin/auth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope: newScope }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const created = await res.json() as ApiToken & { token: string };
      setTokens((t) => [{ id: created.id, name: created.name, prefix: created.prefix, scope: created.scope, createdAt: created.createdAt, lastUsedAt: created.lastUsedAt }, ...t]);
      setRevealedToken({ id: created.id, token: created.token });
      setNewName("");
      setNewScope("write");
      toast({ title: "Token created — copy it now!" });
    } catch (e) {
      toast({ title: "Failed to create token", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (token: ApiToken) => {
    if (!confirm(`Revoke token "${token.name}"? Any client using it will stop working immediately.`)) return;
    try {
      const res = await fetch(`${BASE}api/admin/auth/tokens/${token.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTokens((t) => t.filter((x) => x.id !== token.id));
      if (revealedToken?.id === token.id) setRevealedToken(null);
      // Reload to pick up auto-disabled lockdown if this was the last token.
      await load();
      toast({ title: "Token revoked" });
    } catch (e) {
      toast({ title: "Failed to revoke", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">Require API token for external clients</div>
          <div className="text-xs text-muted-foreground">
            When enabled, any request without a valid <code>Authorization: Bearer …</code> header is rejected unless it comes from this site's web UI.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={required}
          disabled={savingToggle || (tokens.length === 0 && !required)}
          onClick={() => handleToggle(!required)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${required ? "bg-primary" : "bg-muted"} ${savingToggle || (tokens.length === 0 && !required) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${required ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {tokens.length === 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <span>You don't have any tokens yet. Create one below before enabling lockdown.</span>
        </div>
      )}

      {revealedToken && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <KeyRound className="w-4 h-4" />
            Save this token now — it won't be shown again
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono break-all bg-background border border-border rounded px-2 py-1.5 text-foreground">
              {revealedToken.token}
            </code>
            <Button size="sm" variant="outline" onClick={() => handleCopy(revealedToken.token)}>
              <Copy className="w-3.5 h-3.5 mr-1.5" />Copy
            </Button>
          </div>
          <button onClick={() => setRevealedToken(null)} className="text-xs text-muted-foreground hover:text-foreground">
            I've saved it — hide
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Create New Token</div>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Home Assistant, mobile app"
            className="text-sm"
            maxLength={80}
          />
          <div className="flex items-center rounded-md border border-border bg-background text-xs overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setNewScope("read")}
              className={`px-2.5 py-1.5 transition-colors ${newScope === "read" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Read
            </button>
            <button
              type="button"
              onClick={() => setNewScope("write")}
              className={`px-2.5 py-1.5 transition-colors ${newScope === "write" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Write
            </button>
          </div>
          <Button type="submit" size="sm" disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Generate
          </Button>
        </div>
      </form>

      {tokens.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Tokens</div>
          <div className="space-y-1">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-background group hover:border-primary/30 transition-colors">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-foreground truncate">{t.name}</div>
                    <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${t.scope === "read" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" : "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"}`}>
                      {t.scope}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {t.prefix}…
                    <span className="ml-2 font-sans">
                      created {new Date(t.createdAt).toLocaleDateString()}
                      {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}` : " · never used"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(t)}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-colors"
                  title="Revoke token"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1">
        <div className="font-medium text-foreground">Usage</div>
        <pre className="bg-background border border-border rounded p-2 overflow-x-auto text-[11px] leading-relaxed">{`curl -H "Authorization: Bearer <your-token>" \\
  http://${typeof window !== "undefined" ? window.location.host : "your-pi"}${BASE}api/recipes`}</pre>
      </div>
    </div>
  );
}
