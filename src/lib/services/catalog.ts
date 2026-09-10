/**
 * What the dealership actually sells. Recommendations pair a qualifying signal
 * with one of these, and prices are derived from what comparable customers pay
 * rather than invented here.
 */
export type OfferingId =
  | "maintenance_plan"
  | "annual_inspection"
  | "onsite_training"
  | "extended_coverage"
  | "parts_stocking"
  | "rental_to_own";

export type Offering = {
  id: OfferingId;
  name: string;
  /** One line a rep can say about what it is. */
  summary: string;
  /** What the customer gets, in their language. */
  customerBenefit: string;
  /** Where the price on screen comes from. */
  pricingBasis: string;
  /** Cost-avoidance pitches are argued from hours wasted, not revenue added. */
  framing: "revenue" | "cost-avoidance";
};

export const OFFERINGS: Record<OfferingId, Offering> = {
  maintenance_plan: {
    id: "maintenance_plan",
    name: "Scheduled maintenance plan",
    summary: "Planned service at set intervals instead of waiting for a breakdown.",
    customerBenefit: "Fewer surprise repairs in the busy season, and a predictable annual cost per machine.",
    pricingBasis: "Annual service spend per machine among comparable customers.",
    framing: "revenue",
  },
  annual_inspection: {
    id: "annual_inspection",
    name: "Annual inspection",
    summary: "A single scheduled inspection that finds wear before it becomes a failure.",
    customerBenefit: "A written condition report per machine, and a repair list you can budget for.",
    pricingBasis: "Blended labor rate times the median technician hours a planned visit takes.",
    framing: "revenue",
  },
  onsite_training: {
    id: "onsite_training",
    name: "On-site best-practices training",
    summary: "A day at the customer's yard covering daily checks, service intervals, and how to submit work cleanly.",
    customerBenefit: "Fewer avoidable shop visits and less machine downtime during your season.",
    pricingBasis: "Adjustable training fee, compared against measured support-churn hours.",
    framing: "cost-avoidance",
  },
  extended_coverage: {
    id: "extended_coverage",
    name: "Extended coverage",
    summary: "Post-warranty protection for machines whose factory coverage has run out or is about to.",
    customerBenefit: "Keeps a major component failure from becoming an unbudgeted repair bill.",
    pricingBasis: "Reactive repair spend per machine per year measured across the customer base.",
    framing: "revenue",
  },
  parts_stocking: {
    id: "parts_stocking",
    name: "Parts stocking program",
    summary: "Stock the filters and wear parts this customer buys most on their own shelf.",
    customerBenefit: "The part is on hand when a machine goes down, instead of a trip to the counter.",
    pricingBasis: "Parts spend per machine among comparable customers.",
    framing: "revenue",
  },
  rental_to_own: {
    id: "rental_to_own",
    name: "Rental-to-own conversion",
    summary: "Convert repeat rental spend into a purchase or rent-to-own agreement.",
    customerBenefit: "Rental payments build equity in a machine instead of disappearing.",
    pricingBasis: "The customer's own trailing rental spend.",
    framing: "revenue",
  },
};

export const offering = (id: OfferingId): Offering => OFFERINGS[id];
