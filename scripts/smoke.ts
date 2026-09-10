/**
 * Runs the data layer outside Next so SQL problems surface as plain errors.
 * `npm run smoke`
 */
import { blendedLaborRate, customerMetrics, medianWorkOrderValue } from "../src/lib/metrics/customers";
import { cohortStats } from "../src/lib/metrics/cohorts";
import { buildOpportunities } from "../src/lib/opportunities/engine";
import { getDb } from "../src/lib/db";
import { dataAsOf, schemaReport } from "../src/lib/schema";
import { serviceCodeClassification } from "../src/lib/services/codes";

const handle = getDb();
console.log(`db: ${handle.path} (sample=${handle.isSample})`);

const report = schemaReport();
console.log(`tables: ${Object.keys(report.tables).length}`);
console.log(
  `capabilities off: ${Object.entries(report.capabilities)
    .filter(([, v]) => !v)
    .map(([k]) => k)
    .join(", ") || "none"}`,
);
console.log(`support-table candidates: ${report.supportTableCandidates.join(", ") || "none"}`);
console.log(`date format recognized: ${report.dateFormat.recognized} (${report.dateFormat.sample})`);
console.log(`data as of: ${dataAsOf()}`);

const codes = serviceCodeClassification();
console.log(`proactive codes: ${codes.proactive.join(", ") || "none"}`);
console.log(`reactive codes: ${codes.reactive.length}`);

console.log(`median work order: ${medianWorkOrderValue().toFixed(2)}`);
console.log(`blended labor rate: ${blendedLaborRate()?.toFixed(2) ?? "n/a"}`);

const metrics = customerMetrics();
console.log(`customers: ${metrics.size}`);

const withMachines = [...metrics.values()].filter((m) => m.machinesOwned > 0);
console.log(`with machines: ${withMachines.length}`);
console.log(`with comebacks: ${[...metrics.values()].filter((m) => m.churn.comebackVisits12 > 0).length}`);
console.log(`no proactive in 12mo: ${[...metrics.values()].filter((m) => m.service.proactiveVisits12 === 0).length}`);

const sample = [...metrics.values()].sort((a, b) => b.spend.lifetime - a.spend.lifetime)[0];
console.log("top customer by lifetime spend:", JSON.stringify(sample, null, 2).slice(0, 1400));

const cohorts = cohortStats();
console.log(`cohorts: ${cohorts.size}`);
for (const [key, stat] of [...cohorts.entries()].slice(0, 6)) {
  console.log(
    `  ${key}: n=${stat.n} median/machine=${stat.medianServicePerMachine.toFixed(0)} p75=${stat.p75ServicePerMachine.toFixed(0)} confident=${stat.confident}`,
  );
}

const opportunities = buildOpportunities();
console.log(`opportunities: ${opportunities.length}`);
const byKind = new Map<string, { n: number; value: number }>();
for (const o of opportunities) {
  const agg = byKind.get(o.rule) ?? { n: 0, value: 0 };
  agg.n += 1;
  agg.value += o.estimate.annualRevenue ?? 0;
  byKind.set(o.rule, agg);
}
for (const [kind, agg] of [...byKind.entries()].sort((a, b) => b[1].value - a[1].value)) {
  console.log(`  ${kind}: ${agg.n} customers, $${Math.round(agg.value).toLocaleString()}`);
}

const top = opportunities.slice(0, 3);
for (const o of top) {
  console.log(`\n--- ${o.customerName} / ${o.offering.name}`);
  console.log(`   why: ${o.reason}`);
  console.log(`   estimate: ${JSON.stringify(o.estimate)}`);
  console.log(`   talk track: ${o.talkTrack.join(" ")}`);
}
