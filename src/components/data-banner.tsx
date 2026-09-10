import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getDb } from "@/lib/db";
import { dataAsOf } from "@/lib/schema";
import { dateLabel } from "@/lib/format";

/**
 * Nobody should read a number without knowing its vintage, or without knowing
 * when they are looking at generated stand-in data instead of the dealership's
 * own export.
 */
export function DataBanner() {
  const { isSample } = getDb();
  const asOf = dataAsOf();

  if (!isSample) {
    return (
      <p className="text-xs text-muted-foreground">
        Dealership export in use. Data as of {dateLabel(asOf)}.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-[color:var(--warning)]/40 bg-[color:var(--warning-soft)] px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--warning)]" />
      <p className="text-foreground/80">
        <span className="font-medium">Sample data.</span> The real{" "}
        <code className="rounded bg-background/70 px-1 py-0.5">perseus_equipment_database.db</code> is not in the
        workspace, so this is generated stand-in data with the same schema. The arithmetic is real; the dollar
        figures are invented. Data as of {dateLabel(asOf)}.{" "}
        <Link href="/diagnostics" className="underline underline-offset-2">
          How to load the real file
        </Link>
        .
      </p>
    </div>
  );
}

export function DataAsOfLine() {
  const { isSample } = getDb();
  const asOf = dataAsOf();
  return (
    <span className="text-xs text-muted-foreground">
      {isSample ? "Sample data" : "Dealership data"} &middot; as of {dateLabel(asOf)}
    </span>
  );
}
