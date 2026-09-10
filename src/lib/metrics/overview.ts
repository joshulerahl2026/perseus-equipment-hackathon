import { cached, query, queryOne } from "../db";
import { can, hasColumn, hasTable } from "../schema";
import { isPartsInvoice, isRentalInvoice, isServiceInvoice, POSTED, num, windows } from "../sql";

export type HeadlineKpis = {
  postedRevenue12: number;
  invoiceCount12: number;
  avgInvoice12: number;
  serviceRevenue12: number;
  partsRevenue12: number;
  openWorkOrders: number;
  inStockUnits: number;
  inStockRetail: number;
  activeCustomers12: number;
};

export function headlineKpis(): HeadlineKpis {
  return cached("overview:kpis", () => {
    const w = windows();
    const revenue = queryOne<{ total: number; n: number; service: number; parts: number; customers: number }>(
      `SELECT SUM(ih.TotalInvoice) total, COUNT(*) n,
              SUM(CASE WHEN ${isServiceInvoice()} THEN ih.TotalInvoice ELSE 0 END) service,
              SUM(CASE WHEN ${isPartsInvoice()} THEN ih.TotalInvoice ELSE 0 END) parts,
              COUNT(DISTINCT ih.CustomerId) customers
       FROM InvoiceHeader ih
       WHERE ${POSTED} AND ih.ActivityDate >= ?`,
      [w.t12],
    );

    const openWo =
      can("workOrderStatus") && hasColumn("InvoiceHeader", "WorkOrderStatusId")
        ? num(
            queryOne<{ n: number }>(
              `SELECT COUNT(*) n FROM InvoiceHeader ih
               JOIN SettingsWorkOrderStatus st ON st.WorkOrderStatusId = ih.WorkOrderStatusId
               WHERE ${hasColumn("SettingsWorkOrderStatus", "IsOpen") ? "st.IsOpen = 1" : "LOWER(st.Description) NOT IN ('closed','invoiced')"}`,
            )?.n,
          )
        : 0;

    const stock = can("units")
      ? queryOne<{ n: number; retail: number }>(
          `SELECT COUNT(*) n, SUM(BaseRetail) retail FROM UnitBase
           WHERE LOWER(COALESCE(StockStatus,'')) IN ('instock','in stock','in-stock','available')`,
        )
      : undefined;

    const total = num(revenue?.total);
    const n = num(revenue?.n);

    return {
      postedRevenue12: total,
      invoiceCount12: n,
      avgInvoice12: n > 0 ? total / n : 0,
      serviceRevenue12: num(revenue?.service),
      partsRevenue12: num(revenue?.parts),
      openWorkOrders: openWo,
      inStockUnits: num(stock?.n),
      inStockRetail: num(stock?.retail),
      activeCustomers12: num(revenue?.customers),
    };
  });
}

export type MonthlyRevenue = {
  month: string;
  total: number;
  service: number;
  parts: number;
  rental: number;
};

export function monthlyRevenue(months = 24): MonthlyRevenue[] {
  return cached(`overview:monthly:${months}`, () => {
    const rows = query<{ month: string; total: number; service: number; parts: number; rental: number }>(
      `SELECT substr(ih.ActivityDate, 1, 7) month,
              SUM(ih.TotalInvoice) total,
              SUM(CASE WHEN ${isServiceInvoice()} THEN ih.TotalInvoice ELSE 0 END) service,
              SUM(CASE WHEN ${isPartsInvoice()} THEN ih.TotalInvoice ELSE 0 END) parts,
              SUM(CASE WHEN ${isRentalInvoice()} THEN ih.TotalInvoice ELSE 0 END) rental
       FROM InvoiceHeader ih
       WHERE ${POSTED} AND ih.ActivityDate IS NOT NULL
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?`,
      [months],
    );
    return rows
      .map((r) => ({
        month: r.month,
        total: num(r.total),
        service: num(r.service),
        parts: num(r.parts),
        rental: num(r.rental),
      }))
      .reverse();
  });
}

export type StatusBreakdown = { label: string; value: number; count: number };

export function invoicesByStatus(): StatusBreakdown[] {
  return cached("overview:byStatus", () =>
    query<{ label: string; count: number; value: number }>(
      `SELECT LOWER(Status) label, COUNT(*) count, SUM(TotalInvoice) value
       FROM InvoiceHeader GROUP BY LOWER(Status) ORDER BY count DESC`,
    ).map((r) => ({ label: r.label ?? "unknown", count: num(r.count), value: num(r.value) })),
  );
}

export function unitsByStockStatus(): StatusBreakdown[] {
  return cached("overview:unitsByStatus", () => {
    if (!can("units")) return [];
    return query<{ label: string; count: number; value: number }>(
      `SELECT LOWER(COALESCE(StockStatus,'unknown')) label, COUNT(*) count, SUM(BaseRetail) value
       FROM UnitBase GROUP BY label ORDER BY count DESC`,
    ).map((r) => ({ label: r.label, count: num(r.count), value: num(r.value) }));
  });
}

export type PartsHealth = {
  catalogSize: number;
  withPolicy: number;
  withoutPolicy: number;
  /** Which columns the policy check used, since the brief warns about assumptions. */
  basis: string;
};

