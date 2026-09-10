import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { DatabaseMissing } from "@/components/database-missing";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable, getDb } from "@/lib/db";
import { count, dateLabel, decimal, hours, money, percent } from "@/lib/format";
import { blendedLaborRate, medianWorkOrderValue, slipBasisColumn } from "@/lib/metrics/customers";
import { fleetElasticity } from "@/lib/metrics/cohorts";
import { contributionModel, workOrderBenchmarks } from "@/lib/metrics/economics";
import { dataAsOf, schemaReport } from "@/lib/schema";
import { serviceCodeClassification } from "@/lib/services/codes";

export const dynamic = "force-dynamic";

const CAPABILITY_COPY: Record<string, string> = {
  core: "Customers and invoice headers: nothing works without these.",
  invoiceLines: "Invoice line items, for drill-downs and revenue mix.",
  partsSales: "Parts sold on invoices.",
  partsCost: "Parts cost, which is what makes gross margin computable.",
  partsCatalog: "The parts catalog.",
  partsPolicy: "Min and max stocking rules per location.",
  units: "Machine inventory.",
  unitOwnership: "Which customer owns which machine.",
  warranty: "Warranty end dates, for coverage recommendations.",
  serviceSegments: "Service codes and labor, which drive every service rule.",
  technicianTime: "Technician time entries, used to price repeat work.",
  schedule: "Required against actual dates, used for downtime.",
  workOrderStatus: "The dealership's own definition of an open work order.",
  customerClass: "Trade class, used to build peer cohorts.",
  contacts: "Contact records for the call list.",
  payments: "Payment records.",
};

