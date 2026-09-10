import { customerMetrics } from "../metrics/customers";
import { Assumptions } from "./training";
import { DormancyCategory, Opportunity, RuleId, buildOpportunities } from "./engine";

/**
 * Selection and filtering for the call list. The default view is the list the
 * request asked for: customers with no new service purchased in the past year.
 */

export const SEGMENTS = {
  dormant: {
    id: "dormant",
    label: "No new services this year",
    description: "Customers with posted history who have bought no planned service in the last twelve months.",
  },
  never_bought_service: {
    id: "never_bought_service",
    label: "Never bought service",
    description: "They own machines from us but have never had a work order here.",
  },
  lapsed_service: {
    id: "lapsed_service",
    label: "Lapsed",
    description: "They used to buy service and have bought none in over a year. Their own history proves they will.",
  },
  reactive_only: {
    id: "reactive_only",
    label: "Repairs only",
    description: "They come in when something breaks, but have never bought a plan, inspection or training.",
  },
  all: { id: "all", label: "Every opportunity", description: "All qualifying customers, dormant or not." },
} as const;

export type SegmentId = keyof typeof SEGMENTS;

export type CallListFilters = {
  segment: SegmentId;
  rule: RuleId | "all";
  classLabel: string | "all";
  machines: "all" | "0" | "1-2" | "3-5" | "6+";
  search: string;
  sort: "value" | "contribution" | "dormancy" | "name";
};

export const DEFAULT_FILTERS: CallListFilters = {
  segment: "dormant",
  rule: "all",
  classLabel: "all",
  machines: "all",
  search: "",
  sort: "value",
};

function matchesSegment(o: Opportunity, segment: SegmentId): boolean {
  if (segment === "all") return true;
  if (segment === "dormant") return o.dormancy.isDormantServices;
  return o.dormancy.category === (segment as DormancyCategory);
}

function matchesMachines(o: Opportunity, band: CallListFilters["machines"]): boolean {
  switch (band) {
    case "all":
      return true;
    case "0":
      return o.machinesOwned === 0;
    case "1-2":
      return o.machinesOwned >= 1 && o.machinesOwned <= 2;
    case "3-5":
      return o.machinesOwned >= 3 && o.machinesOwned <= 5;
    case "6+":
      return o.machinesOwned >= 6;
  }
}

export function filterOpportunities(
  filters: Partial<CallListFilters> = {},
  assumptions?: Partial<Assumptions>,
): Opportunity[] {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const needle = f.search.trim().toLowerCase();

  const rows = buildOpportunities(assumptions).filter((o) => {
    if (!matchesSegment(o, f.segment)) return false;
    if (f.rule !== "all" && o.rule !== f.rule) return false;
    if (f.classLabel !== "all" && (o.classLabel ?? "Unclassified") !== f.classLabel) return false;
    if (!matchesMachines(o, f.machines)) return false;
    if (needle && !`${o.customerName} ${o.customerNo}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const sorted = [...rows];
  switch (f.sort) {
    case "contribution":
      sorted.sort((a, b) => (b.estimate.contribution ?? -1) - (a.estimate.contribution ?? -1));
      break;
    case "dormancy":
      sorted.sort((a, b) => (b.dormancy.monthsSinceProactive ?? 999) - (a.dormancy.monthsSinceProactive ?? 999));
      break;
    case "name":
      sorted.sort((a, b) => a.customerName.localeCompare(b.customerName));
      break;
    default:
      sorted.sort((a, b) => (b.estimate.annualRevenue ?? -1) - (a.estimate.annualRevenue ?? -1));
  }
  return sorted;
}

export type CallListSummary = {
  opportunities: number;
  customers: number;
  /** Of those, the ones carrying a figure. The totals cover only these. */
  pricedCustomers: number;
  /** Each priced customer counted once, at their largest estimate. */
  totalRevenue: number;
  totalContribution: number;
  unquantified: number;
  /** Customers carrying more than one priced recommendation. */
  customersWithOverlap: number;
};

/**
 * Totals the pipeline once per customer rather than once per recommendation.
 *
 * Several rules can fire on the same account and reach for the same wallet:
 * below_peers and cadence_slipping both size the gap between what a customer
 * spends on service and what a comparable account spends. Adding those rows
 * together would book the same dollars twice, so the totals take each
 * customer's largest estimate and the rest of the rows stand as alternative
 * ways into the same conversation.
 */
export function summarize(rows: Opportunity[]): CallListSummary {
  const best = new Map<number, Opportunity>();
  const priced = new Map<number, number>();
  for (const o of rows) {
    const value = o.estimate.annualRevenue;
    if (value != null) priced.set(o.customerId, (priced.get(o.customerId) ?? 0) + 1);
    const held = best.get(o.customerId);
    if (!held || (value ?? -1) > (held.estimate.annualRevenue ?? -1)) best.set(o.customerId, o);
  }
  const headline = [...best.values()];

  return {
    opportunities: rows.length,
    customers: best.size,
    pricedCustomers: priced.size,
    totalRevenue: headline.reduce((acc, o) => acc + (o.estimate.annualRevenue ?? 0), 0),
    totalContribution: headline.reduce((acc, o) => acc + (o.estimate.contribution ?? 0), 0),
    unquantified: rows.filter((o) => o.estimate.annualRevenue == null).length,
    customersWithOverlap: [...priced.values()].filter((n) => n > 1).length,
  };
}

/** Distinct trade classes present in the data, for the filter control. */
export function customerClasses(): string[] {
  const set = new Set<string>();
  for (const m of customerMetrics().values()) set.add(m.classLabel ?? "Unclassified");
  return [...set].sort();
}

export function segmentCounts(assumptions?: Partial<Assumptions>): Record<SegmentId, number> {
  const all = buildOpportunities(assumptions);
  return {
    all: new Set(all.map((o) => o.customerId)).size,
    dormant: new Set(all.filter((o) => o.dormancy.isDormantServices).map((o) => o.customerId)).size,
    never_bought_service: new Set(all.filter((o) => o.dormancy.category === "never_bought_service").map((o) => o.customerId)).size,
    lapsed_service: new Set(all.filter((o) => o.dormancy.category === "lapsed_service").map((o) => o.customerId)).size,
    reactive_only: new Set(all.filter((o) => o.dormancy.category === "reactive_only").map((o) => o.customerId)).size,
  };
}
