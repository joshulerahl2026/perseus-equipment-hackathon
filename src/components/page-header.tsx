import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  lede,
  meta,
  actions,
  back,
}: {
  title: string;
  lede?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {lede && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{lede}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta}
    </header>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
