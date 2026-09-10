import Link from "next/link";
import { notFound } from "next/navigation";
import { DataAsOfLine } from "@/components/data-banner";
import { DatabaseMissing } from "@/components/database-missing";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { databaseAvailable } from "@/lib/db";
import { count, dateLabel, decimal, money, percent } from "@/lib/format";
import { invoiceHeader, invoiceLines, invoiceSegments } from "@/lib/metrics/customer-detail";

export const dynamic = "force-dynamic";

const POSTED = ["finalized", "archived"];

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceDocId: string }> }) {
  if (!databaseAvailable()) return <DatabaseMissing />;

  const { invoiceDocId } = await params;
  const id = Number(invoiceDocId);
  const header = invoiceHeader(id);
  if (!header) notFound();

  const lines = invoiceLines(id);
  const segments = invoiceSegments(id);
  const isPosted = POSTED.includes(String(header.status).toLowerCase());
  const lineTotal = lines.reduce((acc, l) => acc + l.netExt, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/invoices", label: "Back to invoices" }}
        title={`Invoice ${header.invoiceNo ?? header.invoiceDocId}`}
        lede={
          isPosted
            ? "Posted invoice. This one counts toward revenue."
            : "Not posted, so this document is excluded from every revenue figure in the app."
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Badge variant={isPosted ? "secondary" : "outline"} className="font-normal capitalize">
              {header.status ?? "unknown"}
            </Badge>
            <span>{dateLabel(header.activityDate)}</span>
            <span>{header.invoiceType ?? "--"}</span>
            {header.salesPerson && <span>Sold by {header.salesPerson}</span>}
            <DataAsOfLine />
          </div>
        }
      />

      <section className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <SectionHeading title="Line items" hint="Parts, labor, rentals and machines on this document" />
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items recorded for this invoice.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Line</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.itemId}>
                        <TableCell className="text-muted-foreground tabular-nums">{l.lineNo ?? "--"}</TableCell>
                        <TableCell>{l.description ?? "--"}</TableCell>
                        <TableCell className="text-sm capitalize text-muted-foreground">{l.itemType ?? "--"}</TableCell>
                        <TableCell className="text-right tabular-nums">{decimal(l.qty, l.qty % 1 === 0 ? 0 : 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(l.unitPrice, { cents: true })}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.discount > 0 ? percent(l.discount) : "--"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(l.netExt, { cents: true })}</TableCell>
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
            <SectionHeading title="Summary" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="text-right">
                  <Link href={`/customers/${header.customerId}`} className="font-medium hover:underline">
                    {header.customerName ?? "--"}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Line items total</dt>
                <dd className="tabular-nums">{money(lineTotal)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2">
                <dt className="font-medium">Invoice total</dt>
                <dd className="font-semibold tabular-nums">{money(header.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              The invoice total includes tax and any miscellaneous charges, so it can exceed the sum of the line
              items above.
            </p>
            <Link
              href={`/opportunities/${header.customerId}`}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Open this customer&rsquo;s call sheet
            </Link>
          </CardContent>
        </Card>
      </section>

      {segments.length > 0 && (
        <Card>
          <CardContent>
            <SectionHeading title="Service segments" hint="What the shop was asked to do, and the labor billed" />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service code</TableHead>
                    <TableHead>Complaint</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Labor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segments.map((s) => (
                    <TableRow key={s.segmentId}>
                      <TableCell className="font-medium">{s.serviceCode ?? "--"}</TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">{s.complaint ?? "--"}</TableCell>
                      <TableCell className="text-sm">{s.unitStockNo ?? "--"}</TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {s.segmentStatus ?? "--"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{decimal(s.laborHours, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(s.laborAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {count(segments.length)} segment{segments.length === 1 ? "" : "s"} on this work order.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
