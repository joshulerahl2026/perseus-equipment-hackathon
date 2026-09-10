import { cached } from "../db";
import { CustomerMetrics, customerMetrics } from "./customers";

/**
 * Peer cohorts: the "real life comparison" in the brief. A customer is measured
 * against others in the same trade class running a similar number of machines,
 * so a three-machine landscaper is never benchmarked against a municipal fleet.
 */

/** Below this many peers a median is noise, so no dollar figure is published. */
export const MIN_COHORT = 5;

export type MachineBand = "0" | "1-2" | "3-5" | "6-10" | "11+";

export function machineBand(machines: number): MachineBand {
  if (machines <= 0) return "0";
  if (machines <= 2) return "1-2";
  if (machines <= 5) return "3-5";
  if (machines <= 10) return "6-10";
  return "11+";
}

export type CohortStat = {
  key: string;
  label: string;
  /** Everyone in the cohort, including customers who buy no service at all. */
  n: number;
  /**
   * How many of them actually service with us. The per-machine medians are
   * taken over these members only: including the non-buyers drags the median to
   * zero and the benchmark stops meaning anything. Both counts are shown in the
   * UI so the comparison is never overstated.
   */
  nServicing: number;
  /** Annual service revenue per machine owned, among peers who service here. */
  medianServicePerMachine: number;
  p75ServicePerMachine: number;
  /** Share of the recurring wallet that peers spend on service. */
  medianServiceShare: number | null;
  /** Annual service revenue of a typical peer, with no denominator in it. */
  medianServiceSpend: number;
  p75ServiceSpend: number;
  /** Fleet size of a typical servicing peer, used to scale off that median. */
  medianMachines: number;
  medianPartsPerMachine: number;
  confident: boolean;
};

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const median = (xs: number[]) => percentile([...xs].sort((a, b) => a - b), 0.5);

function statsFor(key: string, label: string, members: CustomerMetrics[]): CohortStat {
  const servicing = members.filter((m) => m.machinesOwned > 0 && m.spend.service12 > 0);
  const perMachine = servicing.map((m) => m.spend.service12 / m.machinesOwned).sort((a, b) => a - b);
  const partsPerMachine = members
    .filter((m) => m.machinesOwned > 0)
    .map((m) => Math.max(m.spend.parts12 - m.spend.units12, 0) / m.machinesOwned)
    .sort((a, b) => a - b);
  const shares = servicing.map((m) => m.serviceShareOfWallet).filter((s): s is number => s != null);

  return {
    key,
    label,
    n: members.length,
    nServicing: servicing.length,
    medianServicePerMachine: percentile(perMachine, 0.5),
    p75ServicePerMachine: percentile(perMachine, 0.75),
    medianServiceShare: shares.length ? median(shares) : null,
    medianServiceSpend: servicing.length ? median(servicing.map((m) => m.spend.service12)) : 0,
    p75ServiceSpend: servicing.length
      ? percentile(servicing.map((m) => m.spend.service12).sort((a, b) => a - b), 0.75)
      : 0,
    medianMachines: servicing.length ? Math.max(median(servicing.map((m) => m.machinesOwned)), 1) : 1,
    medianPartsPerMachine: percentile(partsPerMachine, 0.5),
    // A benchmark needs enough peers who actually buy the thing being compared.
    confident: servicing.length >= MIN_COHORT,
  };
}

const classLabelOf = (m: CustomerMetrics) => m.classLabel ?? m.classCode ?? "Unclassified";

export function cohortStats(): Map<string, CohortStat> {
  return cached("metrics:cohorts", () => {
    const all = [...customerMetrics().values()];
    // Only customers with real trading history inform a benchmark.
    const active = all.filter((m) => m.invoices.lifetime > 0);
    const out = new Map<string, CohortStat>();

    const byClassBand = new Map<string, CustomerMetrics[]>();
    const byClass = new Map<string, CustomerMetrics[]>();

    for (const m of active) {
      const cls = m.classCode ?? "UNCLASSIFIED";
      const band = machineBand(m.machinesOwned);
      const kb = `${cls}:${band}`;
      byClassBand.set(kb, [...(byClassBand.get(kb) ?? []), m]);
      byClass.set(cls, [...(byClass.get(cls) ?? []), m]);
    }

    for (const [key, members] of byClassBand) {
      const [, band] = key.split(":");
      out.set(key, statsFor(key, `${classLabelOf(members[0])}, ${band} machines`, members));
    }
    for (const [cls, members] of byClass) {
      out.set(`${cls}:*`, statsFor(`${cls}:*`, `all ${classLabelOf(members[0])} accounts`, members));
    }
    out.set("*:*", statsFor("*:*", "all customers", active));

    return out;
  });
}

