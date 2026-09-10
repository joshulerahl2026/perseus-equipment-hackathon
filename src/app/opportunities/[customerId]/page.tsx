import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Mail, Phone, TrendingDown, Wrench } from "lucide-react";
import { AssumptionsPanel } from "@/components/assumptions-panel";
import { PeerComparisonChart } from "@/components/charts";
import { DataAsOfLine } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { ConfidenceBadge, MathPanel, OfferingBadge } from "@/components/opportunity-bits";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { TalkTrack } from "@/components/talk-track";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, dateLabel, days, decimal, hours, money, percent } from "@/lib/format";
import {
  customerComebacks,
  customerInvoices,
  customerParts,
  customerServiceVisits,
  customerUnits,
} from "@/lib/metrics/customer-detail";
import { blendedLaborRate, customerMetric, slipBasisLabel } from "@/lib/metrics/customers";
import { Opportunity, buildOpportunities } from "@/lib/opportunities/engine";
import { ASSUMPTION_BOUNDS, defaultAssumptions } from "@/lib/opportunities/training";

export const dynamic = "force-dynamic";

function OpportunityCard({ o }: { o: Opportunity }) {
  const showPeerChart = o.peer != null && o.cohort.stat.confident;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OfferingBadge name={o.offering.name} />
              <span className="text-xs text-muted-foreground">{o.ruleLabel}</span>
            </div>
            <p className="mt-2 text-sm">{o.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.offering.customerBenefit}</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            {o.estimate.annualRevenue != null ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">{money(o.estimate.annualRevenue)}</p>
                <p className="text-xs text-muted-foreground">
                  per year, {money(o.estimate.contribution)} contribution
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not priced</p>
            )}
            {/* The badge for an unpriced row says "Not priced" too, so it
                would only repeat the line above it. */}
            {o.estimate.annualRevenue != null && (
              <div className="mt-1.5 flex sm:justify-end">
                <ConfidenceBadge confidence={o.estimate.confidence} />
              </div>
            )}
          </div>
        </div>

        {showPeerChart && (
          <div>
            <SectionHeading
              title="Against comparable customers"
              hint={`${o.cohort.description}. Annual service spend${o.peer!.scaled ? ", sized for their fleet" : ""}.`}
            />
            <PeerComparisonChart
              theirs={o.peer!.theirs}
              median={o.peer!.median}
              p75={o.peer!.p75}
              unitLabel="a year"
            />
          </div>
        )}

        <TalkTrack lines={o.talkTrack} customerName={o.customerName} />

        {o.payback && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Technician hours lost to repeat visits</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{hours(o.payback.churnHours)}</p>
              <p className="text-xs text-muted-foreground">
                {o.payback.churnCostToDealer != null
                  ? `${money(o.payback.churnCostToDealer)} of shop capacity`
                  : "Labor rate unavailable"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">What the customer paid on repeats</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{money(o.payback.customerChurnSpend)}</p>
              <p className="text-xs text-muted-foreground">
                {money(o.payback.customerSaving)} saved at {percent(o.payback.reduction)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Payback on the training fee</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {o.payback.paybackMonths != null ? `${decimal(o.payback.paybackMonths, 1)} months` : "--"}
              </p>
              <p className="text-xs text-muted-foreground">
                {o.payback.netFirstYearToCustomer >= 0
                  ? `${money(o.payback.netFirstYearToCustomer)} net to them in year one`
                  : `Costs them ${money(Math.abs(o.payback.netFirstYearToCustomer))} in year one`}
              </p>
            </div>
          </div>
        )}

        <MathPanel rows={o.math} />

        {o.retrospective && o.retrospective.wouldHaveCost != null && (
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2.5">
              <h3 className="text-sm font-semibold">What last year would have been worth</h3>
              <p className="text-xs text-muted-foreground">
                Their actual twelve months against the same year with this service in place.
              </p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What happened</p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Service spend</dt>
                    <dd className="tabular-nums">{money(o.retrospective.actual.serviceSpend)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Reactive repairs</dt>
                    <dd className="tabular-nums">{money(o.retrospective.actual.reactiveSpend)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Work orders</dt>
                    <dd className="tabular-nums">{count(o.retrospective.actual.workOrders)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Days past the {slipBasisLabel()}</dt>
                    <dd className="tabular-nums">{days(o.retrospective.actual.downtimeDays)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  With {o.offering.name.toLowerCase()}
                </p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">It would have cost them</dt>
                    <dd className="tabular-nums">{money(o.retrospective.wouldHaveCost)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">On top of what they already spend</dt>
                    <dd className="tabular-nums">{money(o.retrospective.incrementalCost)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Contribution we did not book</dt>
                    <dd className="tabular-nums">{money(o.retrospective.missedContribution)}</dd>
                  </div>
                  {/* Only meaningful when there is reactive spend to avoid. */}
                  {o.retrospective.actual.reactiveSpend > 0 && (
                    <>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">
                          Repairs avoided at {percent(o.retrospective.avoidableShare)}
                        </dt>
                        <dd className="tabular-nums">{money(o.retrospective.avoidableReactive)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-t pt-1.5">
                        <dt className="text-muted-foreground">Their net on those two</dt>
                        <dd className="tabular-nums">{money(o.retrospective.customerNetPosition)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            </div>
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              Spend, work order counts and downtime are measured. The avoidable share is an assumption, so the
              customer&rsquo;s side of the trade is a range rather than a promise.{" "}
              {o.retrospective.notes.join(" ")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function CallSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const { customerId } = await params;
  const search = await searchParams;
  const id = Number(customerId);
  const metrics = customerMetric(id);
  if (!metrics) notFound();

  const laborRate = blendedLaborRate();
  const defaults = defaultAssumptions(laborRate);
  const single = (key: string) => {
    const v = search[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const fee = Number(single("fee")) || defaults.trainingFee;
  const reduction = Number(single("reduction")) || defaults.churnReduction;

  const opportunities = buildOpportunities({ trainingFee: fee, churnReduction: reduction }).filter(
    (o) => o.customerId === id,
  );
  const units = customerUnits(id);
  const visits = customerServiceVisits(id, 12);
  const comebacks = customerComebacks(id);
  const invoices = customerInvoices(id, 10);
  const parts = customerParts(id, 8);
  const primary = opportunities[0];
  const hasTraining = opportunities.some((o) => o.payback != null);

  return (
    <>
      <PageHeader
        back={{ href: "/opportunities", label: "Back to the call list" }}
        title={metrics.customerName}
        lede={
          opportunities.length > 0
            ? `${opportunities.length} recommendation${opportunities.length === 1 ? "" : "s"} for this account, ranked by what they are worth.`
            : "No recommendation qualifies for this account right now. Their record is below."
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {metrics.classLabel ?? "Unclassified"}
            </Badge>
            <span>#{metrics.customerNo}</span>
            <span>{count(metrics.machinesOwned)} machines owned</span>
            {metrics.locationName && <span>{metrics.locationName}</span>}
            <span>Last purchase {dateLabel(metrics.invoices.lastDate)}</span>
            <DataAsOfLine />
          </div>
        }
      />

      <section className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <SectionHeading title="How to approach it" hint="Built from this account's own record" />
            {primary ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Angle</p>
                  <p className="mt-1 text-sm font-medium">{primary.approach.angle}</p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Lead with
                  </p>
                  <p className="mt-1 text-sm">{primary.approach.leadWith}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who to contact</p>
                  {primary.approach.contact ? (
                    <div className="mt-1 text-sm">
                      <p className="font-medium">{primary.approach.contact.name}</p>
                      {primary.approach.contact.title && (
                        <p className="text-xs text-muted-foreground">{primary.approach.contact.title}</p>
                      )}
                      {primary.approach.contact.phone && (
                        <p className="mt-1 flex items-center gap-1.5">
                          <Phone className="size-3.5 text-muted-foreground" />
                          {primary.approach.contact.phone}
                        </p>
                      )}
                      {primary.approach.contact.email && (
                        <p className="flex items-center gap-1.5">
                          <Mail className="size-3.5 text-muted-foreground" />
                          {primary.approach.contact.email}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-[color:var(--warning)]">
                      {primary.approach.contactGap ?? "No usable contact record."}
                    </p>
                  )}
                  {primary.approach.contact && primary.approach.contactGap && (
                    <p className="mt-1 text-xs text-[color:var(--warning)]">{primary.approach.contactGap}</p>
                  )}
                  {primary.approach.callWindow && (
                    <>
                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        When to call
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm">
                        <CalendarClock className="size-3.5 text-muted-foreground" />
                        By {primary.approach.callWindow.monthLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">{primary.approach.callWindow.reason}</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing to pitch means nothing to plan. Their history is below if you want to look anyway.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading title="Their year with us" hint="Trailing twelve months, posted only" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Total spend</dt>
                <dd className="tabular-nums">{money(metrics.spend.t12)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="tabular-nums">{money(metrics.spend.service12)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Parts and machines</dt>
                <dd className="tabular-nums">{money(metrics.spend.parts12)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Rental</dt>
                <dd className="tabular-nums">{money(metrics.spend.rental12)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2">
                <dt className="text-muted-foreground">Service share of recurring spend</dt>
                <dd className="tabular-nums">{percent(metrics.serviceShareOfWallet)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Planned service visits</dt>
                <dd className="tabular-nums">{count(metrics.service.proactiveVisits12)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reactive repairs</dt>
                <dd className="tabular-nums">{count(metrics.service.reactiveVisits12)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {hasTraining && (
        <section className="mb-5">
          <AssumptionsPanel fee={fee} reduction={reduction} bounds={ASSUMPTION_BOUNDS} />
        </section>
      )}

      <section className="space-y-4">
        {opportunities.map((o) => (
          <OpportunityCard key={o.id} o={o} />
        ))}
      </section>

      {comebacks.length > 0 && (
        <section className="mt-6">
          <Card>
            <CardContent>
              <SectionHeading
                title="The repeat visits behind that claim"
                hint="Same machine, same service code, inside 90 days. Every row is a real work order."
              />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return visit</TableHead>
                      <TableHead>Machine</TableHead>
                      <TableHead>Service code</TableHead>
                      <TableHead className="text-right">Days after</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Invoiced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comebacks.map((c) => (
                      <TableRow key={c.invoiceDocId}>
                        <TableCell>
                          <Link href={`/invoices/${c.invoiceDocId}`} className="font-medium hover:underline">
                            {c.invoiceNo ?? c.invoiceDocId}
                          </Link>
                          <p className="text-xs text-muted-foreground">{dateLabel(c.activityDate)}</p>
                        </TableCell>
                        <TableCell className="text-sm">{c.unitStockNo ?? "--"}</TableCell>
                        <TableCell className="text-sm">{c.serviceCode ?? "--"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{count(c.daysApart)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{decimal(c.hours, 1)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{money(c.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent>
            <SectionHeading title="Their machines" hint="What they own and whether we service it" />
            {units.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No machine ownership records for this account. They may be a parts-only or rental customer.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead>Bought</TableHead>
                      <TableHead>Warranty ends</TableHead>
                      <TableHead className="text-right">Work orders</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((u) => (
                      <TableRow key={u.unitId}>
                        <TableCell>
                          <p className="font-medium">
                            {[u.year, u.make, u.model].filter(Boolean).join(" ") || u.stockNo}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {u.category ?? "Machine"} &middot; {u.stockNo}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">{dateLabel(u.purchaseDate)}</TableCell>
                        <TableCell className="text-sm">{dateLabel(u.warrantyEndDate)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {u.workOrders === 0 ? (
                            <span className="text-[color:var(--warning)]">Never serviced</span>
                          ) : (
                            <>
                              {count(u.workOrders)}
                              <p className="text-xs text-muted-foreground">{money(u.serviceSpend)}</p>
                            </>
                          )}
                        </TableCell>
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
            <SectionHeading title="Recent service history" hint="Planned work versus reactive repair" />
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No work orders on file for this account, which is itself the opportunity.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work order</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
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
                          <p className="text-xs text-muted-foreground">
                            {dateLabel(v.activityDate)} &middot; {v.unitStockNo ?? "no machine"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={v.isProactive ? "secondary" : "outline"}
                            className="whitespace-nowrap font-normal"
                          >
                            {v.isProactive ? "Planned" : "Reactive"}
                          </Badge>
                          <p className="mt-0.5 text-xs text-muted-foreground">{v.serviceCodes ?? "--"}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{decimal(v.laborHours, 1)}</TableCell>
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
            <SectionHeading title="Recent invoices" hint="Every document, posted or not" />
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

        <Card>
          <CardContent>
            <SectionHeading title="What they buy at the counter" hint="Top parts by revenue, all time" />
            {parts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parts purchases on file.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parts.map((p) => (
                      <TableRow key={p.partId}>
                        <TableCell>
                          <p className="font-medium">{p.description || p.partNo}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.partNo} &middot; last {dateLabel(p.lastPurchase)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{count(p.qty)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{money(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {metrics.spend.service12 === 0 && metrics.machinesOwned > 0 && (
        <p className="mt-6 flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <TrendingDown className="mt-0.5 size-4 shrink-0" />
          This account bought machines from us and spent nothing on service in the last twelve months. Whoever is
          maintaining them, it is not our shop.
        </p>
      )}
      {metrics.churn.openWorkOrders > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Wrench className="mt-0.5 size-4 shrink-0" />
          They have {count(metrics.churn.openWorkOrders)} work order
          {metrics.churn.openWorkOrders === 1 ? "" : "s"} open in the shop right now, which is a reason to call
          today rather than next month.
        </p>
      )}
    </>
  );
}
