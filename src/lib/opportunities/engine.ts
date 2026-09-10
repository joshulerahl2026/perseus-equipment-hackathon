import { pluralize } from "../format";
import { cached } from "../db";
import { ResolvedCohort, expectedServiceSpend, resolveCohort } from "../metrics/cohorts";
import { CustomerMetrics, blendedLaborRate, customerMetrics, slipBasisLabel } from "../metrics/customers";
import { contributionModel, workOrderBenchmarks } from "../metrics/economics";
import { Offering, OfferingId, offering } from "../services/catalog";
import { daysBetween, today } from "../sql";
import { Approach, approachFor } from "./approach";
import { PriceRelation, Retrospective, retrospective } from "./retrospective";
import { Assumptions, ChurnProfile, TrainingPayback, churnProfile, defaultAssumptions, trainingPayback } from "./training";

export type RuleId =
  | "never_serviced"
  | "parts_only"
  | "below_peers"
  | "warranty_lapsing"
  | "repeat_renter"
  | "cadence_slipping"
  | "support_churn";

export const RULE_LABELS: Record<RuleId, string> = {
  never_serviced: "Owns machines, never serviced here",
  parts_only: "Buys parts, never buys labor",
  below_peers: "Service spend below comparable customers",
  warranty_lapsing: "Warranty lapsing or lapsed",
  repeat_renter: "Repeat renter",
  cadence_slipping: "Purchase cadence slipping",
  support_churn: "High support churn",
};

/** Every figure is tagged so the call sheet can separate fact from input. */
export type MathRow = {
  label: string;
  value: number | string;
  format: "money" | "number" | "hours" | "percent" | "days" | "text";
  kind: "data" | "derived" | "assumption";
  note?: string;
};

export type Confidence = "high" | "medium" | "low" | "insufficient";

export type DormancyCategory = "never_bought_service" | "lapsed_service" | "reactive_only" | "current";

export type Dormancy = {
  category: DormancyCategory;
  label: string;
  monthsSinceService: number | null;
  monthsSinceProactive: number | null;
  monthsSincePurchase: number | null;
  /** No planned service purchased in the trailing twelve months. */
  isDormantServices: boolean;
};

export type Opportunity = {
  id: string;
  customerId: number;
  customerName: string;
  customerNo: string;
  classLabel: string | null;
  locationName: string | null;
  machinesOwned: number;

  rule: RuleId;
  ruleLabel: string;
  offering: Offering;

  reason: string;
  estimate: {
    annualRevenue: number | null;
    contribution: number | null;
    confidence: Confidence;
    basis: string;
  };
  math: MathRow[];
  cohort: ResolvedCohort;
  /** Their annual service spend against the cohort's, for the comparison chart. */
  peer: { theirs: number; median: number; p75: number; scaled: boolean } | null;
  dormancy: Dormancy;
  approach: Approach;
  talkTrack: string[];
  retrospective: Retrospective | null;
  churn: ChurnProfile | null;
  payback: TrainingPayback | null;
};

const monthsSince = (date: string | null): number | null =>
  date ? Math.max(Math.round(daysBetween(date, today()) / 30.44), 0) : null;

function dormancyOf(m: CustomerMetrics): Dormancy {
  const monthsSinceService = monthsSince(m.service.lastServiceDate);
  const monthsSinceProactive = monthsSince(m.service.lastProactiveDate);
  const monthsSincePurchase = m.daysSinceLastPurchase != null ? Math.round(m.daysSinceLastPurchase / 30.44) : null;
  const isDormantServices = m.service.proactiveVisits12 === 0;

  let category: DormancyCategory;
  let label: string;
  if (m.service.workOrdersLifetime === 0) {
    category = "never_bought_service";
    label = "Never bought service";
  } else if (monthsSinceService != null && monthsSinceService >= 12) {
    category = "lapsed_service";
    label = `No service in ${monthsSinceService} months`;
  } else if (isDormantServices) {
    category = "reactive_only";
    label = "Repairs only, no planned service";
  } else {
    category = "current";
    label = "Bought planned service this year";
  }

  return { category, label, monthsSinceService, monthsSinceProactive, monthsSincePurchase, isDormantServices };
}

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function confidenceFrom(cohort: ResolvedCohort): Confidence {
  if (!cohort.stat.confident) return "insufficient";
  if (cohort.basis === "class-and-size") return "high";
  if (cohort.basis === "class") return "medium";
  return "low";
}

