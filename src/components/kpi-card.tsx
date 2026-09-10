import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A KPI with a plain-English label and, where it matters, an explanation of
 * what the metric actually counts. The brief asks for labels a dealership
 * manager understands without asking a database engineer.
 */
export function KpiCard({
  label,
  value,
  sub,
  explain,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  explain?: string;
  href?: string;
  tone?: "default" | "accent" | "positive" | "warning";
}) {
  const body = (
    <CardContent className="flex h-full flex-col gap-1 p-5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {explain && (
          <Tooltip>
            <TooltipTrigger
              aria-label={`What ${label} means`}
              className="text-muted-foreground/70 hover:text-foreground"
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-balance">{explain}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          tone === "accent" && "text-primary",
          tone === "positive" && "text-[color:var(--positive)]",
          tone === "warning" && "text-[color:var(--warning)]",
        )}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </CardContent>
  );

  const card = (
    <Card
      className={cn(
        "h-full overflow-hidden py-0 transition-colors",
        href && "hover:border-primary/40 hover:bg-secondary/40",
        tone === "accent" && "border-primary/30 bg-primary/[0.03]",
      )}
    >
      {body}
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-2 focus-visible:outline-ring">
      {card}
    </Link>
  ) : (
    card
  );
}
