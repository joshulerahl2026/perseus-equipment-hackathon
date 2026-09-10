import Link from "next/link";
import { ArrowUpRight, CalendarClock, Phone } from "lucide-react";
import { DataBanner } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KpiCard } from "@/components/kpi-card";
import { ConfidenceBadge, OfferingBadge } from "@/components/opportunity-bits";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, money, moneyCompact } from "@/lib/format";
import { RULE_LABELS, RuleId } from "@/lib/opportunities/engine";
import {
  CallListFilters,
  DEFAULT_FILTERS,
  SEGMENTS,
  SegmentId,
  customerClasses,
  filterOpportunities,
  segmentCounts,
  summarize,
} from "@/lib/opportunities/select";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parseFilters(params: Record<string, string | string[] | undefined>): CallListFilters {
  const single = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const segment = single("segment");
  const rule = single("rule");
  const machines = single("machines");
  const sort = single("sort");

  return {
    segment: segment && segment in SEGMENTS ? (segment as SegmentId) : DEFAULT_FILTERS.segment,
    rule: rule && rule in RULE_LABELS ? (rule as RuleId) : "all",
    classLabel: single("class") ?? "all",
    machines: (["all", "0", "1-2", "3-5", "6+"] as const).includes(machines as never)
      ? (machines as CallListFilters["machines"])
      : "all",
    search: single("q") ?? "",
    sort: (["value", "contribution", "dormancy", "name"] as const).includes(sort as never)
      ? (sort as CallListFilters["sort"])
      : "value",
  };
}

export default async function CallListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const params = await searchParams;
  const filters = parseFilters(params);
  const rows = filterOpportunities(filters);
  const summary = summarize(rows);
  const counts = segmentCounts();
  const segment = SEGMENTS[filters.segment];

  return (
    <>
      <PageHeader
        title="Call list"
        lede="Who to contact, which service to pitch, and what it is worth. Every recommendation is built from this customer's own record and priced against comparable customers, so it can be explained on the phone."
        meta={<DataBanner />}
      />

      {/* Segments: the requested dormant list is the default. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(SEGMENTS) as SegmentId[]).map((id) => {
          const active = filters.segment === id;
          const query = new URLSearchParams();
          if (id !== DEFAULT_FILTERS.segment) query.set("segment", id);
          if (filters.rule !== "all") query.set("rule", filters.rule);
          if (filters.classLabel !== "all") query.set("class", filters.classLabel);
          return (
            <Link
              key={id}
              href={`/opportunities${query.size ? `?${query.toString()}` : ""}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/40 hover:bg-secondary",
              )}
            >
              {SEGMENTS[id].label}
              <span className={cn("ml-1.5 tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {count(counts[id])}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{segment.description}</p>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Estimated annual revenue"
          value={moneyCompact(summary.totalRevenue)}
          sub={`${count(summary.pricedCustomers)} of ${count(summary.customers)} customers priced`}
          explain={
            "Each customer counted once, at their largest estimate. Several rules can fire on one account and reach for the same wallet, so adding every recommendation would book the same dollars twice." +
            (summary.customersWithOverlap > 0
              ? ` ${summary.customersWithOverlap} customers in this view carry more than one priced recommendation.`
              : "") +
            " Recommendations without enough comparable customers to price are excluded."
          }
          tone="accent"
        />
        <KpiCard
          label="Estimated contribution"
          value={moneyCompact(summary.totalContribution)}
          sub="Parts margin plus labor revenue"
          explain="Contribution, not net profit: this database has parts cost but no technician wage cost, so labor is counted as revenue."
        />
        <KpiCard
          label="Customers to call"
          value={count(summary.customers)}
          sub="Distinct accounts in this view"
          explain="A customer can appear more than once when several different services fit them."
        />
        <KpiCard
          label="Not priced"
          value={count(summary.unquantified)}
          sub="Too few comparable customers"
          explain="These are still worth a call, but there are not enough similar customers to put a defensible number on them."
          tone={summary.unquantified > 0 ? "warning" : "default"}
        />
      </section>

      <Card className="mb-4">
        <CardContent>
          <FilterBar
            search={{ name: "q", value: filters.search }}
            searchPlaceholder="Customer name or number"
            resetHref="/opportunities"
            filters={[
              {
                name: "rule",
                label: "Why they qualify",
                value: filters.rule,
                options: [
                  { value: "all", label: "Any reason" },
                  ...(Object.keys(RULE_LABELS) as RuleId[]).map((r) => ({ value: r, label: RULE_LABELS[r] })),
                ],
              },
              {
                name: "class",
                label: "Customer type",
                value: filters.classLabel,
                options: [
                  { value: "all", label: "All types" },
                  ...customerClasses().map((c) => ({ value: c, label: c })),
                ],
              },
              {
                name: "machines",
                label: "Machines owned",
                value: filters.machines,
                options: [
                  { value: "all", label: "Any" },
                  { value: "0", label: "None" },
                  { value: "1-2", label: "1 to 2" },
                  { value: "3-5", label: "3 to 5" },
                  { value: "6+", label: "6 or more" },
                ],
              },
              {
                name: "sort",
                label: "Sort by",
                value: filters.sort,
                options: [
                  { value: "value", label: "Revenue" },
                  { value: "contribution", label: "Contribution" },
                  { value: "dormancy", label: "Longest quiet" },
                  { value: "name", label: "Customer name" },
                ],
              },
            ]}
          />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="No customers match these filters"
          body="Nothing in this segment fits the current filters. Try clearing the customer type or reason, or switch to every opportunity."
          action={
            <Link href="/opportunities" className="mt-2 text-sm text-primary hover:underline">
              Reset the call list
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Customer</TableHead>
                  <TableHead className="min-w-[260px]">Pitch and why</TableHead>
                  <TableHead className="min-w-[180px]">Approach</TableHead>
                  <TableHead className="text-right">Worth per year</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} className="align-top">
                    <TableCell>
                      <Link href={`/opportunities/${o.customerId}`} className="font-medium hover:underline">
                        {o.customerName}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {o.classLabel ?? "Unclassified"} &middot; {count(o.machinesOwned)} machine
                        {o.machinesOwned === 1 ? "" : "s"} &middot; #{o.customerNo}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{o.dormancy.label}</p>
                    </TableCell>

                    <TableCell>
                      <OfferingBadge name={o.offering.name} />
                      <p className="mt-1.5 max-w-md text-xs text-muted-foreground">{o.reason}</p>
                    </TableCell>

                    <TableCell className="text-xs">
                      <p className="font-medium">{o.approach.angle}</p>
                      {o.approach.contact ? (
                        <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                          <Phone className="size-3" />
                          {o.approach.contact.name}
                        </p>
                      ) : (
                        <p className="mt-1 text-[color:var(--warning)]">No usable contact</p>
                      )}
                      {o.approach.callWindow && (
                        <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                          <CalendarClock className="size-3" />
                          Call by {o.approach.callWindow.monthLabel}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {o.estimate.annualRevenue != null ? (
                        <>
                          <p className="font-semibold tabular-nums">{money(o.estimate.annualRevenue)}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {money(o.estimate.contribution)} contribution
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not priced</p>
                      )}
                      <div className="mt-1.5 flex justify-end">
                        <ConfidenceBadge confidence={o.estimate.confidence} />
                      </div>
                    </TableCell>

                    <TableCell>
                      <Link
                        href={`/opportunities/${o.customerId}`}
                        aria-label={`Open call sheet for ${o.customerName}`}
                        className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
