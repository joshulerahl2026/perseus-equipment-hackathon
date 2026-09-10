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
import { count, dateLabel, money, monthLabel } from "@/lib/format";
import { invoiceStatuses, invoiceTypes, searchInvoices } from "@/lib/metrics/lists";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const TYPE_LABELS: Record<string, string> = {
  in: "Counter and machine sales",
  wo: "Work orders",
  rl: "Rentals",
};

export default async function InvoicesPage({
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

  const q = single("q") ?? "";
  const status = single("status") ?? "all";
  const type = single("type") ?? "all";
  const month = single("month");
  const customerId = Number(single("customer")) || undefined;
  const page = Math.max(Number(single("page")) || 1, 1);

  const { rows, total } = searchInvoices({
    q: q || undefined,
    status,
    type,
    month,
    customerId,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status !== "all") next.set("status", status);
    if (type !== "all") next.set("type", type);
    if (month) next.set("month", month);
    if (customerId) next.set("customer", String(customerId));
    if (n > 1) next.set("page", String(n));
    return `/invoices${next.size ? `?${next.toString()}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        lede="Every document in the system, including the ones that are not revenue. Quotes, drafts and voided invoices are shown but never counted in any revenue figure."
        meta={<DataBanner />}
      />

      {(month || customerId) && (
        <p className="mb-3 text-sm">
          Showing {month && <span className="font-medium">{monthLabel(month)}</span>}
          {month && customerId && " for "}
          {customerId && <span className="font-medium">{rows[0]?.customerName ?? `customer ${customerId}`}</span>}.{" "}
          <Link href="/invoices" className="text-primary hover:underline">
            Show everything
          </Link>
        </p>
      )}

      <Card className="mb-4 p-4">
        <FilterBar
          search={{ name: "q", value: q }}
          searchPlaceholder="Invoice number, customer name or number"
          resetHref="/invoices"
          filters={[
            {
              name: "status",
              label: "Status",
              value: status,
              options: [
                { value: "all", label: "Any status" },
                { value: "posted", label: "Posted only (revenue)" },
                ...invoiceStatuses().map((s) => ({ value: s, label: s })),
              ],
            },
            {
              name: "type",
              label: "Type",
              value: type,
              options: [
                { value: "all", label: "All types" },
                ...invoiceTypes().map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t })),
              ],
            },
          ]}
        />
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="No invoices match"
          body="Nothing matches this combination of search, status and type. Try clearing one of them."
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {count(total)} invoices &middot; showing {count(rows.length)}
          </p>
          <Card className="overflow-hidden py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((inv) => (
                    <TableRow key={inv.invoiceDocId}>
                      <TableCell>
                        <Link href={`/invoices/${inv.invoiceDocId}`} className="font-medium hover:underline">
                          {inv.invoiceNo ?? inv.invoiceDocId}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/customers/${inv.customerId}`} className="hover:underline">
                          {inv.customerName ?? "--"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {TYPE_LABELS[String(inv.invoiceType).toLowerCase()] ?? inv.invoiceType ?? "--"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ["finalized", "archived"].includes(String(inv.status).toLowerCase())
                              ? "secondary"
                              : "outline"
                          }
                          className="font-normal capitalize"
                        >
                          {inv.status ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{dateLabel(inv.activityDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(inv.total)}</TableCell>
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
