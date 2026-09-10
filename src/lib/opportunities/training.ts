import { CustomerMetrics, slipBasisColumn, slipBasisLabel } from "../metrics/customers";

/**
 * The support-churn model behind the on-site training pitch.
 *
 * This database has no support-ticket table, so churn is measured from service
 * data: comeback visits on the same machine, low-value visit traffic, estimate
 * overruns, schedule slippage and quote back-and-forth. If a real ticket table
 * turns up in the file, the schema probe reports it and those counts should
 * replace these proxies.
 */

export type Assumptions = {
  /** What the dealership charges for a day of on-site training. Not in the data. */
  trainingFee: number;
  /** Share of measured churn a training visit prevents. Not in the data. */
  churnReduction: number;
};

export function defaultAssumptions(laborRate: number | null): Assumptions {
  // A day of billable technician time is a defensible starting point for the
  // fee, but it remains an input the user can change.
  return {
    trainingFee: Math.round(((laborRate ?? 130) * 8) / 50) * 50,
    churnReduction: 0.3,
  };
}

export const ASSUMPTION_BOUNDS = {
  trainingFee: { min: 250, max: 6000, step: 50 },
  churnReduction: { min: 0.05, max: 0.6, step: 0.05 },
};

export type ChurnSignal = {
  label: string;
  value: number;
  format: "number" | "hours" | "money" | "days";
  note: string;
};

export type ChurnProfile = {
  /** Technician hours spent on repeat visits, from WorkInProgress. */
  churnHours: number;
  comebackVisits: number;
  comebackSpend: number;
  smallVisits: number;
  overruns: number;
  downtimeDays: number;
  quoteChurn: number;
  /** Churn events per machine per year, so big fleets are not flagged for size. */
  intensity: number;
  signals: ChurnSignal[];
  qualifies: boolean;
};

export function churnProfile(m: CustomerMetrics): ChurnProfile {
  const { churn } = m;
  const machines = Math.max(m.machinesOwned, 1);
  const events = churn.comebackVisits12 + churn.smallVisits12 * 0.5 + churn.overruns12;
  const intensity = events / machines;

  const signals: ChurnSignal[] = [];
  if (churn.comebackVisits12 > 0) {
    signals.push({
      label: "Repeat visits on the same machine",
      value: churn.comebackVisits12,
      format: "number",
      note: "Same unit, same service code, inside 90 days",
    });
  }
  if (churn.smallVisits12 > 0) {
    signals.push({
      label: "Low-value shop visits",
      value: churn.smallVisits12,
      format: "number",
      note: "Work orders under half the median work order value",
    });
  }
  if (churn.overruns12 > 0) {
    signals.push({
      label: "Jobs that ran past estimate",
      value: churn.overruns12,
      format: "number",
      note: "Final invoice more than 25% above the estimate",
    });
  }
  if (churn.slipDays12 > 0) {
    signals.push({
      label: `Days past the ${slipBasisLabel()}`,
      value: churn.slipDays12,
      format: "days",
      note: `From WorkOrderSchedule ${slipBasisColumn()} against ActualDate`,
    });
  }
  if (churn.quoteChurn12 > 0) {
    signals.push({
      label: "Quotes and drafts that never posted",
      value: churn.quoteChurn12,
      format: "number",
      note: "Effort on both sides with no revenue",
    });
  }

  return {
    churnHours: churn.comebackHours12,
    comebackVisits: churn.comebackVisits12,
    comebackSpend: churn.comebackSpend12,
    smallVisits: churn.smallVisits12,
    overruns: churn.overruns12,
    downtimeDays: churn.slipDays12,
    quoteChurn: churn.quoteChurn12,
    intensity,
    signals,
    // Two comebacks, or a pattern of small visits with overruns, is a real
    // signal. One repeat repair is just a repair.
    qualifies:
      m.machinesOwned > 0 &&
      (churn.comebackVisits12 >= 2 || (churn.smallVisits12 >= 4 && churn.overruns12 >= 1)) &&
      intensity >= 0.75,
  };
}

export type TrainingPayback = {
  churnHours: number;
  laborRate: number | null;
  /** Technician capacity consumed by churn: hours times the measured rate. */
  churnCostToDealer: number | null;
  /** What the customer actually paid on those repeat repairs. */
  customerChurnSpend: number;
  fee: number;
  reduction: number;
  recoverableHours: number;
  recoverableCapacity: number | null;
  customerSaving: number;
  /** Months for the customer's saving to cover the fee. */
  paybackMonths: number | null;
  netFirstYearToCustomer: number;
};

export function trainingPayback(
  profile: ChurnProfile,
  assumptions: Assumptions,
  laborRate: number | null,
): TrainingPayback {
  const recoverableHours = profile.churnHours * assumptions.churnReduction;
  const recoverableCapacity = laborRate != null ? recoverableHours * laborRate : null;
  const customerSaving = profile.comebackSpend * assumptions.churnReduction;
  const monthlySaving = customerSaving / 12;

  return {
    churnHours: profile.churnHours,
    laborRate,
    churnCostToDealer: laborRate != null ? profile.churnHours * laborRate : null,
    customerChurnSpend: profile.comebackSpend,
    fee: assumptions.trainingFee,
    reduction: assumptions.churnReduction,
    recoverableHours,
    recoverableCapacity,
    customerSaving,
    paybackMonths: monthlySaving > 0 ? assumptions.trainingFee / monthlySaving : null,
    netFirstYearToCustomer: customerSaving - assumptions.trainingFee,
  };
}
