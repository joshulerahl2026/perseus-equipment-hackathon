import { cached, query } from "../db";
import { can, hasColumn, hasTable } from "../schema";
import { serviceCodeClassification } from "../services/codes";
import { isServiceInvoice, POSTED, num, placeholders, windows } from "../sql";

/** Detail rows behind a customer's summary, for the drill-down flows. */

export type OwnedUnit = {
  unitId: number;
  stockNo: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  purchaseDate: string | null;
  invoiceAmount: number;
  warrantyEndDate: string | null;
  workOrders: number;
  lastServiceDate: string | null;
  serviceSpend: number;
};

export function customerUnits(customerId: number): OwnedUnit[] {
  return cached(`detail:units:${customerId}`, () => {
    if (!can("unitOwnership") || !can("units")) return [];
    const categoryJoin = hasTable("UnitCategory")
      ? `LEFT JOIN UnitCategory uc2 ON uc2.UnitCategoryId = u.UnitCategoryId`
      : "";
    const categoryCol = hasTable("UnitCategory") ? "uc2.Description" : "NULL";
    const warrantyCol = can("warranty")
      ? `(SELECT MAX(us.WarrantyEndDate) FROM UnitSerial us WHERE us.UnitId = u.UnitId)`
      : "NULL";
    const unitLink = hasColumn("InvoiceHeader", "UnitId");

    return query<OwnedUnit>(
      `SELECT u.UnitId unitId, u.StockNo stockNo, u.Make make, u.Model model, u.Year year,
              ${categoryCol} category,
              MAX(uc.EventDate) purchaseDate,
              SUM(COALESCE(uc.InvoiceAmount, 0)) invoiceAmount,
              ${warrantyCol} warrantyEndDate,
              ${
                unitLink
                  ? `(SELECT COUNT(*) FROM InvoiceHeader ih WHERE ih.UnitId = u.UnitId AND ih.CustomerId = uc.CustomerId AND ${POSTED} AND ${isServiceInvoice()})`
                  : "0"
              } workOrders,
              ${
                unitLink
                  ? `(SELECT MAX(ih.ActivityDate) FROM InvoiceHeader ih WHERE ih.UnitId = u.UnitId AND ih.CustomerId = uc.CustomerId AND ${POSTED} AND ${isServiceInvoice()})`
                  : "NULL"
              } lastServiceDate,
              ${
                unitLink
                  ? `(SELECT COALESCE(SUM(ih.TotalInvoice),0) FROM InvoiceHeader ih WHERE ih.UnitId = u.UnitId AND ih.CustomerId = uc.CustomerId AND ${POSTED} AND ${isServiceInvoice()})`
                  : "0"
              } serviceSpend
       FROM UnitCustomer uc
       JOIN UnitBase u ON u.UnitId = uc.UnitId
       ${categoryJoin}
       WHERE uc.CustomerId = ?
       GROUP BY u.UnitId
       ORDER BY purchaseDate DESC`,
      [customerId],
    ).map((r) => ({
      ...r,
      invoiceAmount: num(r.invoiceAmount),
      workOrders: num(r.workOrders),
      serviceSpend: num(r.serviceSpend),
      year: r.year == null ? null : num(r.year),
    }));
  });
}

export type InvoiceRow = {
  invoiceDocId: number;
  invoiceNo: string | null;
  status: string | null;
  invoiceType: string | null;
  activityDate: string | null;
  customerId: number;
  customerName: string | null;
  total: number;
  salesPerson: string | null;
};

export function customerInvoices(customerId: number, limit = 25): InvoiceRow[] {
  return cached(`detail:invoices:${customerId}:${limit}`, () =>
    query<InvoiceRow>(
      `SELECT ih.InvoiceDocId invoiceDocId, ih.InvoiceNo invoiceNo, ih.Status status,
              ih.InvoiceType invoiceType, ih.ActivityDate activityDate, ih.CustomerId customerId,
              ih.CustomerName customerName, ih.TotalInvoice total,
              ${hasColumn("InvoiceHeader", "SalesPersonName") ? "ih.SalesPersonName" : "NULL"} salesPerson
       FROM InvoiceHeader ih
       WHERE ih.CustomerId = ?
       ORDER BY ih.ActivityDate DESC
       LIMIT ?`,
      [customerId, limit],
    ).map((r) => ({ ...r, total: num(r.total) })),
  );
}

export type PurchasedPart = {
  partId: number;
  partNo: string;
  description: string | null;
  qty: number;
  revenue: number;
  lastPurchase: string | null;
};

export function customerParts(customerId: number, limit = 12): PurchasedPart[] {
  return cached(`detail:parts:${customerId}:${limit}`, () => {
    if (!can("partsSales")) return [];
    return query<PurchasedPart>(
      `SELECT sp.PartId partId, sp.PartNo partNo,
              MAX(${hasColumn("SalePart", "Description") ? "sp.Description" : "''"}) description,
              SUM(sp.Qty) qty, SUM(sp.NetExt) revenue, MAX(ih.ActivityDate) lastPurchase
       FROM SalePart sp
       JOIN InvoiceDetail d ON d.ItemId = sp.ItemId
       JOIN InvoiceHeader ih ON ih.InvoiceDocId = d.InvoiceDocId
       WHERE ih.CustomerId = ? AND ${POSTED}
       GROUP BY sp.PartId, sp.PartNo
       ORDER BY revenue DESC
       LIMIT ?`,
      [customerId, limit],
    ).map((r) => ({ ...r, qty: num(r.qty), revenue: num(r.revenue) }));
  });
}