export function buildOpportunities(assumptions?: Partial<Assumptions>): Opportunity[] {
  const laborRate = blendedLaborRate();
  const resolved: Assumptions = { ...defaultAssumptions(laborRate), ...assumptions };
  const key = `engine:${resolved.trainingFee}:${resolved.churnReduction}`;

  return cached(key, () => {
    const contribution = contributionModel();
    const benchmarks = workOrderBenchmarks();
    const out: Opportunity[] = [];

    for (const m of customerMetrics().values()) {
      // A customer with no trading history gives nothing to reason from.
      if (m.invoices.lifetime === 0) continue;

      const cohort = resolveCohort(m);
      const dormancy = dormancyOf(m);
      const baseConfidence = confidenceFrom(cohort);
      /**
       * What a middling peer of this size spends on service in a year. Taken
       * from the cohort's own annual spend rather than a per-machine median
       * times fleet size, because this data shows spend per machine falls as
       * fleets grow and that multiplication inflates accordingly.
       */
      const peerAnnualService = expectedServiceSpend(m.machinesOwned, cohort.stat);
      const peerStretch =
        peerAnnualService.scale > 0 ? cohort.stat.p75ServiceSpend * peerAnnualService.scale : 0;
      /** Whether the fleet adjustment moved the figure at all. */
      const scaled = Math.abs(peerAnnualService.scale - 1) > 0.01;
      /** Plural, because these sentences take it as their subject. */
      const peerNoun = m.classLabel ? pluralize(m.classLabel) : "Operations";
      const peerBenchmarkRow: MathRow = {
        label: "What a peer of their size spends on service",
        value: peerAnnualService.value,
        format: "money",
        kind: "derived",
        note:
          `Median annual service spend among ${cohort.stat.nServicing} servicing peers (${cohort.description})` +
          (scaled
            ? `, scaled by ${peerAnnualService.scale.toFixed(2)}x for their ${m.machinesOwned} machines against the cohort's typical ${cohort.stat.medianMachines}, at a measured fleet elasticity of ${peerAnnualService.elasticity.toFixed(2)}`
            : ""),
      };

      /**
       * What the customer would pay, priced from the basis its catalog entry
       * claims. An inspection is one planned visit per machine, not a year of
       * a comparable customer's entire service spend.
       */
      const priceOf = (id: OfferingId): { price: number | null; relation: PriceRelation } => {
        if (m.machinesOwned === 0) return { price: null, relation: "adds-to-existing-service" };
        if (id === "annual_inspection") {
          const perMachine =
            laborRate != null && benchmarks.medianProactiveLaborHours != null
              ? laborRate * benchmarks.medianProactiveLaborHours
              : null;
          return {
            price: perMachine != null ? perMachine * m.machinesOwned : null,
            relation: "adds-to-existing-service",
          };
        }
        if (id === "maintenance_plan") {
          // A plan is a year of planned service, so its price is what a
          // comparable account already spends across a year.
          return { price: peerAnnualService.value, relation: "replaces-existing-service" };
        }
        return { price: null, relation: "adds-to-existing-service" };
      };

      const add = (
        rule: RuleId,
        offeringId: OfferingId,
        reason: string,
        annualRevenue: number | null,
        math: MathRow[],
        talkTrack: string[],
        leadWith: string,
        extras?: {
          confidence?: Confidence;
          basis?: string;
          retro?: Retrospective | null;
          churn?: ChurnProfile | null;
          payback?: TrainingPayback | null;
          peer?: Opportunity["peer"];
        },
      ) => {
        const confidence = extras?.confidence ?? baseConfidence;
        const revenue = confidence === "insufficient" ? null : annualRevenue;
        out.push({
          id: `${m.customerId}:${rule}`,
          customerId: m.customerId,
          customerName: m.customerName,
          customerNo: m.customerNo,
          classLabel: m.classLabel,
          locationName: m.locationName,
          machinesOwned: m.machinesOwned,
          rule,
          ruleLabel: RULE_LABELS[rule],
          offering: offering(offeringId),
          reason,
          estimate: {
            annualRevenue: revenue,
            contribution: revenue != null ? revenue * contribution.contributionRate : null,
            confidence,
            basis: extras?.basis ?? `Benchmarked against ${cohort.description}.`,
          },
          math,
          cohort,
          peer: extras?.peer ?? null,
          dormancy,
          approach: approachFor(m, offeringId, leadWith),
          talkTrack,
          retrospective: extras?.retro ?? null,
          churn: extras?.churn ?? null,
          payback: extras?.payback ?? null,
        });
      };

      const cohortRows = (): MathRow[] => [
        {
          label: "Comparable customers",
          value: cohort.description,
          format: "text",
          kind: "data",
          note: `Cohort of ${cohort.stat.n}, matched on ${cohort.basis === "class-and-size" ? "trade class and fleet size" : cohort.basis === "class" ? "trade class" : "the whole customer base"}`,
        },
        peerBenchmarkRow,
      ];

      const partsNet12 = Math.max(m.spend.parts12 - m.spend.units12, 0);
      /**
       * Buying parts while buying no labor is the self-servicing signal, and it
       * is better evidence than an absence of work orders because their own
       * parts receipts prove the maintenance is happening somewhere. It takes
       * precedence over rule 1 so the two stay mutually exclusive.
       */
      const selfServicing = m.machinesOwned > 0 && partsNet12 > 0 && m.service.laborRevenue12 === 0;

      // ---------------------------------------- 1. owns machines, never serviced
      if (m.machinesOwned > 0 && m.service.workOrdersLifetime === 0 && !selfServicing) {
        const revenue = peerAnnualService.value;
        const plan = priceOf("maintenance_plan");
        const retro = retrospective(m, plan.price, contribution.contributionRate, 0.35, plan.relation);
        add(
          "never_serviced",
          "maintenance_plan",
          `Owns ${m.machinesOwned} machine${m.machinesOwned === 1 ? "" : "s"} bought here and has never had a work order with us.`,
          revenue,
          [
            ...cohortRows(),
            { label: "Machines they own", value: m.machinesOwned, format: "number", kind: "data", note: "From UnitCustomer ownership records" },
            { label: "Their service spend with us", value: 0, format: "money", kind: "data", note: "No work orders on file, ever" },
            { label: "Estimated annual revenue", value: revenue, format: "money", kind: "derived", note: "What a peer of their size spends, since they spend nothing today" },
          ],
          [
            `You bought ${m.machinesOwned} machine${m.machinesOwned === 1 ? "" : "s"} from us but we have never had ${m.machinesOwned === 1 ? "it" : "them"} in for service.`,
            `${peerNoun} of your size spend about ${money0(peerAnnualService.value)} a year with our shop keeping their machines maintained.`,
            `Whoever is servicing ${m.machinesOwned === 1 ? "it" : "them"} now, we would like to at least get you on an interval so nothing gets missed.`,
          ],
          "They own machines from us with zero service history.",
          { retro, peer: { theirs: 0, median: peerAnnualService.value, p75: peerStretch, scaled } },
        );
      }

      // ------------------------------------------- 2. buys parts, never buys labor
      if (selfServicing) {
        const revenue = Math.max(peerAnnualService.value - m.spend.service12, 0);
        const neverBilledLabor = m.service.workOrdersLifetime === 0;
        add(
          "parts_only",
          "maintenance_plan",
          `Bought ${money0(partsNet12)} of parts in the last year with no labor billed: they are doing the work themselves.`,
          revenue,
          [
            ...cohortRows(),
            { label: "Parts they bought this year", value: partsNet12, format: "money", kind: "data", note: "Counter and parts invoices, machine purchases excluded" },
            { label: "Labor billed this year", value: 0, format: "money", kind: "data", note: "No labor on any service segment in the last twelve months" },
            {
              label: "Last work order",
              value: neverBilledLabor ? "Never" : (m.service.lastServiceDate?.slice(0, 10) ?? "Unknown"),
              format: "text",
              kind: "data",
            },
            { label: "Estimated annual revenue", value: revenue, format: "money", kind: "derived", note: "Peer annual service spend, less what they already spend with the shop" },
          ],
          [
            `You spent ${money0(partsNet12)} with our parts counter last year and did all the work in your own yard.`,
            `That is fine for filters and fluids. The jobs worth handing us are the ones that cost you a machine for a day when they go sideways.`,
            `Comparable ${peerNoun.toLowerCase()} run about ${money0(peerAnnualService.value)} a year through our shop.`,
          ],
          neverBilledLabor
            ? "Buys parts, has never bought labor: they are self-servicing."
            : "Parts volume with no labor this year: they are self-servicing.",
          { peer: { theirs: m.spend.service12, median: peerAnnualService.value, p75: peerStretch, scaled } },
        );
      }

      // ------------------------------- 3. service spend below comparable customers
      if (m.machinesOwned > 0 && m.spend.service12 > 0 && cohort.stat.confident && !selfServicing) {
        if (m.spend.service12 < peerAnnualService.value * 0.6) {
          const revenue = Math.max(peerAnnualService.value - m.spend.service12, 0);
          const offeringId: OfferingId = m.service.proactiveVisits12 === 0 ? "annual_inspection" : "maintenance_plan";
          const priced = priceOf(offeringId);
          const retro = retrospective(m, priced.price, contribution.contributionRate, 0.35, priced.relation);
          add(
            "below_peers",
            offeringId,
            `Spends ${money0(m.spend.service12)} a year on service against ${money0(peerAnnualService.value)} for a comparable account.`,
            revenue,
            [
              ...cohortRows(),
              { label: "Their annual service spend", value: m.spend.service12, format: "money", kind: "data", note: "Posted work orders in the last twelve months" },
              { label: "Estimated annual revenue", value: revenue, format: "money", kind: "derived", note: "The gap between them and a comparable account" },
              { label: "Cohort stretch case", value: peerStretch, format: "money", kind: "derived", note: "If they matched the top quartile of their cohort" },
            ],
            [
              `You run ${m.machinesOwned} machine${m.machinesOwned === 1 ? "" : "s"} with us and spent ${money0(m.spend.service12)} on service last year.`,
              `${peerNoun} of your size run about ${money0(peerAnnualService.value)} a year through our shop, so you are lighter than most.`,
              m.service.reactiveSpend12 > 0
                ? `${money0(m.service.reactiveSpend12)} of your spend was reactive repair, which is the expensive way to buy service.`
                : `Getting on an interval is what keeps that from turning into a breakdown in your busy season.`,
            ],
            `Service spend is ${Math.round((1 - m.spend.service12 / Math.max(peerAnnualService.value, 1)) * 100)}% below a comparable account.`,
            { retro, peer: { theirs: m.spend.service12, median: peerAnnualService.value, p75: peerStretch, scaled } },
          );
        }
      }

      // ------------------------------------------------ 4. warranty lapsing/lapsed
      // Only machines at the decision point: coverage ending soon, or ended
      // recently enough that the conversation is still live.
      const affectedUnits = m.warranty.expiringSoon + m.warranty.recentlyExpired;
      if (affectedUnits > 0 && benchmarks.medianReactiveSpendPerMachine != null) {
        const perMachine = benchmarks.medianReactiveSpendPerMachine;
        const revenue = perMachine * affectedUnits * 0.5;
        add(
          "warranty_lapsing",
          "extended_coverage",
          m.warranty.expiringSoon > 0
            ? `${m.warranty.expiringSoon} machine${m.warranty.expiringSoon === 1 ? "" : "s"} coming off factory warranty in the next three months.`
            : `${m.warranty.recentlyExpired} machine${m.warranty.recentlyExpired === 1 ? "" : "s"} came out of factory warranty in the last year.`,
          revenue,
          [
            { label: "Machines out of or leaving warranty", value: affectedUnits, format: "number", kind: "data", note: "From UnitSerial warranty end dates" },
            { label: "Reactive repair cost per machine per year", value: perMachine, format: "money", kind: "data", note: "Median across customers who own machines" },
            { label: "Coverage priced at half that exposure", value: revenue, format: "money", kind: "derived", note: "A deliberately conservative half of measured repair exposure" },
          ],
          [
            m.warranty.expiringSoon > 0
              ? `${m.warranty.expiringSoon} of your machines ${m.warranty.expiringSoon === 1 ? "comes" : "come"} off factory warranty within three months.`
              : `${m.warranty.recentlyExpired} of your machines came out of factory coverage in the last year.`,
            `Out-of-warranty repairs run about ${money0(perMachine)} per machine a year across our customer base.`,
            `Coverage turns that into a known number instead of a bill you did not plan for.`,
          ],
          `${affectedUnits} machine${affectedUnits === 1 ? "" : "s"} at or past end of warranty.`,
          { confidence: baseConfidence === "insufficient" ? "low" : baseConfidence, basis: "Priced from measured reactive repair spend per machine across the customer base." },
        );
      }

      // -------------------------------------------------------- 5. repeat renter
      if (m.spend.rentalInvoices12 >= 3 && m.machinesOwned === 0) {
        const revenue = m.spend.rental12;
        add(
          "repeat_renter",
          "rental_to_own",
          `${m.spend.rentalInvoices12} rental invoices in the last year and no machine of their own.`,
          revenue,
          [
            { label: "Rental invoices this year", value: m.spend.rentalInvoices12, format: "number", kind: "data" },
            { label: "What they paid in rent", value: m.spend.rental12, format: "money", kind: "data", note: "Posted rental invoices, trailing twelve months" },
            { label: "Machines they own", value: 0, format: "number", kind: "data" },
            { label: "Annual spend a purchase would redirect", value: revenue, format: "money", kind: "derived", note: "Their own rental spend; the machine sale itself is on top of this" },
          ],
          [
            `You rented from us ${m.spend.rentalInvoices12} times last year and paid ${money0(m.spend.rental12)} in rent.`,
            `That is most of a payment schedule on a machine you would own at the end of it.`,
            `Rent-to-own puts the money you are already spending toward equity instead of hours on someone else's meter.`,
          ],
          "Renting repeatedly with nothing to show for it.",
          { confidence: "high", basis: "Built entirely from this customer's own rental history." },
        );
      }

      // ---------------------------------------------------- 6. cadence slipping
      if (
        m.avgPurchaseIntervalDays != null &&
        m.daysSinceLastPurchase != null &&
        m.invoices.lifetime >= 4 &&
        m.daysSinceLastPurchase > Math.max(m.avgPurchaseIntervalDays * 2.5, 120)
      ) {
        // What the account was worth while it was still active. Recurring
        // spend only, since a machine sale in their history is not something a
        // win-back call brings back every year.
        const priorAnnual = m.spend.aftermarketLastActive12;
        const windowNote = m.spend.lastActiveWindowStart
          ? `The twelve months ending at their last invoice (${m.spend.lastActiveWindowStart} to ${m.invoices.lastDate?.slice(0, 10)}). Parts, service and rental only; machine purchases excluded because a win-back does not repeat them.`
          : "Parts, service and rental only; machine purchases excluded because a win-back does not repeat them.";
        add(
          "cadence_slipping",
          "annual_inspection",
          `Used to buy every ${Math.round(m.avgPurchaseIntervalDays)} days on average; nothing for ${m.daysSinceLastPurchase} days.`,
          priorAnnual,
          [
            { label: "Their normal buying interval", value: Math.round(m.avgPurchaseIntervalDays), format: "days", kind: "derived", note: "Average gap between posted invoices across their history" },
            { label: "Days since their last invoice", value: m.daysSinceLastPurchase, format: "days", kind: "data" },
            { label: "Recurring spend in their last active year", value: priorAnnual, format: "money", kind: "data", note: windowNote },
          ],
          [
            `We have not seen you in ${Math.round(m.daysSinceLastPurchase / 30.44)} months, and before that you were in every ${Math.round(m.avgPurchaseIntervalDays)} days or so.`,
            priorAnnual > 0
              ? `You were running ${money0(priorAnnual)} a year through our parts counter and shop before that stopped.`
              : `Everything we sold you was the machine itself; we never saw you for parts or service afterwards.`,
            `An inspection is an easy way to get your machines back on our radar and see what has been deferred.`,
          ],
          "Buying pattern broke: dormant against their own history.",
          {
            // A win-back is worth what the account was recurring at. If their
            // last active year was a machine purchase and nothing else, there
            // is no recurring figure to quote, so the call is still worth
            // making but the dollar figure is not ours to invent.
            confidence: priorAnnual > 0 ? "high" : "insufficient",
            basis:
              priorAnnual > 0
                ? "Measured against this customer's own purchase cadence."
                : "Their last active year holds no recurring spend to win back, so this call is unpriced.",
          },
        );
      }

      // ----------------------------------------------------- 7. support churn
      const churn = churnProfile(m);
      if (churn.qualifies) {
        const payback = trainingPayback(churn, resolved, laborRate);
        /**
         * Whether the pitch survives its own arithmetic. Below this line the
         * fee costs the customer more in the first year than the repeat
         * repairs it would spare them, and quoting a payback measured in years
         * would be selling against our own numbers. The repeat visits are
         * still worth a call, so the row stays; the dollar figure does not.
         */
        const paysBack = payback.netFirstYearToCustomer > 0;
        add(
          "support_churn",
          "onsite_training",
          `${churn.comebackVisits} repeat visit${churn.comebackVisits === 1 ? "" : "s"} on machines already in our shop, across ${m.machinesOwned} machine${m.machinesOwned === 1 ? "" : "s"}.`,
          resolved.trainingFee,
          [
            { label: "Repeat visits in the last year", value: churn.comebackVisits, format: "number", kind: "data", note: "Same machine, same service code, inside 90 days" },
            { label: "Technician hours those consumed", value: churn.churnHours, format: "hours", kind: "data", note: "From WorkInProgress time entries" },
            { label: "Blended labor rate", value: laborRate ?? 0, format: "money", kind: "derived", note: "Labor revenue divided by labor hours across posted segments" },
            { label: "Capacity tied up in repeat work", value: payback.churnCostToDealer ?? 0, format: "money", kind: "derived", note: "Hours times the measured rate; capacity, not cash" },
            { label: "What the customer paid on those repeats", value: churn.comebackSpend, format: "money", kind: "data" },
            { label: "Training fee", value: resolved.trainingFee, format: "money", kind: "assumption", note: "Your price for a day on site. Not in the data." },
            { label: "Assumed churn reduction", value: resolved.churnReduction, format: "percent", kind: "assumption", note: "Nothing in this database measures training effectiveness." },
            { label: "Customer saving at that reduction", value: payback.customerSaving, format: "money", kind: "derived" },
            {
              label: "Payback period",
              value: payback.paybackMonths ?? 0,
              format: "number",
              kind: "derived",
              note: paysBack
                ? "Months for their saving to cover the fee"
                : "Months for their saving to cover the fee. Longer than a year, so this is not a saving pitch: lower the fee or raise the assumed reduction to see where it turns.",
            },
          ],
          [
            `Over the past year we opened ${m.service.workOrders12} work order${m.service.workOrders12 === 1 ? "" : "s"} on your ${m.machinesOwned} machine${m.machinesOwned === 1 ? "" : "s"}, and ${churn.comebackVisits} of those were repeat trips on a machine we had just had in.`,
            `Those repeat visits cost you ${money0(churn.comebackSpend)}${churn.downtimeDays > 0 ? ` and put your machines past the ${slipBasisLabel()} by ${Math.round(churn.downtimeDays)} days in total` : ""}.`,
            paysBack
              ? `A day on site with your operators covers the checks and intervals that prevent most of that. Our fee is ${money0(resolved.trainingFee)}, against ${money0(payback.customerSaving)} of repeat repairs it should spare you.`
              : `A day on site with your operators covers the checks and intervals behind most of that. At ${money0(resolved.trainingFee)} it will not pay for itself out of those repairs alone, so the case is the downtime, not the invoice.`,
          ],
          `${churn.comebackVisits} comeback visits and ${Math.round(churn.churnHours)} technician hours of rework.`,
          {
            confidence: paysBack ? (churn.comebackVisits >= 3 ? "high" : "medium") : "insufficient",
            basis: paysBack
              ? "Measured from this customer's own repeat work orders and technician time entries."
              : `Their repeat repairs come to ${money0(churn.comebackSpend)} a year, so at ${money0(resolved.trainingFee)} the training does not pay for itself inside a year. Worth the call on uptime, but not priced as a saving.`,
            churn,
            payback,
          },
        );
      }
    }

    // Rank by what the pitch is worth, keeping unquantified rows at the bottom.
    return out.sort((a, b) => {
      const av = a.estimate.annualRevenue ?? -1;
      const bv = b.estimate.annualRevenue ?? -1;
      if (bv !== av) return bv - av;
      return a.customerName.localeCompare(b.customerName);
    });
  });
}

export function opportunitiesForCustomer(customerId: number, assumptions?: Partial<Assumptions>): Opportunity[] {
  return buildOpportunities(assumptions).filter((o) => o.customerId === customerId);
}
