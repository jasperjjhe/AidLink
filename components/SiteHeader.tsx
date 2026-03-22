import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SiteHeaderNavItem = { href: string; label: string };

interface SiteHeaderProps {
  navItems: SiteHeaderNavItem[];
  className?: string;
}

export function SiteHeader({ navItems, className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0",
        className
      )}
    >
      <div className="container flex h-14 items-center justify-between gap-4">
        <Link href="/" className="shrink-0 font-bold text-xl tracking-tight">
          AidLink
        </Link>
        <nav
          className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:gap-x-4"
          aria-label="Main"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/dashboard" className="shrink-0">
            <Button variant="outline" size="sm">
              Organizer Dashboard
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
