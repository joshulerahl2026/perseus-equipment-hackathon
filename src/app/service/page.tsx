import Link from "next/link";
import { CategoryBarChart } from "@/components/charts";
import { DataBanner } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, dateLabel, decimal, hours, money, moneyCompact } from "@/lib/format";
import { blendedLaborRate } from "@/lib/metrics/customers";
import { churnLeaderboard, workOrders } from "@/lib/metrics/lists";
import { headlineKpis, technicianWorkload, workOrdersByStatus } from "@/lib/metrics/overview";
import { serviceCodeClassification } from "@/lib/services/codes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const params = await searchParams;
  const single = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const view = single("view") === "churn" ? "churn" : "orders";
  const status = single("status") ?? "all";

  const kpis = headlineKpis();
  const byStatus = workOrdersByStatus();
  const techs = technicianWorkload(8);
  const orders = workOrders({ status, limit: 60 });
  const churn = churnLeaderboard(20);
  const rate = blendedLaborRate();
  const codes = serviceCodeClassification();

  const churnHours = churn.reduce((acc, c) => acc + c.hours, 0);

  return (
    <>
      <PageHeader
        title="Service"
        lede="What the shop is working on, who is doing it, and where the repeat work is coming from."
        meta={<DataBanner />}
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Open work orders"
          value={count(kpis.openWorkOrders)}
          sub="In a status the shop treats as open"
          explain="Counted from SettingsWorkOrderStatus, so it follows the dealership's own definition of open."
          tone={kpis.openWorkOrders > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Service revenue"
          value={moneyCompact(kpis.serviceRevenue12)}
          sub="Posted, last 12 months"
          explain="Work order invoices only, posted statuses only."
        />
        <KpiCard
          label="Blended labor rate"
          value={rate != null ? money(rate) : "--"}
          sub="Derived, not assumed"
          explain="Total labor revenue divided by total labor hours across posted service segments. Used anywhere the app values technician time."
        />
        <KpiCard
          label="Hours lost to repeat visits"
          value={hours(churnHours)}
          sub={`Across ${count(churn.length)} accounts`}
          explain="Technician time on work orders that repeat the same service code on the same machine within 90 days."
          tone={churnHours > 0 ? "warning" : "default"}
        />
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent>
            <SectionHeading title="Work orders by status" hint="Click a bar to filter the list below" />
            {byStatus.length > 0 ? (
              <CategoryBarChart
                height={230}
                data={byStatus.map((s) => ({
                  label: s.label,
                  count: s.count,
                  value: s.value,
                  href: `/service?status=${encodeURIComponent(s.label)}`,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This database has no work order status table, so open work cannot be separated from closed.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading title="Technician workload" hint="Hours logged in the last twelve months" />
            {techs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No technician time entries in this database.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technician</TableHead>
                    <TableHead className="text-right">Work orders</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {techs.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(t.workOrders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{decimal(t.hours, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { id: "orders", label: "Work orders" },
          { id: "churn", label: "Repeat visit audit" },
        ].map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === "orders" ? "/service" : "/service?view=churn"}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              view === tab.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {view === "churn" ? (
        <Card>
          <CardContent>
            <SectionHeading
              title="Where repeat work is coming from"
              hint="Same machine, same service code, inside 90 days. This is the evidence behind every training recommendation."
            />
            {churn.length === 0 ? (
              <EmptyState
                title="No repeat visits detected"
                body="No customer has a work order repeating the same service code on the same machine within 90 days."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Repeat visits</TableHead>
                      <TableHead className="text-right">Per machine</TableHead>
                      <TableHead className="text-right">Technician hours</TableHead>
                      <TableHead className="text-right">They paid</TableHead>
                      <TableHead className="text-right">Days late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churn.map((c) => (
                      <TableRow key={c.customerId}>
                        <TableCell>
                          <Link href={`/opportunities/${c.customerId}`} className="font-medium hover:underline">
                            {c.customerName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {c.classLabel ?? "Unclassified"} &middot; {count(c.machines)} machines
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{count(c.visits)}</TableCell>
                        <TableCell className="text-right tabular-nums">{decimal(c.perMachine, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{decimal(c.hours, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(c.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums">{count(c.slipDays)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Planned service codes in this database: {codes.proactive.join(", ") || "none detected"}. Everything
              else is treated as reactive repair.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <FilterBar
              resetHref="/service"
              filters={[
                {
                  name: "status",
                  label: "Work order status",
                  value: status,
                  options: [
                    { value: "all", label: "All statuses" },
                    ...byStatus.map((s) => ({ value: s.label, label: `${s.label} (${s.count})` })),
                  ],
                },
              ]}
            />
          </Card>

          {orders.length === 0 ? (
            <EmptyState title="No work orders match" body="Nothing in the shop matches this status filter." />
          ) : (
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.invoiceDocId}>
                        <TableCell>
                          <Link href={`/invoices/${o.invoiceDocId}`} className="font-medium hover:underline">
                            {o.invoiceNo ?? o.invoiceDocId}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {dateLabel(o.activityDate)} &middot; {o.unitStockNo ?? "no machine"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Link href={`/customers/${o.customerId}`} className="hover:underline">
                            {o.customerName ?? "--"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={o.isOpen ? "default" : "outline"} className="font-normal capitalize">
                            {o.statusLabel ?? "--"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{o.technician ?? "Unassigned"}</TableCell>
                        <TableCell className="text-right tabular-nums">{decimal(o.laborHours, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(o.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
