import { cached, query, queryOne } from "../db";
import { can, hasColumn, hasTable } from "../schema";
import { serviceCodeClassification } from "../services/codes";
import {
  isPartsInvoice,
  isRentalInvoice,
  isServiceInvoice,
  POSTED,
  daysBetween,
  monthsBefore,
  num,
  placeholders,
  today,
  windows,
} from "../sql";

export type ContactCard = {
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
};

export type CustomerMetrics = {
  customerId: number;
  customerNo: string;
  customerName: string;
  classCode: string | null;
  classLabel: string | null;
  locationName: string | null;
  isActive: boolean;

  machinesOwned: number;

  /** Posted revenue only, split by what the customer was actually buying. */
  spend: {
    lifetime: number;
    t12: number;
    prev12: number;
    parts12: number;
    service12: number;
    rental12: number;
    rentalInvoices12: number;
    units12: number;
    /** Parts + service + rental: the recurring wallet, excluding machine purchases. */
    aftermarket12: number;
    servicePrev12: number;
    partsPrev12: number;
    rentalPrev12: number;
    unitsPrev12: number;
    aftermarketPrev12: number;
    /**
     * Recurring spend over the twelve months ending at their last invoice,
     * which is what a dormant account was worth while it was still active.
     */
    aftermarketLastActive12: number;
    lastActiveWindowStart: string | null;
  };

  invoices: {
    lifetime: number;
    t12: number;
    avgValue: number;
    firstDate: string | null;
    lastDate: string | null;
  };

  service: {
    workOrders12: number;
    workOrdersLifetime: number;
    laborHours12: number;
    laborRevenue12: number;
    proactiveVisits12: number;
    reactiveVisits12: number;
    proactiveSpend12: number;
    reactiveSpend12: number;
    lastServiceDate: string | null;
    lastProactiveDate: string | null;
  };

  churn: {
    comebackVisits12: number;
    comebackHours12: number;
    comebackSpend12: number;
    smallVisits12: number;
    overruns12: number;
    slipDays12: number;
    quoteChurn12: number;
    openWorkOrders: number;
  };

  warranty: {
    /** Coverage ending within three months: the moment to have the conversation. */
    expiringSoon: number;
    /** Ended within the last twelve months, so still a live conversation. */
    recentlyExpired: number;
    /** Long out of coverage; context, not a trigger. */
    longExpired: number;
  };

  contact: ContactCard | null;
  contactCompleteness: { contacts: number; withPhone: number; withEmail: number };

  /** Share of the recurring wallet that is service work. */
  serviceShareOfWallet: number | null;
  daysSinceLastPurchase: number | null;
  /** Average days between posted invoices across their history. */
  avgPurchaseIntervalDays: number | null;
  /** Months of the year, 1-12, where this customer historically spends most. */
  peakMonths: number[];
};

function indexRows<T extends { cid: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((r) => [Number(r.cid), r]));
}

/**
 * Which schedule date downtime is measured against. `PromisedDate` is what the
 * customer was told, so it is the only one worth quoting back to them.
 * `RequiredDate` is an internal target, and is the fallback.
 */
export function slipBasisColumn(): "PromisedDate" | "RequiredDate" {
  return hasColumn("WorkOrderSchedule", "PromisedDate") ? "PromisedDate" : "RequiredDate";
}

export function slipBasisLabel(): string {
  return slipBasisColumn() === "PromisedDate" ? "promised date" : "required date";
}

/** Median work order value, used to define what counts as a low-value visit. */
export function medianWorkOrderValue(): number {
  return cached("metrics:medianWo", () => {
    if (!can("core")) return 0;
    const row = queryOne<{ v: number }>(
      `SELECT AVG(v) v FROM (
         SELECT ih.TotalInvoice v,
                ROW_NUMBER() OVER (ORDER BY ih.TotalInvoice) rn,
                COUNT(*) OVER () c
         FROM InvoiceHeader ih
         WHERE ${POSTED} AND ${isServiceInvoice()} AND ih.TotalInvoice > 0
       )
       WHERE rn IN ((c + 1) / 2, (c + 2) / 2)`,
    );
    return num(row?.v);
  });
}

