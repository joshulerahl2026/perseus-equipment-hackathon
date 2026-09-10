"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { money, percent } from "@/lib/format";

/**
 * The two numbers that are not in the database: what a training visit costs
 * and how much churn it prevents. They are inputs, kept visibly separate from
 * everything measured, and the payback recomputes from whatever is dialled in.
 */
export function AssumptionsPanel({
  fee,
  reduction,
  bounds,
}: {
  fee: number;
  reduction: number;
  bounds: {
    trainingFee: { min: number; max: number; step: number };
    churnReduction: { min: number; max: number; step: number };
  };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [draftFee, setDraftFee] = useState(fee);
  const [draftReduction, setDraftReduction] = useState(reduction);

  const commit = (nextFee: number, nextReduction: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("fee", String(Math.round(nextFee)));
    next.set("reduction", nextReduction.toFixed(2));
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="rounded-lg border border-[color:var(--warning)]/40 bg-[color:var(--warning-soft)]/60 p-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="size-4 text-[color:var(--warning)]" />
        <h3 className="text-sm font-semibold">Assumptions you control</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Neither of these is in the dealership database. Change them and the payback below recalculates. Everything
        else on this page is measured.
      </p>

      <div className={pending ? "opacity-70" : undefined}>
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="fee" className="text-xs font-medium">
              Training fee for a day on site
            </label>
            <span className="text-sm font-semibold tabular-nums">{money(draftFee)}</span>
          </div>
          <input
            id="fee"
            type="range"
            min={bounds.trainingFee.min}
            max={bounds.trainingFee.max}
            step={bounds.trainingFee.step}
            value={draftFee}
            onChange={(e) => setDraftFee(Number(e.target.value))}
            onPointerUp={() => commit(draftFee, draftReduction)}
            onKeyUp={() => commit(draftFee, draftReduction)}
            className="mt-2 w-full accent-[color:var(--warning)]"
          />
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="reduction" className="text-xs font-medium">
              Share of repeat visits training prevents
            </label>
            <span className="text-sm font-semibold tabular-nums">{percent(draftReduction)}</span>
          </div>
          <input
            id="reduction"
            type="range"
            min={bounds.churnReduction.min}
            max={bounds.churnReduction.max}
            step={bounds.churnReduction.step}
            value={draftReduction}
            onChange={(e) => setDraftReduction(Number(e.target.value))}
            onPointerUp={() => commit(draftFee, draftReduction)}
            onKeyUp={() => commit(draftFee, draftReduction)}
            className="mt-2 w-full accent-[color:var(--warning)]"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing in this data measures training effectiveness, so this stays a judgement call rather than a
            finding.
          </p>
        </div>
      </div>
    </div>
  );
}
