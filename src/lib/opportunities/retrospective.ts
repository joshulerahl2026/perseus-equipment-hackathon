import { CustomerMetrics, slipBasisLabel } from "../metrics/customers";

/**
 * The backward-looking case: what the past twelve months would have been worth
 * had the recommended service been in place. Stronger than a forecast, because
 * both sides already know how the year went.
 *
 * Actual spend, prices and downtime are data. How much reactive spend a plan
 * would have prevented is an assumption, kept separate and labelled.
 */

export type Retrospective = {
  actual: {
    serviceSpend: number;
    reactiveSpend: number;
    proactiveSpend: number;
    comebackSpend: number;
    comebackVisits: number;
    workOrders: number;
    downtimeDays: number;
  };
  /** What the offering would have cost them, at its measured price basis. */
  wouldHaveCost: number | null;
  /**
   * What the customer would have paid on top of what they already spend, which
   * is the same dollar the dealership would have booked: one side's added cost
   * is the other side's added revenue.
   */
  incrementalCost: number | null;
  /** Revenue the dealership did not book. */
  missedRevenue: number | null;
  missedContribution: number | null;
  /** Reactive repair spend the offering could plausibly have prevented. */
  avoidableReactive: number;
  /** The customer's side: avoidable reactive spend less the added cost. */
  customerNetPosition: number | null;
  avoidableShare: number;
  notes: string[];
};

/**
 * A plan is how a customer buys service instead of buying it ad hoc, so its
 * price stands in for spend they already make. An inspection sits on top of
 * whatever repairs the year brings, so all of it is incremental.
 */
export type PriceRelation = "replaces-existing-service" | "adds-to-existing-service";

export function retrospective(
  m: CustomerMetrics,
  wouldHaveCost: number | null,
  contributionRate: number,
  avoidableShare: number,
  relation: PriceRelation = "replaces-existing-service",
): Retrospective {
  const reactive = m.service.reactiveSpend12;
  const avoidable = reactive * avoidableShare;

  const incrementalCost =
    wouldHaveCost == null
      ? null
      : relation === "replaces-existing-service"
        ? Math.max(wouldHaveCost - m.spend.service12, 0)
        : wouldHaveCost;

  const netPosition = incrementalCost != null ? avoidable - incrementalCost : null;

  const notes: string[] = [];
  if (reactive === 0) notes.push("No reactive repair spend in the last twelve months, so the saving case rests on risk rather than history.");
  if (m.churn.comebackVisits12 > 0) {
    notes.push(`${m.churn.comebackVisits12} of those visits were repeat trips on a machine already in the shop within 90 days.`);
  }
  if (m.churn.slipDays12 > 0) {
    notes.push(`Their machines sat past the ${slipBasisLabel()} by ${Math.round(m.churn.slipDays12)} day${Math.round(m.churn.slipDays12) === 1 ? "" : "s"} in total.`);
  }
  if (netPosition != null && netPosition < 0) {
    notes.push(
      "The added cost is larger than the repair spend it would have avoided, so this is an uptime and machine-life argument rather than a straight saving. Say that plainly rather than claiming it pays for itself.",
    );
  }

  return {
    actual: {
      serviceSpend: m.spend.service12,
      reactiveSpend: reactive,
      proactiveSpend: m.service.proactiveSpend12,
      comebackSpend: m.churn.comebackSpend12,
      comebackVisits: m.churn.comebackVisits12,
      workOrders: m.service.workOrders12,
      downtimeDays: m.churn.slipDays12,
    },
    wouldHaveCost,
    incrementalCost,
    missedRevenue: incrementalCost,
    missedContribution: incrementalCost != null ? incrementalCost * contributionRate : null,
    avoidableReactive: avoidable,
    customerNetPosition: netPosition,
    avoidableShare,
    notes,
  };
}
