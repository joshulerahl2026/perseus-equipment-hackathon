import { cached, query, queryOne } from "../db";
import { can } from "../schema";
import { serviceCodeClassification } from "../services/codes";
import { isServiceInvoice, POSTED, num, placeholders } from "../sql";
import { percentile } from "./cohorts";
import { customerMetrics } from "./customers";

/**
 * How revenue turns into money the dealership keeps.
 *
 * The schema carries parts cost (`SalePart.AvgCost`) but no technician wage
 * cost, so net profit is not computable from this data. Everything here is
 * labelled contribution: parts gross margin plus labor revenue.
 */
export type ContributionModel = {
  partsMarginRate: number | null;
  laborShareOfService: number;
  partsShareOfService: number;
  /**
   * Sales tax, shop supplies and anything else in the invoice total that is
   * neither labor nor a part. It carries no margin and is not the shop's to
   * keep, so it contributes nothing.
   */
  passThroughShareOfService: number;
  /** Whether the parts share was measured from line items or inferred. */
  partsShareMeasured: boolean;
  /** Blended share of a service dollar that lands as contribution. */
  contributionRate: number;
  explanation: string;
};

export function contributionModel(): ContributionModel {
  return cached("economics:contribution", () => {
    const partsMargin = can("partsCost")
      ? (() => {
          const row = queryOne<{ revenue: number; cost: number }>(
            `SELECT SUM(sp.NetExt) revenue, SUM(sp.Qty * sp.AvgCost) cost
             FROM SalePart sp
             JOIN InvoiceDetail d ON d.ItemId = sp.ItemId
             JOIN InvoiceHeader ih ON ih.InvoiceDocId = d.InvoiceDocId
             WHERE ${POSTED} AND sp.NetExt > 0 AND sp.AvgCost IS NOT NULL`,
          );
          const revenue = num(row?.revenue);
          if (revenue <= 0) return null;
          return Math.min(Math.max((revenue - num(row?.cost)) / revenue, 0), 0.95);
        })()
      : null;

    /**
     * The parts slice is measured from the line items rather than taken as
     * whatever is left after labor. An invoice total also carries sales tax
     * and shop supplies, and treating those as parts applies a parts margin to
     * money the dealership is only collecting on someone else's behalf.
     */
    const canMeasureParts = can("invoiceLines");
    const split = can("serviceSegments")
      ? queryOne<{ labor: number; parts: number | null; service: number }>(
          `SELECT
             (SELECT SUM(s.LaborAmount) FROM InvoiceSegment s
                JOIN InvoiceHeader ih ON ih.InvoiceDocId = s.InvoiceDocId WHERE ${POSTED}) labor,
             ${
               canMeasureParts
                 ? `(SELECT SUM(d.NetExt) FROM InvoiceDetail d
                       JOIN InvoiceHeader ih ON ih.InvoiceDocId = d.InvoiceDocId
                       WHERE ${POSTED} AND ${isServiceInvoice()} AND LOWER(d.ItemType) = 'part')`
                 : "NULL"
             } parts,
             (SELECT SUM(ih.TotalInvoice) FROM InvoiceHeader ih WHERE ${POSTED} AND ${isServiceInvoice()}) service`,
        )
      : undefined;

    const serviceRevenue = num(split?.service);
    const laborShare = serviceRevenue > 0 ? Math.min(num(split?.labor) / serviceRevenue, 1) : 0.5;
    const partsShare =
      canMeasureParts && serviceRevenue > 0
        ? Math.min(num(split?.parts) / serviceRevenue, Math.max(1 - laborShare, 0))
        : Math.max(1 - laborShare, 0);
    const passThroughShare = Math.max(1 - laborShare - partsShare, 0);
    const rate = laborShare + partsShare * (partsMargin ?? 0.3);

    const pct = (x: number) => Math.round(x * 100);
    return {
      partsMarginRate: partsMargin,
      laborShareOfService: laborShare,
      partsShareOfService: partsShare,
      passThroughShareOfService: passThroughShare,
      partsShareMeasured: canMeasureParts,
      contributionRate: rate,
      explanation:
        (partsMargin != null
          ? `${pct(laborShare)}% of service revenue here is labor, counted in full because the schema has no technician wage cost, plus ${pct(partsShare)}% parts at the ${pct(partsMargin)}% gross margin measured from SalePart.NetExt against AvgCost.`
          : `${pct(laborShare)}% of service revenue here is labor, plus ${pct(partsShare)}% parts at an assumed 30% margin because this database has no parts cost column.`) +
        (passThroughShare > 0.005
          ? ` The remaining ${pct(passThroughShare)}% is sales tax, shop supplies and other pass-through, which carries no margin and is left out.`
          : ""),
    };
  });
}

export type WorkOrderBenchmarks = {
  medianProactiveValue: number | null;
  medianReactiveValue: number | null;
  /** Annual reactive repair spend per machine, across customers who own machines. */
  medianReactiveSpendPerMachine: number | null;
  /**
   * Median technician hours on a planned visit. An inspection is a labor
   * visit, so pricing it from hours and the measured rate keeps it away from
   * the parts-heavy total of a full planned service.
   */
  medianProactiveLaborHours: number | null;
};

export function workOrderBenchmarks(): WorkOrderBenchmarks {
  return cached("economics:woBenchmarks", () => {
    if (!can("serviceSegments")) {
      return {
        medianProactiveValue: null,
        medianReactiveValue: null,
        medianReactiveSpendPerMachine: null,
        medianProactiveLaborHours: null,
      };
    }
    const { proactive } = serviceCodeClassification();
    const rows = query<{ total: number; laborHours: number; isProactive: number }>(
      `WITH docs AS (
         SELECT ih.InvoiceDocId doc, ih.TotalInvoice total,
                SUM(COALESCE(s.LaborHours, 0)) laborHours,
                MAX(CASE WHEN s.ServiceCode IN (${placeholders(proactive.length)}) THEN 1 ELSE 0 END) isProactive
         FROM InvoiceHeader ih
         JOIN InvoiceSegment s ON s.InvoiceDocId = ih.InvoiceDocId
         WHERE ${POSTED} AND ih.TotalInvoice > 0
         GROUP BY ih.InvoiceDocId
       )
       SELECT total, laborHours, isProactive FROM docs`,
      proactive,
    );

    const proRows = rows.filter((r) => num(r.isProactive) === 1);
    const pro = proRows.map((r) => num(r.total)).sort((a, b) => a - b);
    const re = rows.filter((r) => num(r.isProactive) === 0).map((r) => num(r.total)).sort((a, b) => a - b);
    const proHours = proRows.map((r) => num(r.laborHours)).filter((h) => h > 0).sort((a, b) => a - b);

    const perMachine = [...customerMetrics().values()]
      .filter((m) => m.machinesOwned > 0 && m.service.reactiveSpend12 > 0)
      .map((m) => m.service.reactiveSpend12 / m.machinesOwned)
      .sort((a, b) => a - b);

    return {
      medianProactiveValue: pro.length ? percentile(pro, 0.5) : null,
      medianReactiveValue: re.length ? percentile(re, 0.5) : null,
      medianReactiveSpendPerMachine: perMachine.length ? percentile(perMachine, 0.5) : null,
      medianProactiveLaborHours: proHours.length ? percentile(proHours, 0.5) : null,
    };
  });
}
