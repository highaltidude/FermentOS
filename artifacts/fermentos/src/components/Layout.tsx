import { Link, useRoute } from "wouter";
import { useEffect, useState } from "react";
import { Beer, BookOpen, Package, LayoutDashboard, Wrench, Settings, Sun, Moon, Calculator } from "lucide-react";
import { useSystemHealth } from "@/hooks/useSystemHealth";

const logoUrl = `${import.meta.env.BASE_URL}fermentos-logo.png`;

// Theme toggle. Persists choice in localStorage and toggles the `dark` class
// on <html>. The initial class is set by an inline script in index.html before
// React mounts to avoid a light-mode flash for users who picked dark.
function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("fermentos-theme", isDark ? "dark" : "light");
    } catch {
      // localStorage may be unavailable (privacy mode); UI still works for the session.
    }
  }, [isDark]);
  return (
    <button
      type="button"
      onClick={() => setIsDark((v) => !v)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed top-3 right-3 z-40 inline-flex items-center justify-center h-9 w-9 rounded-md bg-card border border-border text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/brew-sessions", label: "Brew Log", icon: Beer },
  { href: "/ingredients", label: "Ingredients", icon: Package },
  { href: "/equipment", label: "Equipment", icon: Wrench },
  { href: "/calculators", label: "Calculators", icon: Calculator },
];

const bottomNavItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/brew-sessions", label: "Brew Log", icon: Beer },
  { href: "/ingredients", label: "Ingredients", icon: Package },
  { href: "/equipment", label: "Equipment", icon: Wrench },
];

function NavItem({
  href, label, icon: Icon, indicator,
}: { href: string; label: string; icon: React.ElementType; indicator?: "warning" | "critical" }) {
  const [isActive] = useRoute(href === "/" ? "/" : `${href}*`);
  return (
    <Link href={href}>
      <span
        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`}
      >
        <span className="relative shrink-0">
          <Icon className="w-4 h-4" />
          {indicator && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-sidebar ${
                indicator === "critical" ? "bg-destructive" : "bg-amber-500"
              }`}
            />
          )}
        </span>
        {label}
      </span>
    </Link>
  );
}

function BottomNavItem({
  href, label, icon: Icon, indicator,
}: { href: string; label: string; icon: React.ElementType; indicator?: "warning" | "critical" }) {
  const [isActive] = useRoute(href === "/" ? "/" : `${href}*`);
  return (
    <Link href={href}>
      <span className={`flex flex-col items-center gap-0.5 px-3 py-2 cursor-pointer transition-colors ${
        isActive ? "text-primary" : "text-muted-foreground"
      }`}>
        <span className="relative">
          <Icon className="w-5 h-5" />
          {indicator && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-sidebar ${
                indicator === "critical" ? "bg-destructive" : "bg-amber-500"
              }`}
            />
          )}
        </span>
        <span className="text-[10px] font-medium leading-tight">{label}</span>
      </span>
    </Link>
  );
}

// Note: the sidebar UpdatePanel that used to live here was moved into
// Settings → System → "App Update". The version chip and update controls
// are now grouped with the other system-level admin tools.

export default function Layout({ children }: { children: React.ReactNode }) {
  // Slower than the 5s poll used on the open Health panel — a passive sidebar
  // dot doesn't need near-real-time freshness, and this cuts background
  // request volume against every other page in the app.
  const { status } = useSystemHealth({ refetchInterval: 60_000 });
  const healthIndicator = status && status.overall !== "ok" ? status.overall : undefined;
  const settingsHref = healthIndicator ? "/settings?tab=system&section=health" : "/settings";

  return (
    <div className="flex min-h-screen bg-background">
      <ThemeToggle />
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border flex flex-col items-center gap-2">
          <img src={logoUrl} alt="FermentOS" className="h-20 w-auto object-contain" />
          <span className="text-sm font-semibold tracking-wide text-sidebar-foreground">FermentOS</span>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
          <NavItem href={settingsHref} label="Settings" icon={Settings} indicator={healthIndicator} />
        </nav>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-sidebar border-b border-sidebar-border flex items-center justify-center px-4 h-12">
        <img src={logoUrl} alt="FermentOS" className="h-9 w-auto object-contain" />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto md:overflow-auto pt-12 pb-16 md:pt-0 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar border-t border-sidebar-border flex justify-around items-center safe-area-pb">
        {bottomNavItems.map((item) => (
          <BottomNavItem key={item.href} {...item} />
        ))}
        <BottomNavItem href={settingsHref} label="Settings" icon={Settings} indicator={healthIndicator} />
      </nav>
    </div>
  );
}