export type ServiceVisit = {
  invoiceDocId: number;
  invoiceNo: string | null;
  activityDate: string | null;
  status: string | null;
  total: number;
  serviceCodes: string | null;
  laborHours: number;
  unitStockNo: string | null;
  unitId: number | null;
  isProactive: boolean;
  technician: string | null;
};

/** A customer's work order history, flagged planned versus reactive. */
export function customerServiceVisits(customerId: number, limit = 40): ServiceVisit[] {
  return cached(`detail:visits:${customerId}:${limit}`, () => {
    if (!can("serviceSegments")) return [];
    const { proactive } = serviceCodeClassification();
    return query<Omit<ServiceVisit, "isProactive"> & { isProactive: number }>(
      `SELECT ih.InvoiceDocId invoiceDocId, ih.InvoiceNo invoiceNo, ih.ActivityDate activityDate,
              ih.Status status, ih.TotalInvoice total,
              GROUP_CONCAT(DISTINCT s.ServiceCode) serviceCodes,
              SUM(COALESCE(s.LaborHours, 0)) laborHours,
              ${hasColumn("InvoiceHeader", "UnitStockNo") ? "ih.UnitStockNo" : "MAX(s.UnitStockNo)"} unitStockNo,
              ${hasColumn("InvoiceHeader", "UnitId") ? "ih.UnitId" : "MAX(s.UnitId)"} unitId,
              MAX(CASE WHEN s.ServiceCode IN (${placeholders(proactive.length)}) THEN 1 ELSE 0 END) isProactive,
              ${hasColumn("InvoiceHeader", "TechnicianName") ? "ih.TechnicianName" : "NULL"} technician
       FROM InvoiceHeader ih
       JOIN InvoiceSegment s ON s.InvoiceDocId = ih.InvoiceDocId
       WHERE ih.CustomerId = ?
       GROUP BY ih.InvoiceDocId
       ORDER BY ih.ActivityDate DESC
       LIMIT ?`,
      [...proactive, customerId, limit],
    ).map((r) => ({
      ...r,
      total: num(r.total),
      laborHours: num(r.laborHours),
      unitId: r.unitId == null ? null : num(r.unitId),
      isProactive: num(r.isProactive) === 1,
    }));
  });
}

/**
 * The repeat visits behind a training recommendation, so the claim is auditable
 * down to the work order.
 */
export type ComebackPair = {
  invoiceDocId: number;
  invoiceNo: string | null;
  activityDate: string | null;
  priorInvoiceNo: string | null;
  priorDate: string | null;
  daysApart: number;
  serviceCode: string | null;
  unitStockNo: string | null;
  total: number;
  hours: number;
};

export function customerComebacks(customerId: number): ComebackPair[] {
  return cached(`detail:comebacks:${customerId}`, () => {
    if (!can("serviceSegments")) return [];
    const w = windows();
    const unitExpr = hasColumn("InvoiceHeader", "UnitId") ? "ih.UnitId" : "NULL";
    return query<ComebackPair>(
      `WITH svc AS (
         SELECT ih.InvoiceDocId doc, ih.InvoiceNo no, ih.CustomerId cid,
                COALESCE(${unitExpr}, s.UnitId) unit,
                ${hasColumn("InvoiceHeader", "UnitStockNo") ? "ih.UnitStockNo" : "s.UnitStockNo"} stockNo,
                s.ServiceCode code, ih.ActivityDate d, ih.TotalInvoice total
         FROM InvoiceHeader ih
         JOIN InvoiceSegment s ON s.InvoiceDocId = ih.InvoiceDocId
         WHERE ${POSTED} AND ih.CustomerId = ?
       )
       SELECT a.doc invoiceDocId, a.no invoiceNo, a.d activityDate,
              b.no priorInvoiceNo, b.d priorDate,
              CAST(julianday(a.d) - julianday(b.d) AS INTEGER) daysApart,
              a.code serviceCode, a.stockNo unitStockNo, a.total total,
              COALESCE((SELECT SUM(w.ElapsedHours) FROM WorkInProgress w WHERE w.InvoiceDocId = a.doc), 0) hours
       FROM svc a
       JOIN svc b ON b.unit = a.unit AND b.code = a.code AND b.doc <> a.doc
       WHERE a.d >= ? AND a.unit IS NOT NULL
         AND julianday(a.d) - julianday(b.d) > 0
         AND julianday(a.d) - julianday(b.d) <= 90
       GROUP BY a.doc
       ORDER BY a.d DESC`,
      [customerId, w.t12],
    ).map((r) => ({ ...r, total: num(r.total), hours: num(r.hours), daysApart: num(r.daysApart) }));
  });
}

