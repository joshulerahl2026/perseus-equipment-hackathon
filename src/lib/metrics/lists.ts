import { query, queryOne } from "../db";
import { can, hasColumn, hasTable } from "../schema";
import { POSTED, num } from "../sql";
import { InvoiceRow } from "./customer-detail";
import { customerMetrics } from "./customers";

/** Filtered, paged list queries behind the search and drill-down screens. */

export type InvoiceFilters = {
  q?: string;
  status?: string;
  type?: string;
  month?: string;
  customerId?: number;
  limit?: number;
  offset?: number;
};

export function searchInvoices(filters: InvoiceFilters): { rows: InvoiceRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.q) {
    where.push(`(LOWER(ih.CustomerName) LIKE ? OR LOWER(COALESCE(ih.InvoiceNo,'')) LIKE ? OR LOWER(COALESCE(ih.CustomerNo,'')) LIKE ?)`);
    const needle = `%${filters.q.toLowerCase()}%`;
    params.push(needle, needle, needle);
  }
  if (filters.status && filters.status !== "all") {
    if (filters.status === "posted") where.push(POSTED);
    else {
      where.push(`LOWER(ih.Status) = ?`);
      params.push(filters.status.toLowerCase());
    }
  }
  if (filters.type && filters.type !== "all") {
    where.push(`LOWER(ih.InvoiceType) = ?`);
    params.push(filters.type.toLowerCase());
  }
  if (filters.month) {
    where.push(`substr(ih.ActivityDate, 1, 7) = ?`);
    params.push(filters.month);
  }
  if (filters.customerId != null) {
    where.push(`ih.CustomerId = ?`);
    params.push(filters.customerId);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = num(queryOne<{ n: number }>(`SELECT COUNT(*) n FROM InvoiceHeader ih ${clause}`, params)?.n);

  const rows = query<InvoiceRow>(
    `SELECT ih.InvoiceDocId invoiceDocId, ih.InvoiceNo invoiceNo, ih.Status status,
            ih.InvoiceType invoiceType, ih.ActivityDate activityDate, ih.CustomerId customerId,
            ih.CustomerName customerName, ih.TotalInvoice total,
            ${hasColumn("InvoiceHeader", "SalesPersonName") ? "ih.SalesPersonName" : "NULL"} salesPerson
     FROM InvoiceHeader ih
     ${clause}
     ORDER BY ih.ActivityDate DESC
     LIMIT ? OFFSET ?`,
    [...params, filters.limit ?? 50, filters.offset ?? 0],
  ).map((r) => ({ ...r, total: num(r.total) }));

  return { rows, total };
}

export function invoiceTypes(): string[] {
  return query<{ t: string }>(
    `SELECT DISTINCT LOWER(InvoiceType) t FROM InvoiceHeader WHERE InvoiceType IS NOT NULL ORDER BY t`,
  ).map((r) => r.t);
}

export function invoiceStatuses(): string[] {
  return query<{ s: string }>(
    `SELECT DISTINCT LOWER(Status) s FROM InvoiceHeader WHERE Status IS NOT NULL ORDER BY s`,
  ).map((r) => r.s);
}

export type InventoryUnit = {
  unitId: number;
  stockNo: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  condition: string | null;
  stockStatus: string | null;
  retail: number;
  cost: number;
  dateReceived: string | null;
  /** Days on the lot, which is the number that matters for aged inventory. */
  ageDays: number | null;
};

/**
 * Machines still on the lot that have sat too long. Age only means something
 * for units a manager can still act on: a sold unit's days on the lot are
 * history, not floor-plan money tied up today.
 */
