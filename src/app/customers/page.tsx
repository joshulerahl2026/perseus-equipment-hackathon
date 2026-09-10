import Link from "next/link";
import { DataBanner } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, dateLabel, money, percent } from "@/lib/format";
import { customerMetrics } from "@/lib/metrics/customers";
import { customerClasses } from "@/lib/opportunities/select";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function CustomersPage({
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
  const q = (single("q") ?? "").trim().toLowerCase();
  const classFilter = single("class") ?? "all";
  const sort = single("sort") ?? "revenue";
  const page = Math.max(Number(single("page")) || 1, 1);

  let rows = [...customerMetrics().values()];
  if (q) rows = rows.filter((m) => `${m.customerName} ${m.customerNo}`.toLowerCase().includes(q));
  if (classFilter !== "all") rows = rows.filter((m) => (m.classLabel ?? "Unclassified") === classFilter);

  rows.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.customerName.localeCompare(b.customerName);
      case "machines":
        return b.machinesOwned - a.machinesOwned;
      case "quiet":
        return (b.daysSinceLastPurchase ?? -1) - (a.daysSinceLastPurchase ?? -1);
      case "service":
        return b.spend.service12 - a.spend.service12;
      default:
        return b.spend.t12 - a.spend.t12;
    }
  });

  const total = rows.length;
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (classFilter !== "all") next.set("class", classFilter);
    if (sort !== "revenue") next.set("sort", sort);
    if (n > 1) next.set("page", String(n));
    return `/customers${next.size ? `?${next.toString()}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Customers"
        lede="Every account in the database: contractors, landscapers, municipalities and farmers. Search by name or customer number, then open a profile to see machines, spend and history."
        meta={<DataBanner />}
      />

      <Card className="mb-4 p-4">
        <FilterBar
          search={{ name: "q", value: single("q") ?? "" }}
          searchPlaceholder="Customer name or number"
          resetHref="/customers"
          filters={[
            {
              name: "class",
              label: "Customer type",
              value: classFilter,
              options: [{ value: "all", label: "All types" }, ...customerClasses().map((c) => ({ value: c, label: c }))],
            },
            {
              name: "sort",
              label: "Sort by",
              value: sort,
              options: [
                { value: "revenue", label: "Revenue, 12 months" },
                { value: "service", label: "Service spend" },
                { value: "machines", label: "Machines owned" },
                { value: "quiet", label: "Longest since a purchase" },
                { value: "name", label: "Name" },
              ],
            },
          ]}
        />
      </Card>

      {paged.length === 0 ? (
        <EmptyState
          title="No customers match"
          body="Nothing in the database matches that search. Check the spelling, or clear the filters to see every account."
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {count(total)} customers &middot; showing {count(paged.length)}
          </p>
          <Card className="overflow-hidden py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Machines</TableHead>
                    <TableHead className="text-right">Revenue, 12 mo</TableHead>
                    <TableHead className="text-right">Service</TableHead>
                    <TableHead className="text-right">Service share</TableHead>
                    <TableHead>Last purchase</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((m) => (
                    <TableRow key={m.customerId}>
                      <TableCell>
                        <Link href={`/customers/${m.customerId}`} className="font-medium hover:underline">
                          {m.customerName}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="outline" className="font-normal">
                            {m.classLabel ?? "Unclassified"}
                          </Badge>
                          #{m.customerNo}
                          {!m.isActive && <span className="text-[color:var(--warning)]">inactive</span>}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{count(m.machinesOwned)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.spend.t12)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.spend.service12)}</TableCell>
                      <TableCell className="text-right tabular-nums">{percent(m.serviceShareOfWallet)}</TableCell>
                      <TableCell className="text-sm">{dateLabel(m.invoices.lastDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="rounded-md border px-3 py-1.5 hover:bg-secondary">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} className="rounded-md border px-3 py-1.5 hover:bg-secondary">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