/**
 * The blended labor rate the dealership actually charges, derived from posted
 * service segments rather than assumed.
 */
export function blendedLaborRate(): number | null {
  return cached("metrics:laborRate", () => {
    if (!can("serviceSegments")) return null;
    const row = queryOne<{ amount: number; hours: number }>(
      `SELECT SUM(s.LaborAmount) amount, SUM(s.LaborHours) hours
       FROM InvoiceSegment s
       JOIN InvoiceHeader ih ON ih.InvoiceDocId = s.InvoiceDocId
       WHERE ${POSTED} AND s.LaborHours > 0`,
    );
    const hours = num(row?.hours);
    if (hours <= 0) return null;
    return num(row?.amount) / hours;
  });
}

export function customerMetrics(): Map<number, CustomerMetrics> {
  return cached("metrics:customers", () => {
    if (!can("core")) return new Map<number, CustomerMetrics>();

    const w = windows();
    const { proactive } = serviceCodeClassification();
    const smallVisitCeiling = medianWorkOrderValue() * 0.5;

    // ------------------------------------------------------------------ base
    const classJoin = can("customerClass")
      ? `LEFT JOIN CustomerClass cc ON cc.CustomerClassId = c.CustomerClassId`
      : "";
    const classCols = can("customerClass")
      ? `${hasColumn("CustomerClass", "ClassCode") ? "cc.ClassCode" : "cc.Description"} AS classCode, cc.Description AS classLabel`
      : `NULL AS classCode, NULL AS classLabel`;
    const locationJoin = hasTable("Location") ? `LEFT JOIN Location l ON l.LocationId = c.LocationId` : "";
    const locationCol = hasTable("Location") ? `l.Description AS locationName` : `NULL AS locationName`;

    const base = query<{
      cid: number;
      customerNo: string;
      customerName: string;
      classCode: string | null;
      classLabel: string | null;
      locationName: string | null;
      isActive: number | null;
    }>(
      `SELECT c.CustomerId cid, c.CustomerNo customerNo, c.CustomerName customerName,
              ${classCols}, ${locationCol},
              ${hasColumn("Customer", "IsActive") ? "c.IsActive" : "1"} isActive
       FROM Customer c ${classJoin} ${locationJoin}`,
    );

    // ----------------------------------------------------------------- spend
    const spend = indexRows(
      query<Record<string, number> & { cid: number; firstDate: string; lastDate: string }>(
        `SELECT ih.CustomerId cid,
                SUM(ih.TotalInvoice) lifetime,
                SUM(CASE WHEN ih.ActivityDate >= ? THEN ih.TotalInvoice ELSE 0 END) t12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ih.ActivityDate < ? THEN ih.TotalInvoice ELSE 0 END) prev12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ${isServiceInvoice()} THEN ih.TotalInvoice ELSE 0 END) service12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ih.ActivityDate < ? AND ${isServiceInvoice()} THEN ih.TotalInvoice ELSE 0 END) servicePrev12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ${isPartsInvoice()} THEN ih.TotalInvoice ELSE 0 END) parts12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ih.ActivityDate < ? AND ${isPartsInvoice()} THEN ih.TotalInvoice ELSE 0 END) partsPrev12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ih.ActivityDate < ? AND ${isRentalInvoice()} THEN ih.TotalInvoice ELSE 0 END) rentalPrev12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ${isRentalInvoice()} THEN ih.TotalInvoice ELSE 0 END) rental12,
                SUM(CASE WHEN ih.ActivityDate >= ? AND ${isRentalInvoice()} THEN 1 ELSE 0 END) rentalInvoices12,
                COUNT(*) lifetimeCount,
                SUM(CASE WHEN ih.ActivityDate >= ? THEN 1 ELSE 0 END) count12,
                MIN(ih.ActivityDate) firstDate, MAX(ih.ActivityDate) lastDate
         FROM InvoiceHeader ih
         WHERE ${POSTED}
         GROUP BY ih.CustomerId`,
        [w.t12, w.t24, w.t12, w.t12, w.t24, w.t12, w.t12, w.t24, w.t12, w.t24, w.t12, w.t12, w.t12, w.t12],
      ),
    );

    /**
     * Recurring spend across the twelve months ending at this customer's own
     * last invoice, rather than a fixed calendar window.
     *
     * A win-back is priced on what the account was worth while it was still
     * active. A fixed 12-24-months-ago window drifts off that activity as the
     * account goes quiet, so the longer someone has been gone the less the
     * estimate claims they are worth, which is backwards.
     */
    const unitLineCte = hasTable("SaleUnit") && can("invoiceLines")
      ? `, unitline AS (
           SELECT d.InvoiceDocId doc, SUM(d.NetExt) amt
           FROM SaleUnit su JOIN InvoiceDetail d ON d.ItemId = su.ItemId
           GROUP BY d.InvoiceDocId
         )`
      : "";
    const lastActive = !can("core")
      ? new Map<number, { cid: number; service: number; parts: number; rental: number; units: number; windowStart: string }>()
      : indexRows(
          query<{ cid: number; service: number; parts: number; rental: number; units: number; windowStart: string }>(
            `WITH last AS (
               SELECT ih.CustomerId cid, MAX(ih.ActivityDate) d
               FROM InvoiceHeader ih WHERE ${POSTED} GROUP BY ih.CustomerId
             )${unitLineCte}
             SELECT l.cid,
                    SUM(CASE WHEN ${isServiceInvoice()} THEN ih.TotalInvoice ELSE 0 END) service,
                    SUM(CASE WHEN ${isPartsInvoice()} THEN ih.TotalInvoice ELSE 0 END) parts,
                    SUM(CASE WHEN ${isRentalInvoice()} THEN ih.TotalInvoice ELSE 0 END) rental,
                    ${unitLineCte ? "COALESCE(SUM(u.amt), 0)" : "0"} units,
                    date(substr(l.d, 1, 10), '-365 day') windowStart
             FROM last l
             JOIN InvoiceHeader ih ON ih.CustomerId = l.cid
             ${unitLineCte ? "LEFT JOIN unitline u ON u.doc = ih.InvoiceDocId" : ""}
             WHERE ${POSTED}
               AND ih.ActivityDate > date(substr(l.d, 1, 10), '-365 day')
               AND ih.ActivityDate <= l.d
             GROUP BY l.cid`,
          ),
        );

    // Machine purchases are excluded from the recurring wallet so a single
    // equipment sale does not swamp the service share.
    const unitRevenue = hasTable("SaleUnit") && can("invoiceLines")
      ? indexRows(
          query<{ cid: number; units12: number; unitsPrev12: number }>(
            `SELECT ih.CustomerId cid,
                    SUM(CASE WHEN ih.ActivityDate >= ? THEN d.NetExt ELSE 0 END) units12,
                    SUM(CASE WHEN ih.ActivityDate >= ? AND ih.ActivityDate < ? THEN d.NetExt ELSE 0 END) unitsPrev12
             FROM SaleUnit su
             JOIN InvoiceDetail d ON d.ItemId = su.ItemId
             JOIN InvoiceHeader ih ON ih.InvoiceDocId = d.InvoiceDocId
             WHERE ${POSTED}
             GROUP BY ih.CustomerId`,
            [w.t12, w.t24, w.t12],
          ),
        )
      : new Map<number, { cid: number; units12: number; unitsPrev12: number }>();

    // -------------------------------------------------------------- machines
    const machines = can("unitOwnership")
      ? indexRows(
          query<{ cid: number; owned: number }>(
            `SELECT uc.CustomerId cid, COUNT(DISTINCT uc.UnitId) owned
             FROM UnitCustomer uc
             ${hasColumn("UnitCustomer", "Source") ? `WHERE LOWER(COALESCE(uc.Source,'sale')) NOT LIKE 'rent%'` : ""}
             GROUP BY uc.CustomerId`,
          ),
        )
      : new Map<number, { cid: number; owned: number }>();

    // --------------------------------------------------------------- service
    const proactiveIn = placeholders(proactive.length);

    // Classify each work order once at document level, otherwise joining
    // multi-segment work orders would multiply the invoice total.
    const service = can("serviceSegments")
      ? indexRows(
          query<Record<string, number> & { cid: number; lastServiceDate: string; lastProactiveDate: string }>(
            `WITH docs AS (
               SELECT ih.InvoiceDocId doc, ih.CustomerId cid, ih.ActivityDate d, ih.TotalInvoice total,
                      MAX(CASE WHEN s.ServiceCode IN (${proactiveIn}) THEN 1 ELSE 0 END) isProactive
               FROM InvoiceHeader ih
               JOIN InvoiceSegment s ON s.InvoiceDocId = ih.InvoiceDocId
               WHERE ${POSTED}
               GROUP BY ih.InvoiceDocId
             )
             SELECT cid,
                    COUNT(*) workOrdersLifetime,
                    SUM(CASE WHEN d >= ? THEN 1 ELSE 0 END) workOrders12,
                    SUM(CASE WHEN d >= ? AND isProactive = 1 THEN 1 ELSE 0 END) proactiveVisits12,
                    SUM(CASE WHEN d >= ? AND isProactive = 0 THEN 1 ELSE 0 END) reactiveVisits12,
                    SUM(CASE WHEN d >= ? AND isProactive = 1 THEN total ELSE 0 END) proactiveSpend12,
                    SUM(CASE WHEN d >= ? AND isProactive = 0 THEN total ELSE 0 END) reactiveSpend12,
                    MAX(d) lastServiceDate,
                    MAX(CASE WHEN isProactive = 1 THEN d END) lastProactiveDate
             FROM docs
             GROUP BY cid`,
            [...proactive, w.t12, w.t12, w.t12, w.t12, w.t12],
          ),
        )
      : new Map();

    const serviceLabor = can("serviceSegments")
      ? indexRows(
          query<{ cid: number; laborHours12: number; laborRevenue12: number }>(
            `SELECT ih.CustomerId cid, SUM(s.LaborHours) laborHours12, SUM(s.LaborAmount) laborRevenue12
             FROM InvoiceHeader ih
             JOIN InvoiceSegment s ON s.InvoiceDocId = ih.InvoiceDocId
             WHERE ${POSTED} AND ih.ActivityDate >= ?
             GROUP BY ih.CustomerId`,
            [w.t12],
          ),
        )
      : new Map<number, { cid: number; laborHours12: number; laborRevenue12: number }>();

    // -------------------------------------------------------------- comebacks
    const comebacks =
      can("serviceSegments") && can("core")
        ? indexRows(
            query<{ cid: number; visits: number; spend: number; hours: number }>(
              `WITH svc AS (
                 SELECT ih.InvoiceDocId doc, ih.CustomerId cid,
                        COALESCE(${hasColumn("InvoiceHeader", "UnitId") ? "ih.UnitId" : "NULL"}, s.UnitId) unit,
                        s.ServiceCode code, ih.ActivityDate d, ih.TotalInvoice total
                 FROM InvoiceHeader ih
                 JOIN InvoiceSegment s ON s.InvoiceDocId = ih.InvoiceDocId
                 WHERE ${POSTED}
               ),
               comeback AS (
                 SELECT DISTINCT a.doc, a.cid, a.total
                 FROM svc a
                 JOIN svc b ON b.cid = a.cid AND b.unit = a.unit AND b.code = a.code AND b.doc <> a.doc
                 WHERE a.d >= ? AND a.unit IS NOT NULL
                   AND julianday(a.d) - julianday(b.d) > 0
                   AND julianday(a.d) - julianday(b.d) <= 90
               )${
                 // Technician time is a separate capability from the segments
                 // that identify a comeback, so the visit and spend counts
                 // still work on a database that does not track hours.
                 can("technicianTime")
                   ? `,
               hrs AS (
                 SELECT c.cid, SUM(w.ElapsedHours) h
                 FROM comeback c JOIN WorkInProgress w ON w.InvoiceDocId = c.doc
                 GROUP BY c.cid
               )`
                   : ""
               }
               SELECT c.cid, COUNT(*) visits, SUM(c.total) spend,
                      ${can("technicianTime") ? "COALESCE(MAX(h.h), 0)" : "0"} hours
               FROM comeback c ${can("technicianTime") ? "LEFT JOIN hrs h ON h.cid = c.cid" : ""}
               GROUP BY c.cid`,
              [w.t12],
            ),
          )
        : new Map<number, { cid: number; visits: number; spend: number; hours: number }>();

    // ---------------------------------------------------------- churn extras
    const churnExtras = !can("core")
      ? new Map<number, Record<string, number> & { cid: number }>()
      : indexRows(
      query<Record<string, number> & { cid: number }>(
        `SELECT ih.CustomerId cid,
                SUM(CASE WHEN ${isServiceInvoice()} AND ih.TotalInvoice > 0 AND ih.TotalInvoice < ? THEN 1 ELSE 0 END) smallVisits12,
                ${
                  hasColumn("InvoiceHeader", "EstimatedTotal")
                    ? `SUM(CASE WHEN ${isServiceInvoice()} AND ih.EstimatedTotal > 0 AND ih.TotalInvoice > ih.EstimatedTotal * 1.25 THEN 1 ELSE 0 END)`
                    : "0"
                } overruns12
         FROM InvoiceHeader ih
         WHERE ${POSTED} AND ih.ActivityDate >= ?
         GROUP BY ih.CustomerId`,
        [Math.max(smallVisitCeiling, 1), w.t12],
      ),
    );

    const quoteChurn = !can("core")
      ? new Map<number, { cid: number; quotes: number }>()
      : indexRows(
          query<{ cid: number; quotes: number }>(
            `SELECT ih.CustomerId cid, COUNT(*) quotes
             FROM InvoiceHeader ih
             WHERE LOWER(ih.Status) IN ('quote','draft') AND ih.ActivityDate >= ?
             GROUP BY ih.CustomerId`,
            [w.t12],
          ),
        );

    // The date the customer was told, when the schema records it. Slipping
    // past an internal required date is not the same promise, and this number
    // gets said out loud on the call.
    const due = slipBasisColumn();
    const slips = can("schedule") && hasColumn("WorkOrderSchedule", due)
      ? indexRows(
          query<{ cid: number; slipDays: number }>(
            `SELECT ih.CustomerId cid,
                    SUM(MAX(julianday(sch.ActualDate) - julianday(sch.${due}), 0)) slipDays
             FROM WorkOrderSchedule sch
             JOIN InvoiceHeader ih ON ih.InvoiceDocId = sch.InvoiceDocId
             WHERE ${POSTED} AND ih.ActivityDate >= ?
               AND sch.ActualDate IS NOT NULL AND sch.${due} IS NOT NULL
             GROUP BY ih.CustomerId`,
            [w.t12],
          ),
        )
      : new Map<number, { cid: number; slipDays: number }>();

    const openWos =
      can("workOrderStatus") && hasColumn("InvoiceHeader", "WorkOrderStatusId")
        ? indexRows(
            query<{ cid: number; open: number }>(
              `SELECT ih.CustomerId cid, COUNT(*) open
               FROM InvoiceHeader ih
               JOIN SettingsWorkOrderStatus st ON st.WorkOrderStatusId = ih.WorkOrderStatusId
               WHERE ${hasColumn("SettingsWorkOrderStatus", "IsOpen") ? "st.IsOpen = 1" : "LOWER(st.Description) NOT IN ('closed','invoiced')"}
               GROUP BY ih.CustomerId`,
            ),
          )
        : new Map<number, { cid: number; open: number }>();

    // --------------------------------------------------------------- contacts
    const contactRows = can("contacts")
      ? query<{
          cid: number;
          contactId: number;
          firstName: string | null;
          lastName: string | null;
          title: string | null;
          isPrimary: number | null;
          phone: string | null;
          email: string | null;
        }>(
          `SELECT ct.CustomerId cid, ct.ContactId contactId,
                  ${hasColumn("Contact", "FirstName") ? "ct.FirstName" : "NULL"} firstName,
                  ${hasColumn("Contact", "LastName") ? "ct.LastName" : "NULL"} lastName,
                  ${hasColumn("Contact", "Title") ? "ct.Title" : "NULL"} title,
                  ${hasColumn("Contact", "IsPrimary") ? "ct.IsPrimary" : "0"} isPrimary,
                  ${hasTable("CustomerPhone") ? "(SELECT p.PhoneNo FROM CustomerPhone p WHERE p.ContactId = ct.ContactId ORDER BY COALESCE(p.IsPrimary,0) DESC LIMIT 1)" : "NULL"} phone,
                  ${hasTable("CustomerEmail") ? "(SELECT e.EmailAddress FROM CustomerEmail e WHERE e.ContactId = ct.ContactId ORDER BY COALESCE(e.IsPrimary,0) DESC LIMIT 1)" : "NULL"} email
           FROM Contact ct`,
        )
      : [];

    const contactsByCustomer = new Map<number, typeof contactRows>();
    for (const row of contactRows) {
      const list = contactsByCustomer.get(Number(row.cid)) ?? [];
      list.push(row);
      contactsByCustomer.set(Number(row.cid), list);
    }

    // --------------------------------------------------------------- warranty
    const warrantySoonEnd = monthsBefore(-3);
    const warranty = can("warranty") && can("unitOwnership")
      ? indexRows(
          query<{ cid: number; soon: number; recent: number; longAgo: number }>(
            `SELECT uc.CustomerId cid,
                    SUM(CASE WHEN us.WarrantyEndDate >= ? AND us.WarrantyEndDate <= ? THEN 1 ELSE 0 END) soon,
                    SUM(CASE WHEN us.WarrantyEndDate < ? AND us.WarrantyEndDate >= ? THEN 1 ELSE 0 END) recent,
                    SUM(CASE WHEN us.WarrantyEndDate < ? THEN 1 ELSE 0 END) longAgo
             FROM UnitCustomer uc
             JOIN UnitSerial us ON us.UnitId = uc.UnitId
             WHERE us.WarrantyEndDate IS NOT NULL
             GROUP BY uc.CustomerId`,
            [today(), warrantySoonEnd, today(), w.t12, w.t12],
          ),
        )
      : new Map<number, { cid: number; soon: number; recent: number; longAgo: number }>();

    // ------------------------------------------------------------ seasonality
    const seasonRows = query<{ cid: number; m: number; v: number }>(
      `SELECT ih.CustomerId cid, CAST(substr(ih.ActivityDate, 6, 2) AS INTEGER) m, SUM(ih.TotalInvoice) v
       FROM InvoiceHeader ih
       WHERE ${POSTED} AND ${isServiceInvoice()}
       GROUP BY ih.CustomerId, m`,
    );
    const seasonByCustomer = new Map<number, { m: number; v: number }[]>();
    for (const row of seasonRows) {
      const list = seasonByCustomer.get(Number(row.cid)) ?? [];
      if (row.m >= 1 && row.m <= 12) list.push({ m: Number(row.m), v: num(row.v) });
      seasonByCustomer.set(Number(row.cid), list);
    }

    // ------------------------------------------------------------------ merge
    const now = today();
    const out = new Map<number, CustomerMetrics>();

    for (const row of base) {
      const cid = Number(row.cid);
      const s = spend.get(cid);
      const svc = service.get(cid);
      const cb = comebacks.get(cid);
      const extra = churnExtras.get(cid);
      const contacts = contactsByCustomer.get(cid) ?? [];

      const lifetimeCount = num(s?.lifetimeCount);
      const lastDate = s?.lastDate ?? null;
      const firstDate = s?.firstDate ?? null;

      const units12 = num(unitRevenue.get(cid)?.units12);
      const parts12 = num(s?.parts12);
      const service12 = num(s?.service12);
      const rental12 = num(s?.rental12);
      // Parts invoices carry machine sales too, so remove that slice.
      const aftermarket12 = Math.max(parts12 - units12, 0) + service12 + rental12;
      const unitsPrev12 = num(unitRevenue.get(cid)?.unitsPrev12);
      const aftermarketPrev12 =
        Math.max(num(s?.partsPrev12) - unitsPrev12, 0) + num(s?.servicePrev12) + num(s?.rentalPrev12);
      const la = lastActive.get(cid);
      const aftermarketLastActive12 =
        Math.max(num(la?.parts) - num(la?.units), 0) + num(la?.service) + num(la?.rental);

      const withPhone = contacts.filter((c) => c.phone).length;
      const withEmail = contacts.filter((c) => c.email).length;
      const bestContact =
        [...contacts]
          .sort(
            (a, b) =>
              (b.phone && b.email ? 2 : b.phone || b.email ? 1 : 0) - (a.phone && a.email ? 2 : a.phone || a.email ? 1 : 0) ||
              num(b.isPrimary) - num(a.isPrimary),
          )
          .find((c) => c.phone || c.email) ?? null;

      const season = (seasonByCustomer.get(cid) ?? []).sort((a, b) => b.v - a.v);
      const seasonTotal = season.reduce((acc, x) => acc + x.v, 0);
      const peakMonths = seasonTotal > 0 ? season.slice(0, 3).filter((x) => x.v > seasonTotal / 12).map((x) => x.m) : [];

      out.set(cid, {
        customerId: cid,
        customerNo: String(row.customerNo ?? ""),
        customerName: String(row.customerName ?? "Unnamed customer"),
        classCode: row.classCode ?? null,
        classLabel: row.classLabel ?? null,
        locationName: row.locationName ?? null,
        isActive: num(row.isActive) !== 0,
        machinesOwned: num(machines.get(cid)?.owned),
        spend: {
          lifetime: num(s?.lifetime),
          t12: num(s?.t12),
          prev12: num(s?.prev12),
          parts12,
          service12,
          rental12,
          rentalInvoices12: num(s?.rentalInvoices12),
          units12,
          aftermarket12,
          servicePrev12: num(s?.servicePrev12),
          partsPrev12: num(s?.partsPrev12),
          rentalPrev12: num(s?.rentalPrev12),
          unitsPrev12,
          aftermarketPrev12,
          aftermarketLastActive12,
          lastActiveWindowStart: la?.windowStart ?? null,
        },
        invoices: {
          lifetime: lifetimeCount,
          t12: num(s?.count12),
          avgValue: lifetimeCount > 0 ? num(s?.lifetime) / lifetimeCount : 0,
          firstDate,
          lastDate,
        },
        service: {
          workOrders12: num(svc?.workOrders12),
          workOrdersLifetime: num(svc?.workOrdersLifetime),
          laborHours12: num(serviceLabor.get(cid)?.laborHours12),
          laborRevenue12: num(serviceLabor.get(cid)?.laborRevenue12),
          proactiveVisits12: num(svc?.proactiveVisits12),
          reactiveVisits12: num(svc?.reactiveVisits12),
          proactiveSpend12: num(svc?.proactiveSpend12),
          reactiveSpend12: num(svc?.reactiveSpend12),
          lastServiceDate: svc?.lastServiceDate ?? null,
          lastProactiveDate: svc?.lastProactiveDate ?? null,
        },
        churn: {
          comebackVisits12: num(cb?.visits),
          comebackHours12: num(cb?.hours),
          comebackSpend12: num(cb?.spend),
          smallVisits12: num(extra?.smallVisits12),
          overruns12: num(extra?.overruns12),
          slipDays12: num(slips.get(cid)?.slipDays),
          quoteChurn12: num(quoteChurn.get(cid)?.quotes),
          openWorkOrders: num(openWos.get(cid)?.open),
        },
        warranty: {
          expiringSoon: num(warranty.get(cid)?.soon),
          recentlyExpired: num(warranty.get(cid)?.recent),
          longExpired: num(warranty.get(cid)?.longAgo),
        },
        contact: bestContact
          ? {
              name: [bestContact.firstName, bestContact.lastName].filter(Boolean).join(" ") || "Contact on file",
              title: bestContact.title ?? null,
              phone: bestContact.phone ?? null,
              email: bestContact.email ?? null,
            }
          : null,
        contactCompleteness: { contacts: contacts.length, withPhone, withEmail },
        serviceShareOfWallet: aftermarket12 > 0 ? service12 / aftermarket12 : null,
        daysSinceLastPurchase: lastDate ? daysBetween(lastDate, now) : null,
        avgPurchaseIntervalDays:
          firstDate && lastDate && lifetimeCount > 1 ? daysBetween(firstDate, lastDate) / (lifetimeCount - 1) : null,
        peakMonths,
      });
    }

    return out;
  });
}

export function customerMetric(customerId: number): CustomerMetrics | undefined {
  return customerMetrics().get(customerId);
}