export type MonthlyCustomerSpend = { month: string; service: number; parts: number; rental: number; total: number };

export function customerMonthlySpend(customerId: number, months = 24): MonthlyCustomerSpend[] {
  return cached(`detail:monthly:${customerId}:${months}`, () =>
    query<MonthlyCustomerSpend>(
      `SELECT substr(ih.ActivityDate, 1, 7) month,
              SUM(CASE WHEN ${isServiceInvoice()} THEN ih.TotalInvoice ELSE 0 END) service,
              SUM(CASE WHEN LOWER(ih.InvoiceType) LIKE 'in%' THEN ih.TotalInvoice ELSE 0 END) parts,
              SUM(CASE WHEN LOWER(ih.InvoiceType) LIKE 'rl%' THEN ih.TotalInvoice ELSE 0 END) rental,
              SUM(ih.TotalInvoice) total
       FROM InvoiceHeader ih
       WHERE ih.CustomerId = ? AND ${POSTED}
       GROUP BY month
       ORDER BY month DESC
       LIMIT ?`,
      [customerId, months],
    )
      .map((r) => ({
        month: r.month,
        service: num(r.service),
        parts: num(r.parts),
        rental: num(r.rental),
        total: num(r.total),
      }))
      .reverse(),
  );
}

export type InvoiceLine = {
  itemId: number;
  lineNo: number | null;
  itemType: string | null;
  description: string | null;
  qty: number;
  unitPrice: number;
  discount: number;
  netExt: number;
};

export function invoiceHeader(invoiceDocId: number): InvoiceRow | undefined {
  return cached(`detail:invoiceHeader:${invoiceDocId}`, () =>
    query<InvoiceRow>(
      `SELECT ih.InvoiceDocId invoiceDocId, ih.InvoiceNo invoiceNo, ih.Status status,
              ih.InvoiceType invoiceType, ih.ActivityDate activityDate, ih.CustomerId customerId,
              ih.CustomerName customerName, ih.TotalInvoice total,
              ${hasColumn("InvoiceHeader", "SalesPersonName") ? "ih.SalesPersonName" : "NULL"} salesPerson
       FROM InvoiceHeader ih WHERE ih.InvoiceDocId = ?`,
      [invoiceDocId],
    ).map((r) => ({ ...r, total: num(r.total) }))[0],
  );
}

export function invoiceLines(invoiceDocId: number): InvoiceLine[] {
  return cached(`detail:invoiceLines:${invoiceDocId}`, () => {
    if (!can("invoiceLines")) return [];
    return query<InvoiceLine>(
      `SELECT d.ItemId itemId,
              ${hasColumn("InvoiceDetail", "LineNo") ? "d.LineNo" : "NULL"} lineNo,
              d.ItemType itemType,
              ${hasColumn("InvoiceDetail", "Description") ? "d.Description" : "NULL"} description,
              ${hasColumn("InvoiceDetail", "Qty") ? "d.Qty" : "0"} qty,
              ${hasColumn("InvoiceDetail", "UnitPrice") ? "d.UnitPrice" : "0"} unitPrice,
              ${hasColumn("InvoiceDetail", "Discount") ? "d.Discount" : "0"} discount,
              d.NetExt netExt
       FROM InvoiceDetail d
       WHERE d.InvoiceDocId = ?
       ORDER BY lineNo`,
      [invoiceDocId],
    ).map((r) => ({
      ...r,
      qty: num(r.qty),
      unitPrice: num(r.unitPrice),
      discount: num(r.discount),
      netExt: num(r.netExt),
      lineNo: r.lineNo == null ? null : num(r.lineNo),
    }));
  });
}

export type InvoiceSegmentRow = {
  segmentId: number;
  serviceCode: string | null;
  segmentStatus: string | null;
  complaint: string | null;
  laborAmount: number;
  laborHours: number;
  unitStockNo: string | null;
};

export function invoiceSegments(invoiceDocId: number): InvoiceSegmentRow[] {
  return cached(`detail:invoiceSegments:${invoiceDocId}`, () => {
    if (!can("serviceSegments")) return [];
    return query<InvoiceSegmentRow>(
      `SELECT s.SegmentId segmentId, s.ServiceCode serviceCode,
              ${hasColumn("InvoiceSegment", "SegmentStatus") ? "s.SegmentStatus" : "NULL"} segmentStatus,
              ${hasColumn("InvoiceSegment", "Complaint") ? "s.Complaint" : "NULL"} complaint,
              COALESCE(s.LaborAmount, 0) laborAmount, COALESCE(s.LaborHours, 0) laborHours,
              ${hasColumn("InvoiceSegment", "UnitStockNo") ? "s.UnitStockNo" : "NULL"} unitStockNo
       FROM InvoiceSegment s WHERE s.InvoiceDocId = ?`,
      [invoiceDocId],
    ).map((r) => ({ ...r, laborAmount: num(r.laborAmount), laborHours: num(r.laborHours) }));
  });
}
