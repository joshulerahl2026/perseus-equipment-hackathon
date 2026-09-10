"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, moneyCompact, monthLabel } from "@/lib/format";

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11 };

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {children}
    </div>
  );
}

type MonthlyPoint = { month: string; service: number; parts: number; rental: number; total: number };

/**
 * Monthly posted revenue. Clicking a month opens that month's invoices, scoped
 * to one customer when the chart is showing a single account.
 */
export function RevenueTrendChart({ data, customerId }: { data: MonthlyPoint[]; customerId?: number }) {
  const router = useRouter();
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
          onClick={(state) => {
            const month = state?.activeLabel;
            if (typeof month !== "string") return;
            const params = new URLSearchParams({ month });
            if (customerId != null) params.set("customer", String(customerId));
            router.push(`/invoices?${params.toString()}`);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => moneyCompact(Number(v))} tick={AXIS} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as MonthlyPoint;
              return (
                <TooltipShell>
                  <p className="mb-1 font-medium">{monthLabel(String(label))}</p>
                  <p>Service {money(point.service)}</p>
                  <p>Parts and machines {money(point.parts)}</p>
                  <p>Rental {money(point.rental)}</p>
                  <p className="mt-1 border-t pt-1 font-medium">Total {money(point.total)}</p>
                  <p className="mt-1 text-muted-foreground">Click to see these invoices</p>
                </TooltipShell>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
          <Bar dataKey="service" name="Service" stackId="a" fill="var(--chart-1)" className="cursor-pointer" />
          <Bar dataKey="parts" name="Parts and machines" stackId="a" fill="var(--chart-2)" className="cursor-pointer" />
          <Bar dataKey="rental" name="Rental" stackId="a" fill="var(--chart-3)" radius={[3, 3, 0, 0]} className="cursor-pointer" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CategoryPoint = { label: string; count: number; value: number; href?: string };

/** Horizontal category breakdown, drilling into the rows behind each bar. */
export function CategoryBarChart({
  data,
  metric = "count",
  height = 260,
}: {
  data: CategoryPoint[];
  metric?: "count" | "value";
  height?: number;
}) {
  const router = useRouter();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (metric === "value" ? moneyCompact(Number(v)) : String(v))}
          />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={120} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as CategoryPoint;
              return (
                <TooltipShell>
                  <p className="font-medium capitalize">{point.label}</p>
                  <p>{point.count} records</p>
                  <p>{money(point.value)}</p>
                  {point.href && <p className="mt-1 text-muted-foreground">Click to drill in</p>}
                </TooltipShell>
              );
            }}
          />
          <Bar
            dataKey={metric}
            radius={[0, 3, 3, 0]}
            onClick={(point: unknown) => {
              const href = (point as CategoryPoint)?.href;
              if (href) router.push(href);
            }}
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.label}
                fill={`var(--chart-${(i % 5) + 1})`}
                className={entry.href ? "cursor-pointer" : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The peer comparison on the call sheet: this customer against the cohort
 * median and the cohort's top quartile.
 */
export function PeerComparisonChart({
  theirs,
  median,
  p75,
  unitLabel,
}: {
  theirs: number;
  median: number;
  p75: number;
  unitLabel: string;
}) {
  const data = [
    { label: "This customer", value: theirs, tone: "var(--chart-5)" },
    { label: "Cohort median", value: median, tone: "var(--chart-1)" },
    { label: "Cohort top quartile", value: p75, tone: "var(--chart-2)" },
  ];
  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={130} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipShell>
                  <p className="font-medium">{payload[0].payload.label}</p>
                  <p>
                    {money(Number(payload[0].value))} {unitLabel}
                  </p>
                </TooltipShell>
              );
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 3, 3, 0]}
            barSize={26}
            // A customer who spends nothing is the whole point of several of
            // these comparisons, and a zero-width bar reads as missing data
            // rather than as zero. Give it a sliver so the row and its label
            // still render.
            minPointSize={2}
            label={{
              position: "right",
              formatter: (v) => money(Number(v)),
              fontSize: 11,
              fill: "var(--foreground)",
            }}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.tone} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
