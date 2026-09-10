import Link from "next/link";
import { ArrowRight, PhoneCall } from "lucide-react";
import { CategoryBarChart, RevenueTrendChart } from "@/components/charts";
import { DataBanner } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, money, moneyCompact, percent } from "@/lib/format";
import { customerMetrics } from "@/lib/metrics/customers";
import { headlineKpis, monthlyRevenue, partsHealth, unitsByStockStatus } from "@/lib/metrics/overview";
import { buildOpportunities } from "@/lib/opportunities/engine";
import { filterOpportunities, summarize } from "@/lib/opportunities/select";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const kpis = headlineKpis();
  const trend = monthlyRevenue(24);
  const all = buildOpportunities();
  const pipeline = summarize(all);
  const dormant = summarize(filterOpportunities({ segment: "dormant" }));
  const parts = partsHealth();
  const stock = unitsByStockStatus();

  const topCustomers = [...customerMetrics().values()]
    .filter((m) => m.spend.t12 > 0)
    .sort((a, b) => b.spend.t12 - a.spend.t12)
    .slice(0, 8);

  const topOpportunities = all.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dealership overview"
        lede="How Perseus Equipment is performing, and where the sales team should go next. Revenue counts posted invoices only, so quotes and drafts never inflate a number."
        meta={<DataBanner />}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Posted revenue"
          value={moneyCompact(kpis.postedRevenue12)}
          sub="Trailing 12 months"
          explain="Total of finalized and archived invoices over the last twelve months. Quotes, drafts, voided and committed invoices are excluded."
          href="/invoices"
        />
        <KpiCard
          label="Invoices"
          value={count(kpis.invoiceCount12)}
          sub={`${count(kpis.activeCustomers12)} customers bought`}
          explain="Count of posted invoices in the last twelve months, and how many distinct customers they came from."
          href="/invoices"
        />
        <KpiCard
          label="Average invoice"
          value={money(kpis.avgInvoice12)}
          sub="Posted, last 12 months"
          explain="Posted revenue divided by posted invoice count. Machine sales pull this up, so read it alongside the revenue mix."
        />
        <KpiCard
          label="Service revenue"
          value={moneyCompact(kpis.serviceRevenue12)}
          sub={`${percent(kpis.postedRevenue12 > 0 ? kpis.serviceRevenue12 / kpis.postedRevenue12 : null)} of revenue`}
          explain="Revenue from work orders: any invoice typed as a work order or carrying a service segment."
          href="/service"
        />
        <KpiCard
          label="Open work orders"
          value={count(kpis.openWorkOrders)}
          sub="In the shop now"
          explain="Work orders sitting in a status the dealership treats as open, from SettingsWorkOrderStatus."
          href="/service"
          tone={kpis.openWorkOrders > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="In-stock machines"
          value={count(kpis.inStockUnits)}
          sub={`${moneyCompact(kpis.inStockRetail)} at retail`}
          explain="Units whose stock status marks them as on the lot, valued at BaseRetail."
          href="/inventory"
        />
      </section>

      {/* The headline the brief does not ask for and the one a sales manager wants. */}
      <section className="mt-4">
        <Card className="overflow-hidden border-primary/30 bg-primary/[0.04] py-0">
          <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PhoneCall className="size-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wide text-primary">Open opportunity</span>
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                {moneyCompact(pipeline.totalRevenue)}
              </p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Across {count(pipeline.pricedCustomers)} customers, each counted once at their largest
                estimate, priced from what comparable customers actually pay.{" "}
                {moneyCompact(pipeline.totalContribution)} of that is estimated contribution.{" "}
                {pipeline.customers > pipeline.pricedCustomers
                  ? `${count(pipeline.customers - pipeline.pricedCustomers)} more customers are worth a call but have too little to price against.`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
              <div className="rounded-md border bg-background/70 px-4 py-3">
                <p className="text-xs text-muted-foreground">Bought no new service this year</p>
                <p className="text-lg font-semibold tabular-nums">{count(dormant.customers)} customers</p>
                <p className="text-xs text-muted-foreground">{moneyCompact(dormant.totalRevenue)} of that pipeline</p>
              </div>
              <Link
                href="/opportunities"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Open the call list
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent>
            <SectionHeading
              title="Posted revenue by month"
              hint="Stacked by what the customer was buying. Click a month to see those invoices."
            />
            <RevenueTrendChart data={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading title="Top customers" hint="By posted revenue, trailing 12 months" />
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((m) => (
                    <TableRow key={m.customerId}>
                      <TableCell className="max-w-[190px]">
                        <Link href={`/customers/${m.customerId}`} className="font-medium hover:underline">
                          {m.customerName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {m.classLabel ?? "Unclassified"} &middot; {count(m.machinesOwned)} machines
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{moneyCompact(m.spend.t12)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent>
            <SectionHeading
              title="Highest value calls right now"
              hint="Ranked by estimated annual revenue. Every row opens a call sheet with the math."
            />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Pitch</TableHead>
                    <TableHead className="text-right">Worth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topOpportunities.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/opportunities/${o.customerId}`} className="font-medium hover:underline">
                          {o.customerName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{o.reason}</p>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="secondary" className="whitespace-nowrap font-normal">
                          {o.offering.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {o.estimate.annualRevenue != null ? money(o.estimate.annualRevenue) : "Not priced"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent>
              <SectionHeading title="Machines by stock status" hint="Click a bar for those units" />
              {stock.length > 0 ? (
                <CategoryBarChart
                  height={190}
                  data={stock.map((s) => ({
                    label: s.label,
                    count: s.count,
                    value: s.value,
                    href: `/inventory?status=${encodeURIComponent(s.label)}`,
                  }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">This database has no unit inventory table.</p>
              )}
            </CardContent>
          </Card>

          {parts && (
            <Card>
              <CardContent>
                <SectionHeading title="Parts stocking policy" hint="Coverage, not stock levels" />
                <p className="text-2xl font-semibold tabular-nums">
                  {percent(parts.catalogSize > 0 ? parts.withPolicy / parts.catalogSize : null)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {count(parts.withPolicy)} of {count(parts.catalogSize)} parts have a min or max stocking rule.{" "}
                  {count(parts.withoutPolicy)} have none.
                </p>
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{parts.basis}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