export default function DiagnosticsPage() {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const { path, isSample } = getDb();
  const report = schemaReport();
  const codes = serviceCodeClassification();
  const contribution = contributionModel();
  const elasticity = fleetElasticity();
  const benchmarks = workOrderBenchmarks();
  const rate = blendedLaborRate();

  const capabilities = Object.entries(report.capabilities);
  const available = capabilities.filter(([, ok]) => ok).length;

  return (
    <>
      <PageHeader
        title="Data source"
        lede="Which file the app is reading, which parts of the schema it found, and the figures it derived from the data rather than assuming."
      />

      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <SectionHeading title="Database in use" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">File</dt>
                <dd className="max-w-[60%] truncate text-right font-mono text-xs" title={path}>
                  {path}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Source</dt>
                <dd className={isSample ? "text-[color:var(--warning)]" : "text-[color:var(--positive)]"}>
                  {isSample ? "Generated sample" : "Dealership export"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Data as of</dt>
                <dd>{dateLabel(dataAsOf())}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Tables found</dt>
                <dd className="tabular-nums">{count(Object.keys(report.tables).length)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Date format</dt>
                <dd className="font-mono text-xs">{report.dateFormat.sample ?? "none"}</dd>
              </div>
            </dl>
            {isSample && (
              <div className="mt-4 rounded-md border border-[color:var(--warning)]/40 bg-[color:var(--warning-soft)] p-3 text-xs">
                <p className="font-medium">To use the real data</p>
                <p className="mt-1 text-foreground/80">
                  Put <code>perseus_equipment_database.db</code> at the repository root and reload. No code change
                  is needed, and the sample is ignored as soon as the real file is present.
                </p>
              </div>
            )}
            {!report.dateFormat.recognized && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-[color:var(--danger-soft)] p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <p>
                  Dates in this file do not start with a YYYY-MM-DD prefix. Every trailing-twelve-month figure
                  compares dates as text, so those numbers cannot be trusted until the format is handled.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading
              title="Figures derived from this data"
              hint="Everything here is measured, not hardcoded"
            />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Blended labor rate</dt>
                <dd className="tabular-nums">{rate != null ? money(rate) : "unavailable"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Parts gross margin</dt>
                <dd className="tabular-nums">
                  {contribution.partsMarginRate != null ? percent(contribution.partsMarginRate) : "no cost column"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Labor share of service revenue</dt>
                <dd className="tabular-nums">{percent(contribution.laborShareOfService)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  Parts share of service revenue
                  {!contribution.partsShareMeasured && " (inferred)"}
                </dt>
                <dd className="tabular-nums">{percent(contribution.partsShareOfService)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Tax, supplies and other pass-through</dt>
                <dd className="tabular-nums">{percent(contribution.passThroughShareOfService)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Contribution rate applied</dt>
                <dd className="tabular-nums">{percent(contribution.contributionRate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Fleet elasticity of service spend</dt>
                <dd className="tabular-nums">
                  {decimal(elasticity.value, 2)}{" "}
                  <span className="text-muted-foreground">
                    {elasticity.fitted != null && Math.abs(elasticity.fitted - elasticity.value) > 0.005
                      ? `applied, ${decimal(elasticity.fitted, 2)} fitted over ${count(elasticity.n)} customers and clamped`
                      : `over ${count(elasticity.n)} customers`}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Downtime measured against</dt>
                <dd>WorkOrderSchedule.{slipBasisColumn()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Median work order</dt>
                <dd className="tabular-nums">{money(medianWorkOrderValue())}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Median planned service visit</dt>
                <dd className="tabular-nums">{money(benchmarks.medianProactiveValue)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Hours in a planned visit</dt>
                <dd className="tabular-nums">{hours(benchmarks.medianProactiveLaborHours)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Inspection priced per machine</dt>
                <dd className="tabular-nums">
                  {money(
                    rate != null && benchmarks.medianProactiveLaborHours != null
                      ? rate * benchmarks.medianProactiveLaborHours
                      : null,
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reactive repair per machine per year</dt>
                <dd className="tabular-nums">{money(benchmarks.medianReactiveSpendPerMachine)}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{contribution.explanation}</p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <SectionHeading
              title="Service code classification"
              hint="How the app decides what counts as buying a new service"
            />
            <p className="text-sm">
              <span className="font-medium">Planned:</span>{" "}
              {codes.proactive.length ? codes.proactive.join(", ") : "none detected"}
            </p>
            <p className="mt-2 text-sm">
              <span className="font-medium">Reactive:</span>{" "}
              {codes.reactive.length ? codes.reactive.slice(0, 20).join(", ") : "none detected"}
              {codes.reactive.length > 20 && ` and ${codes.reactive.length - 20} more`}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Codes are classified by pattern matching on whatever this database contains, since service codes
              differ between dealerships. A planned visit means the customer bought maintenance, an inspection,
              training or coverage rather than a repair.
            </p>
            {codes.proactive.length === 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-[color:var(--warning)]/40 bg-[color:var(--warning-soft)] p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--warning)]" />
                <p>
                  No planned service codes matched, so every work order is being treated as reactive and the
                  dormant list will include everyone with service history. Check the codes above against how this
                  dealership names planned work.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionHeading title="Support ticket tables" hint="Preferred over service-data proxies if present" />
            {report.supportTableCandidates.length > 0 ? (
              <>
                <p className="text-sm">Found tables that look like support records:</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {report.supportTableCandidates.map((t) => (
                    <li key={t} className="font-mono text-xs">
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  The training model currently measures support churn through repeat work orders. These tables
                  would be a more direct measure and should take priority.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No ticket, call log or case tables in this database. Support churn is therefore measured through
                service data: repeat visits on the same machine, low-value visit traffic, estimate overruns,
                schedule slippage and quotes that never posted.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent>
          <SectionHeading
            title="Schema coverage"
            hint={`${available} of ${capabilities.length} capabilities available in this file`}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Capability</TableHead>
                  <TableHead>What it powers</TableHead>
                  <TableHead>Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capabilities.map(([capability, ok]) => {
                  const gaps = report.gaps.filter((g) => g.capability === capability);
                  return (
                    <TableRow key={capability}>
                      <TableCell>
                        {ok ? (
                          <CheckCircle2 className="size-4 text-[color:var(--positive)]" />
                        ) : (
                          <XCircle className="size-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{capability}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{CAPABILITY_COPY[capability]}</TableCell>
                      <TableCell className="text-xs text-destructive">
                        {gaps.map((g) => `${g.table}: ${g.missing.join(", ")}`).join("; ") || "--"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each capability lists the tables and columns its queries need. A missing capability disables the
            features that depend on it rather than breaking the page.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