export function agedInStock(days: number): { count: number; value: number } | null {
  if (!can("units") || !hasColumn("UnitBase", "DateReceived")) return null;
  const row = queryOne<{ n: number; value: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(COALESCE(u.BaseRetail, 0)), 0) value
     FROM UnitBase u
     WHERE LOWER(COALESCE(u.StockStatus, '')) IN ('instock', 'in stock', 'in-stock')
       AND u.DateReceived IS NOT NULL
       AND julianday('now') - julianday(u.DateReceived) >= ?`,
    [days],
  );
  return { count: num(row?.n), value: num(row?.value) };
}

export function inventoryUnits(filters: { status?: string; q?: string; limit?: number }): InventoryUnit[] {
  if (!can("units")) return [];
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status && filters.status !== "all") {
    where.push(`LOWER(COALESCE(u.StockStatus,'unknown')) = ?`);
    params.push(filters.status.toLowerCase());
  }
  if (filters.q) {
    where.push(`(LOWER(COALESCE(u.StockNo,'')) LIKE ? OR LOWER(COALESCE(u.Make,'')) LIKE ? OR LOWER(COALESCE(u.Model,'')) LIKE ?)`);
    const needle = `%${filters.q.toLowerCase()}%`;
    params.push(needle, needle, needle);
  }

  const categoryJoin = hasTable("UnitCategory") ? `LEFT JOIN UnitCategory c ON c.UnitCategoryId = u.UnitCategoryId` : "";
  const conditionJoin = hasTable("UnitCondition") ? `LEFT JOIN UnitCondition cond ON cond.UnitConditionId = u.UnitConditionId` : "";

  return query<InventoryUnit>(
    `SELECT u.UnitId unitId, u.StockNo stockNo, u.Make make, u.Model model, u.Year year,
            ${hasTable("UnitCategory") ? "c.Description" : "NULL"} category,
            ${hasTable("UnitCondition") ? "cond.Description" : "NULL"} condition,
            u.StockStatus stockStatus, COALESCE(u.BaseRetail,0) retail, COALESCE(u.BaseCost,0) cost,
            ${hasColumn("UnitBase", "DateReceived") ? "u.DateReceived" : "NULL"} dateReceived,
            ${hasColumn("UnitBase", "DateReceived") ? "CAST(julianday('now') - julianday(u.DateReceived) AS INTEGER)" : "NULL"} ageDays
     FROM UnitBase u
     ${categoryJoin} ${conditionJoin}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ageDays DESC NULLS LAST
     LIMIT ?`,
    [...params, filters.limit ?? 100],
  ).map((r) => ({
    ...r,
    retail: num(r.retail),
    cost: num(r.cost),
    year: r.year == null ? null : num(r.year),
    ageDays: r.ageDays == null ? null : num(r.ageDays),
  }));
}

export type WorkOrderRow = {
  invoiceDocId: number;
  invoiceNo: string | null;
  activityDate: string | null;
  customerId: number;
  customerName: string | null;
  statusLabel: string | null;
  isOpen: boolean;
  technician: string | null;
  total: number;
  laborHours: number;
  unitStockNo: string | null;
};

export function workOrders(filters: { status?: string; open?: boolean; limit?: number }): WorkOrderRow[] {
  if (!can("serviceSegments")) return [];
  const hasStatus = can("workOrderStatus") && hasColumn("InvoiceHeader", "WorkOrderStatusId");
  const where: string[] = [];
  const params: unknown[] = [];

  if (hasStatus && filters.status && filters.status !== "all") {
    where.push(`LOWER(st.Description) = ?`);
    params.push(filters.status.toLowerCase());
  }
  if (hasStatus && filters.open) {
    where.push(hasColumn("SettingsWorkOrderStatus", "IsOpen") ? `st.IsOpen = 1` : `LOWER(st.Description) NOT IN ('closed','invoiced')`);
  }

  return query<Omit<WorkOrderRow, "isOpen"> & { isOpen: number }>(
    `SELECT ih.InvoiceDocId invoiceDocId, ih.InvoiceNo invoiceNo, ih.ActivityDate activityDate,
            ih.CustomerId customerId, ih.CustomerName customerName,
            ${hasStatus ? "st.Description" : "ih.Status"} statusLabel,
            ${hasStatus && hasColumn("SettingsWorkOrderStatus", "IsOpen") ? "st.IsOpen" : "0"} isOpen,
            ${hasColumn("InvoiceHeader", "TechnicianName") ? "ih.TechnicianName" : "NULL"} technician,
            ih.TotalInvoice total,
            (SELECT COALESCE(SUM(s.LaborHours),0) FROM InvoiceSegment s WHERE s.InvoiceDocId = ih.InvoiceDocId) laborHours,
            ${hasColumn("InvoiceHeader", "UnitStockNo") ? "ih.UnitStockNo" : "NULL"} unitStockNo
     FROM InvoiceHeader ih
     ${hasStatus ? "JOIN SettingsWorkOrderStatus st ON st.WorkOrderStatusId = ih.WorkOrderStatusId" : ""}
     WHERE EXISTS (SELECT 1 FROM InvoiceSegment s2 WHERE s2.InvoiceDocId = ih.InvoiceDocId)
       ${where.length ? `AND ${where.join(" AND ")}` : ""}
     ORDER BY ih.ActivityDate DESC
     LIMIT ?`,
    [...params, filters.limit ?? 60],
  ).map((r) => ({ ...r, total: num(r.total), laborHours: num(r.laborHours), isOpen: num(r.isOpen) === 1 }));
}

/** The accounts generating the most repeat service traffic, per machine owned. */
export type ChurnAudit = {
  customerId: number;
  customerName: string;
  classLabel: string | null;
  visits: number;
  hours: number;
  spend: number;
  machines: number;
  slipDays: number;
  perMachine: number;
};

export function churnLeaderboard(limit = 20): ChurnAudit[] {
  return [...customerMetrics().values()]
    .filter((m) => m.churn.comebackVisits12 > 0)
    .map((m) => ({
      customerId: m.customerId,
      customerName: m.customerName,
      classLabel: m.classLabel,
      visits: m.churn.comebackVisits12,
      hours: m.churn.comebackHours12,
      spend: m.churn.comebackSpend12,
      machines: m.machinesOwned,
      slipDays: m.churn.slipDays12,
      perMachine: m.churn.comebackVisits12 / Math.max(m.machinesOwned, 1),
    }))
    .sort((a, b) => b.visits - a.visits || b.hours - a.hours)
    .slice(0, limit);
}