export function partsHealth(): PartsHealth | null {
  return cached("overview:partsHealth", () => {
    if (!can("partsCatalog")) return null;
    const catalog = num(queryOne<{ n: number }>(`SELECT COUNT(*) n FROM PartMaster`)?.n);
    if (!can("partsPolicy")) {
      return {
        catalogSize: catalog,
        withPolicy: 0,
        withoutPolicy: catalog,
        basis: "This database has no PartLocation min/max columns, so no stocking policy could be evaluated.",
      };
    }
    const withPolicy = num(
      queryOne<{ n: number }>(
        `SELECT COUNT(DISTINCT PartId) n FROM PartLocation
         WHERE (COALESCE(MinStock,0) > 0 OR COALESCE(MaxStock,0) > 0)`,
      )?.n,
    );
    return {
      catalogSize: catalog,
      withPolicy,
      withoutPolicy: Math.max(catalog - withPolicy, 0),
      basis:
        "A part counts as having a stocking policy when PartLocation carries a non-zero MinStock or MaxStock at any location. This dataset has no reliable on-hand quantity column, so this is a policy-coverage measure, not a stock-level measure.",
    };
  });
}

export type TopPart = {
  partId: number;
  partNo: string;
  description: string | null;
  revenue: number;
  qty: number;
  margin: number | null;
};

export function topParts(limit = 10): TopPart[] {
  return cached(`overview:topParts:${limit}`, () => {
    if (!can("partsSales")) return [];
    const marginExpr = can("partsCost") ? `SUM(sp.NetExt - sp.Qty * sp.AvgCost)` : `NULL`;
    return query<{ partId: number; partNo: string; description: string; revenue: number; qty: number; margin: number }>(
      `SELECT sp.PartId partId, sp.PartNo partNo,
              MAX(${hasColumn("SalePart", "Description") ? "sp.Description" : "''"}) description,
              SUM(sp.NetExt) revenue, SUM(sp.Qty) qty, ${marginExpr} margin
       FROM SalePart sp
       JOIN InvoiceDetail d ON d.ItemId = sp.ItemId
       JOIN InvoiceHeader ih ON ih.InvoiceDocId = d.InvoiceDocId
       WHERE ${POSTED}
       GROUP BY sp.PartId, sp.PartNo
       ORDER BY revenue DESC
       LIMIT ?`,
      [limit],
    ).map((r) => ({
      partId: num(r.partId),
      partNo: String(r.partNo ?? ""),
      description: r.description || null,
      revenue: num(r.revenue),
      qty: num(r.qty),
      margin: r.margin == null ? null : num(r.margin),
    }));
  });
}

export type WorkOrderStatusRow = { statusId: number; label: string; isOpen: boolean; count: number; value: number };

export function workOrdersByStatus(): WorkOrderStatusRow[] {
  return cached("overview:woByStatus", () => {
    if (!can("workOrderStatus") || !hasColumn("InvoiceHeader", "WorkOrderStatusId")) return [];
    return query<{ statusId: number; label: string; isOpen: number; count: number; value: number }>(
      `SELECT st.WorkOrderStatusId statusId, st.Description label,
              ${hasColumn("SettingsWorkOrderStatus", "IsOpen") ? "st.IsOpen" : "0"} isOpen,
              COUNT(*) count, SUM(ih.TotalInvoice) value
       FROM InvoiceHeader ih
       JOIN SettingsWorkOrderStatus st ON st.WorkOrderStatusId = ih.WorkOrderStatusId
       GROUP BY st.WorkOrderStatusId, st.Description
       ORDER BY count DESC`,
    ).map((r) => ({
      statusId: num(r.statusId),
      label: String(r.label ?? "Unknown"),
      isOpen: num(r.isOpen) === 1,
      count: num(r.count),
      value: num(r.value),
    }));
  });
}

export type TechnicianLoad = { name: string; hours: number; workOrders: number };

export function technicianWorkload(limit = 10): TechnicianLoad[] {
  return cached(`overview:techLoad:${limit}`, () => {
    if (!can("technicianTime")) return [];
    const nameExpr = hasColumn("WorkInProgress", "TechnicianName")
      ? "COALESCE(w.TechnicianName, 'Unassigned')"
      : hasTable("AppUser")
        ? "COALESCE((SELECT u.FullName FROM AppUser u WHERE u.AppUserId = w.TechnicianId), 'Unassigned')"
        : "'Unassigned'";
    const w = windows();
    return query<{ name: string; hours: number; workOrders: number }>(
      `SELECT ${nameExpr} name, SUM(w.ElapsedHours) hours, COUNT(DISTINCT w.InvoiceDocId) workOrders
       FROM WorkInProgress w
       JOIN InvoiceHeader ih ON ih.InvoiceDocId = w.InvoiceDocId
       WHERE ih.ActivityDate >= ?
       GROUP BY name
       ORDER BY hours DESC
       LIMIT ?`,
      [w.t12, limit],
    ).map((r) => ({ name: String(r.name), hours: num(r.hours), workOrders: num(r.workOrders) }));
  });
}
