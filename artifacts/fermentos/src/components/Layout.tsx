import { Link, useRoute } from "wouter";
import { Beer, BookOpen, Package, LayoutDashboard, Wrench, Settings } from "lucide-react";

const logoUrl = `${import.meta.env.BASE_URL}fermentos-logo.png`;

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/brew-sessions", label: "Brew Log", icon: Beer },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/equipment", label: "Equipment", icon: Wrench },
];

const bottomNavItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/brew-sessions", label: "Brew Log", icon: Beer },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/equipment", label: "Equipment", icon: Wrench },
];

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
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
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </span>
    </Link>
  );
}

function BottomNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const [isActive] = useRoute(href === "/" ? "/" : `${href}*`);
  return (
    <Link href={href}>
      <span className={`flex flex-col items-center gap-0.5 px-3 py-2 cursor-pointer transition-colors ${
        isActive ? "text-primary" : "text-muted-foreground"
      }`}>
        <Icon className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-tight">{label}</span>
      </span>
    </Link>
  );
}

// Note: the sidebar UpdatePanel that used to live here was moved into
// Settings → System → "App Update". The version chip and update controls
// are now grouped with the other system-level admin tools.

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border flex justify-center">
          <img src={logoUrl} alt="FermentOS" className="h-24 w-auto object-contain" />
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
          <NavItem href="/settings" label="Settings" icon={Settings} />
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
        <BottomNavItem href="/settings" label="Settings" icon={Settings} />
      </nav>
    </div>
  );
}
