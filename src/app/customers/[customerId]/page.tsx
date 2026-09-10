import Link from "next/link";
import { notFound } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { RevenueTrendChart } from "@/components/charts";
import { DataAsOfLine } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { KpiCard } from "@/components/kpi-card";
import { OfferingBadge } from "@/components/opportunity-bits";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, dateLabel, decimal, money, percent } from "@/lib/format";
import {
  customerInvoices,
  customerMonthlySpend,
  customerServiceVisits,
  customerUnits,
} from "@/lib/metrics/customer-detail";
import { customerMetric } from "@/lib/metrics/customers";
import { opportunitiesForCustomer } from "@/lib/opportunities/engine";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const { customerId } = await params;
  const id = Number(customerId);
  const m = customerMetric(id);
  if (!m) notFound();

  const units = customerUnits(id);
  const visits = customerServiceVisits(id, 15);
  const invoices = customerInvoices(id, 15);
  const monthly = customerMonthlySpend(id, 24);
  const opportunities = opportunitiesForCustomer(id);

  return (
    <>
      <PageHeader
        back={{ href: "/customers", label: "Back to customers" }}
        title={m.customerName}
        lede={m.contact ? `Main contact ${m.contact.name}${m.contact.title ? `, ${m.contact.title}` : ""}.` : "No usable contact record on file for this account."}
        actions={
          opportunities.length > 0 ? (
            <Link
              href={`/opportunities/${id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <PhoneCall className="size-4" />
              Open call sheet
            </Link>
          ) : null
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {m.classLabel ?? "Unclassified"}
            </Badge>
            <span>#{m.customerNo}</span>
            {m.locationName && <span>{m.locationName}</span>}
            {m.contact?.phone && <span>{m.contact.phone}</span>}
            {m.contact?.email && <span>{m.contact.email}</span>}
            <DataAsOfLine />
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Revenue, 12 months" value={money(m.spend.t12)} sub="Posted invoices" />
        <KpiCard label="Service spend" value={money(m.spend.service12)} sub={`${percent(m.serviceShareOfWallet)} of recurring spend`} explain="Service share is measured against parts, service and rental. Machine purchases are excluded so one big sale does not distort it." />
        <KpiCard label="Machines owned" value={count(m.machinesOwned)} sub="From ownership records" />
        <KpiCard label="Work orders, 12 mo" value={count(m.service.workOrders12)} sub={`${count(m.service.proactiveVisits12)} planned`} />
        <KpiCard label="Labor hours" value={decimal(m.service.laborHours12, 1)} sub="Billed in the last year" />
        <KpiCard
          label="Days since a purchase"
          value={m.daysSinceLastPurchase != null ? count(m.daysSinceLastPurchase) : "--"}
          sub={m.avgPurchaseIntervalDays ? `Normally every ${Math.round(m.avgPurchaseIntervalDays)} days` : "No pattern yet"}
          tone={
            m.daysSinceLastPurchase != null && m.avgPurchaseIntervalDays != null && m.daysSinceLastPurchase > m.avgPurchaseIntervalDays * 2.5
              ? "warning"
              : "default"
          }
        />
      </section>

      {opportunities.length > 0 && (
        <section className="mt-4">
          <Card>
            <CardContent>
              <SectionHeading
                title="What to pitch them"
                hint="Full reasoning, math and talk track on the call sheet"
                action={
                  <Link href={`/opportunities/${id}`} className="text-sm text-primary hover:underline">
                    Open call sheet
                  </Link>
                }
              />
              <div className="flex flex-wrap gap-2">
                {opportunities.map((o) => (
                  <div key={o.id} className="rounded-lg border px-3 py-2">
                    <OfferingBadge name={o.offering.name} />
                    <p className="mt-1 text-sm tabular-nums">
                      {o.estimate.annualRevenue != null ? `${money(o.estimate.annualRevenue)} per year` : "Not priced"}
                    </p>
                    <p className="max-w-xs text-xs text-muted-foreground">{o.reason}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent>
            <SectionHeading title="What they spend, by month" hint="Click a month to open those invoices" />
            {monthly.length > 0 ? (
              <RevenueTrendChart data={monthly} customerId={id} />
            ) : (
              <p className="text-sm text-muted-foreground">No posted invoices for this account.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading title="Their machines" hint="Ownership and warranty" />
            {units.length === 0 ? (
              <p className="text-sm text-muted-foreground">No machines on file.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {units.map((u) => (
                  <li key={u.unitId} className="rounded-md border p-2.5">
                    <p className="font-medium">{[u.year, u.make, u.model].filter(Boolean).join(" ") || u.stockNo}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.stockNo} &middot; bought {dateLabel(u.purchaseDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Warranty ends {dateLabel(u.warrantyEndDate)} &middot;{" "}
                      {u.workOrders > 0 ? `${count(u.workOrders)} work orders` : "never serviced here"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent>
            <SectionHeading title="Service history" hint="Planned versus reactive" />
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No work orders on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work order</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((v) => (
                      <TableRow key={v.invoiceDocId}>
                        <TableCell>
                          <Link href={`/invoices/${v.invoiceDocId}`} className="font-medium hover:underline">
                            {v.invoiceNo ?? v.invoiceDocId}
                          </Link>
                          <p className="text-xs text-muted-foreground">{dateLabel(v.activityDate)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.isProactive ? "secondary" : "outline"} className="font-normal">
                            {v.isProactive ? "Planned" : "Reactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{money(v.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading title="Invoices" hint="Most recent first" />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.invoiceDocId}>
                      <TableCell>
                        <Link href={`/invoices/${inv.invoiceDocId}`} className="font-medium hover:underline">
                          {inv.invoiceNo ?? inv.invoiceDocId}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {dateLabel(inv.activityDate)} &middot; {inv.invoiceType ?? "--"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal capitalize">
                          {inv.status ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{money(inv.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
