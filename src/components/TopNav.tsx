import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/paper", label: "🤖 Paper Bot" },
  { to: "/wallets", label: "🐋 לווייתנים" },
  { to: "/signals", label: "📡 סיגנלים" },
  { to: "/logic", label: "📖 לוגיקה" },
];

export function TopNav() {
  const { location } = useRouterState();
  const path = location.pathname;
  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-2 overflow-x-auto">
        <nav className="flex gap-1 py-2 min-w-max">
          {tabs.map((t) => {
            const active = path === t.to || (t.to !== "/" && path.startsWith(t.to));
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