/**
 * How much a customer's service spend actually grows with fleet size, fitted
 * across the book rather than assumed.
 *
 * The obvious estimate is a per-machine median times the machines they own,
 * which quietly assumes every extra machine brings a full extra machine's
 * worth of work. This data says otherwise: spend per machine falls sharply as
 * fleets get larger, so that multiplication inflates in proportion to fleet
 * size. Fitting log spend against log machines measures the real relationship
 * and turns the multiplier into something the diagnostics page can show.
 *
 * The applied value is clamped to [0, 1]. A fitted slope below zero would say
 * bigger fleets spend less in total, which is more likely a sampling artifact
 * than a fact to price against, and above one would say they spend
 * disproportionately more. Both the fitted and the applied value are reported,
 * so the clamp is visible rather than silent.
 */
export function fleetElasticity(): { value: number; fitted: number | null; n: number } {
  return cached("metrics:fleetElasticity", () => {
    const pts = [...customerMetrics().values()]
      .filter((m) => m.machinesOwned > 0 && m.spend.service12 > 0)
      .map((m) => [Math.log(m.machinesOwned), Math.log(m.spend.service12)]);

    // A slope through fewer than a handful of points, or through customers who
    // all run the same fleet size, is not a measurement.
    if (pts.length < MIN_COHORT) return { value: 0, fitted: null, n: pts.length };
    const meanX = pts.reduce((a, [x]) => a + x, 0) / pts.length;
    const meanY = pts.reduce((a, [, y]) => a + y, 0) / pts.length;
    const varX = pts.reduce((a, [x]) => a + (x - meanX) ** 2, 0);
    if (varX === 0) return { value: 0, fitted: null, n: pts.length };
    const cov = pts.reduce((a, [x, y]) => a + (x - meanX) * (y - meanY), 0);
    const fitted = cov / varX;
    return { value: Math.min(Math.max(fitted, 0), 1), fitted, n: pts.length };
  });
}

/**
 * What a customer like this one would spend on service in a year if they
 * behaved like the middle of their cohort: the cohort's own median annual
 * spend, scaled for the difference in fleet size at the measured elasticity.
 *
 * Because cohorts are banded by machine count, the scale is close to one
 * whenever the tight cohort applies. It only does real work when the sample
 * was too thin and the comparison had to widen past the band.
 */
export function expectedServiceSpend(
  machines: number,
  stat: CohortStat,
): { value: number; scale: number; elasticity: number } {
  const { value: elasticity } = fleetElasticity();
  const scale = machines > 0 ? (machines / stat.medianMachines) ** elasticity : 0;
  return { value: stat.medianServiceSpend * scale, scale, elasticity };
}

export type ResolvedCohort = {
  stat: CohortStat;
  /** Which comparison actually got used, after falling back for small samples. */
  basis: "class-and-size" | "class" | "all-customers";
  description: string;
};

/**
 * Picks the tightest comparison that still has enough peers to mean something,
 * widening from class-and-size to class to the whole book.
 */
export function resolveCohort(m: CustomerMetrics): ResolvedCohort {
  const stats = cohortStats();
  const cls = m.classCode ?? "UNCLASSIFIED";
  const band = machineBand(m.machinesOwned);

  const tight = stats.get(`${cls}:${band}`);
  if (tight?.confident) {
    return {
      stat: tight,
      basis: "class-and-size",
      description: `${tight.nServicing} of ${tight.n} ${m.classLabel ?? "similar"} accounts running ${band} machines`,
    };
  }
  const classWide = stats.get(`${cls}:*`);
  if (classWide?.confident) {
    return {
      stat: classWide,
      basis: "class",
      description: `${classWide.nServicing} of ${classWide.n} ${m.classLabel ?? "similar"} accounts of any size`,
    };
  }
  const everyone = stats.get("*:*")!;
  return {
    stat: everyone,
    basis: "all-customers",
    description: `${everyone.nServicing} of ${everyone.n} customers across the whole book`,
  };
}
