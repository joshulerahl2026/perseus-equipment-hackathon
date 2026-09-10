import { Badge } from "@/components/ui/badge";
import { Confidence, MathRow } from "@/lib/opportunities/engine";
import { formatByKind } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONFIDENCE_COPY: Record<Confidence, { label: string; hint: string; className: string }> = {
  high: {
    label: "High confidence",
    hint: "Enough closely comparable customers to trust the benchmark.",
    className: "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
  },
  medium: {
    label: "Medium confidence",
    hint: "Compared against the trade class rather than exact fleet size.",
    className: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]",
  },
  low: {
    label: "Low confidence",
    hint: "Too few close peers, so this falls back to the whole customer base.",
    className: "bg-secondary text-muted-foreground",
  },
  insufficient: {
    label: "Not priced",
    hint: "Too few comparable customers to put a number on this without making it up.",
    className: "bg-[color:var(--danger-soft)] text-destructive",
  },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const copy = CONFIDENCE_COPY[confidence];
  return (
    <span title={copy.hint} className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", copy.className)}>
      {copy.label}
    </span>
  );
}

const KIND_COPY = {
  data: { label: "From the data", className: "text-[color:var(--positive)]" },
  derived: { label: "Calculated", className: "text-primary" },
  assumption: { label: "Assumption", className: "text-[color:var(--warning)]" },
} as const;

/**
 * The "how we calculated this" panel. Each row is tagged so a customer-facing
 * number is never confused with an input somebody dialled in.
 */
export function MathPanel({ rows, title = "How we calculated this" }: { rows: MathRow[]; title?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Measured values, calculations, and the inputs you can change are labelled separately.
        </p>
      </div>
      <dl className="divide-y">
        {rows.map((row, i) => {
          const kind = KIND_COPY[row.kind];
          return (
            <div key={`${row.label}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <dt className="text-sm">{row.label}</dt>
                {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
              </div>
              <dd className="flex items-baseline gap-3">
                <span className={cn("text-[10px] font-medium uppercase tracking-wide", kind.className)}>
                  {kind.label}
                </span>
                <span className="min-w-[90px] text-right text-sm font-medium tabular-nums">
                  {formatByKind(row.value, row.format)}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function OfferingBadge({ name }: { name: string }) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap font-normal">
      {name}
    </Badge>
  );
}
