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
import { count, dateLabel, money, moneyCompact, percent } from "@/lib/format";
import { agedInStock, inventoryUnits } from "@/lib/metrics/lists";
import { partsHealth, topParts, unitsByStockStatus } from "@/lib/metrics/overview";

export const dynamic = "force-dynamic";

const AGED_DAYS = 180;

export default async function InventoryPage({
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
  const status = single("status") ?? "all";
  const q = single("q") ?? "";

  const byStatus = unitsByStockStatus();
  const units = inventoryUnits({ status, q: q || undefined, limit: 120 });
  const parts = partsHealth();
  const bestSellers = topParts(12);

  const inStock = byStatus.find((s) => ["instock", "in stock", "in-stock"].includes(s.label));
  const aged = agedInStock(AGED_DAYS);

  return (
    <>
      <PageHeader
        title="Inventory"
        lede="Machines on the lot and the parts that move. Unit values come from BaseRetail and BaseCost; this database has no reliable on-hand parts quantity, so parts health is measured as stocking-policy coverage rather than stock levels."
        meta={<DataBanner />}
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Machines in stock"
          value={count(inStock?.count ?? 0)}
          sub={`${moneyCompact(inStock?.value ?? 0)} at retail`}
          explain="Units whose stock status marks them as available on the lot."
        />
        <KpiCard
          label="In stock over 180 days"
          value={count(aged?.count ?? 0)}
          sub={aged ? `${moneyCompact(aged.value)} of floor plan` : "No received dates in this database"}
          explain="Days since DateReceived, counted only for machines still on the lot. Aged inventory ties up floor plan money, so it is the first place a manager looks."
          tone={(aged?.count ?? 0) > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Parts catalog"
          value={count(parts?.catalogSize ?? 0)}
          sub={`${count(parts?.withPolicy ?? 0)} with a stocking rule`}
          explain={parts?.basis ?? "No parts catalog in this database."}
        />
        <KpiCard
          label="Stocking policy coverage"
          value={percent(parts && parts.catalogSize > 0 ? parts.withPolicy / parts.catalogSize : null)}
          sub="Share of parts with a min or max"
          explain="Coverage of stocking rules, not a measure of what is physically on the shelf."
        />
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardContent>
            <SectionHeading title="Machines by stock status" hint="Click a bar to filter the list" />
            {byStatus.length > 0 ? (
              <CategoryBarChart
                height={220}
                data={byStatus.map((s) => ({
                  label: s.label,
                  count: s.count,
                  value: s.value,
                  href: `/inventory?status=${encodeURIComponent(s.label)}`,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No unit records in this database.</p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardContent>
            <SectionHeading title="Parts that move" hint="By posted revenue, all time" />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead className="text-right">Qty sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Gross margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bestSellers.map((p) => (
                    <TableRow key={p.partId}>
                      <TableCell>
                        <p className="font-medium">{p.description || p.partNo}</p>
                        <p className="text-xs text-muted-foreground">{p.partNo}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{count(p.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.margin != null ? (
                          <>
                            {money(p.margin)}
                            <p className="text-xs text-muted-foreground">
                              {percent(p.revenue > 0 ? p.margin / p.revenue : null)}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">No cost column</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="mb-4 p-4">
        <FilterBar
          search={{ name: "q", value: q }}
          searchPlaceholder="Stock number, make or model"
          resetHref="/inventory"
          filters={[
            {
              name: "status",
              label: "Stock status",
              value: status,
              options: [
                { value: "all", label: "All statuses" },
                ...byStatus.map((s) => ({ value: s.label, label: `${s.label} (${s.count})` })),
              ],
            },
          ]}
        />
      </Card>

      {units.length === 0 ? (
        <EmptyState title="No machines match" body="Nothing in the unit inventory matches this search and status." />
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Days on lot</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.unitId}>
                    <TableCell>
                      <p className="font-medium">{[u.year, u.make, u.model].filter(Boolean).join(" ") || u.stockNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.stockNo} &middot; {u.category ?? "Machine"} &middot; {u.condition ?? "--"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal capitalize">
                        {u.stockStatus ?? "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{dateLabel(u.dateReceived)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.ageDays != null ? (
                        <span className={u.ageDays >= AGED_DAYS ? "text-[color:var(--warning)]" : undefined}>
                          {count(u.ageDays)}
                        </span>
                      ) : (
                        "--"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(u.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(u.retail)}</TableCell>
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
