"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  Database,
  Gauge,
  Menu,
  PhoneCall,
  ReceiptText,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: Gauge, hint: "How the business is performing" },
  { href: "/opportunities", label: "Call list", icon: PhoneCall, hint: "Who to call and what to pitch" },
  { href: "/customers", label: "Customers", icon: Users, hint: "Search accounts and profiles" },
  { href: "/invoices", label: "Invoices", icon: ReceiptText, hint: "Every posted and open invoice" },
  { href: "/inventory", label: "Inventory", icon: Boxes, hint: "Machines and parts health" },
  { href: "/service", label: "Service", icon: Wrench, hint: "Work orders and shop churn" },
  { href: "/diagnostics", label: "Data source", icon: Database, hint: "Which file and schema is in use" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", active && "text-sidebar-primary")} />
            <span className="flex flex-col">
              <span className="font-medium">{item.label}</span>
              <span className="text-xs text-sidebar-foreground/50">{item.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-4">
      <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Perseus Equipment</span>
      <span className="text-xs text-sidebar-primary">Service Opportunity Finder</span>
    </div>
  );
}

export function AppShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile bar */}
      <header className="flex items-center justify-between border-b bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground">Perseus Equipment</span>
          <span className="text-xs text-sidebar-primary">Service Opportunity Finder</span>
        </div>
        <button
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {open && (
        <div className="border-b bg-sidebar px-2 pb-4 lg:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-r bg-sidebar lg:flex">
        <div className="px-2">
          <Brand />
          <NavLinks />
        </div>
        {footer && <div className="px-4 py-4 text-xs text-sidebar-foreground/60">{footer}</div>}
      </aside>

      <main className="min-w-0 flex-1 bg-background">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
