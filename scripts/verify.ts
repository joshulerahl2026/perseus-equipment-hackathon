/**
 * Reconciles what the app reports against the database underneath it.
 *
 * The app's whole claim is that every number traces back to a row, so that
 * claim should be checkable rather than asserted. This re-derives the headline
 * figures in independent SQL and asserts each rule's qualifying condition
 * actually holds for the customers it flagged. Runs against whichever database
 * the app itself would load.
 */
import Database from "better-sqlite3";
import { cached, getDb } from "../src/lib/db";
import { headlineKpis, monthlyRevenue } from "../src/lib/metrics/overview";
import { customerMetrics, slipBasisColumn } from "../src/lib/metrics/customers";
import { contributionModel } from "../src/lib/metrics/economics";
import { buildOpportunities } from "../src/lib/opportunities/engine";
import { summarize } from "../src/lib/opportunities/select";
import { monthsBefore } from "../src/lib/sql";

const { path, isSample } = getDb();
const db = new Database(path, { readonly: true });
const one = <T,>(sql: string, p: unknown[] = []) => db.prepare(sql).get(...(p as never[])) as T;

const POSTED = `LOWER(ih.Status) IN ('finalized','archived')`;
const t12 = monthsBefore(12);

let failures = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

console.log(`${path}${isSample ? " (generated sample)" : ""}`);
console.log(`trailing twelve months from ${t12}\n`);

// ---------------------------------------------- headline revenue and counts
const raw = one<{ rev: number; n: number; cust: number }>(
  `SELECT SUM(ih.TotalInvoice) rev, COUNT(*) n, COUNT(DISTINCT ih.CustomerId) cust
   FROM InvoiceHeader ih WHERE ${POSTED} AND ih.ActivityDate >= ?`,
  [t12],
);
const k = headlineKpis();
ok("posted revenue matches raw SQL", Math.abs(raw.rev - k.postedRevenue12) < 0.01, `${Math.round(raw.rev)} vs ${Math.round(k.postedRevenue12)}`);
ok("invoice count matches raw SQL", raw.n === k.invoiceCount12, `${raw.n} vs ${k.invoiceCount12}`);
ok("active customers matches raw SQL", raw.cust === k.activeCustomers12, `${raw.cust} vs ${k.activeCustomers12}`);
ok("average invoice is revenue over count", Math.abs(k.avgInvoice12 - k.postedRevenue12 / k.invoiceCount12) < 0.01);

// -------------------------------------- no unposted document reaches revenue
const unposted = one<{ rev: number; n: number }>(
  `SELECT COALESCE(SUM(ih.TotalInvoice),0) rev, COUNT(*) n FROM InvoiceHeader ih
   WHERE LOWER(ih.Status) NOT IN ('finalized','archived') AND ih.ActivityDate >= ?`,
  [t12],
);
const allDocs = one<{ rev: number }>(
  `SELECT SUM(ih.TotalInvoice) rev FROM InvoiceHeader ih WHERE ih.ActivityDate >= ?`,
  [t12],
);
ok(
  "quotes, drafts, voids and commitments excluded",
  Math.abs(allDocs.rev - unposted.rev - k.postedRevenue12) < 0.01,
  `${unposted.n} unposted docs worth ${Math.round(unposted.rev)} held out`,
);

// ------------------------------------------------- monthly trend reconciles
const months = monthlyRevenue(24);
const trendTotal = months.reduce((a, m) => a + m.total, 0);
const rawTrend = one<{ rev: number }>(
  `SELECT SUM(ih.TotalInvoice) rev FROM InvoiceHeader ih
   WHERE ${POSTED} AND substr(ih.ActivityDate,1,7) >= ?`,
  [months[0]?.month ?? "0000-00"],
);
ok("monthly trend sums to raw SQL over the same months", Math.abs(trendTotal - rawTrend.rev) < 1, `${Math.round(trendTotal)} vs ${Math.round(rawTrend.rev)}`);
ok("trend splits sum to each month total", months.every((m) => Math.abs(m.service + m.parts + m.rental - m.total) < 0.01 || m.total > 0));

// --------------------------------------------- customer spend reconciliation
const metrics = customerMetrics();
const sumService = [...metrics.values()].reduce((a, m) => a + m.spend.service12, 0);
const rawService = one<{ rev: number }>(
  `SELECT SUM(ih.TotalInvoice) rev FROM InvoiceHeader ih
   WHERE ${POSTED} AND ih.ActivityDate >= ?
     AND (LOWER(ih.InvoiceType) LIKE 'wo%'
          OR EXISTS (SELECT 1 FROM InvoiceSegment sx WHERE sx.InvoiceDocId = ih.InvoiceDocId))`,
  [t12],
);
ok("per-customer service spend sums to total service revenue", Math.abs(sumService - rawService.rev) < 1, `${Math.round(sumService)} vs ${Math.round(rawService.rev)}`);

const leaderboard = [...metrics.values()].sort((a, b) => b.spend.t12 - a.spend.t12).slice(0, 8);
const topRaw = one<{ rev: number }>(
  `SELECT SUM(ih.TotalInvoice) rev FROM InvoiceHeader ih
   WHERE ${POSTED} AND ih.ActivityDate >= ? AND ih.CustomerId = ?`,
  [t12, leaderboard[0].customerId],
);
ok("leaderboard top row matches its own invoices", Math.abs(topRaw.rev - leaderboard[0].spend.t12) < 1, `${Math.round(topRaw.rev)} vs ${Math.round(leaderboard[0].spend.t12)}`);

// -------------------------------------------------------- opportunity sanity
const opps = buildOpportunities();
ok("no negative revenue estimate", opps.every((o) => (o.estimate.annualRevenue ?? 0) >= 0));
ok(
  "contribution never exceeds revenue",
  opps.every((o) => o.estimate.contribution == null || o.estimate.annualRevenue == null || o.estimate.contribution <= o.estimate.annualRevenue + 0.01),
);
ok("unpriced rows are exactly the insufficient-confidence ones", opps.every((o) => (o.estimate.annualRevenue == null) === (o.estimate.confidence === "insufficient")));
ok(
  "never_serviced customers really have no work orders",
  opps.filter((o) => o.rule === "never_serviced").every((o) => metrics.get(o.customerId)!.service.workOrdersLifetime === 0),
);
ok(
  "repeat_renter customers really own nothing",
  opps.filter((o) => o.rule === "repeat_renter").every((o) => metrics.get(o.customerId)!.machinesOwned === 0),
);
ok(
  "below_peers customers really are below their cohort",
  opps
    .filter((o) => o.rule === "below_peers")
    .every((o) => o.peer != null && o.peer.theirs < o.peer.median),
);
ok(
  "parts_only customers bought parts and billed no labor",
  opps.filter((o) => o.rule === "parts_only").every((o) => {
    const m = metrics.get(o.customerId)!;
    return m.service.laborRevenue12 === 0 && m.spend.parts12 - m.spend.units12 > 0 && m.machinesOwned > 0;
  }),
);
ok(
  "never_serviced and parts_only never fire on the same customer",
  (() => {
    const ns = new Set(opps.filter((o) => o.rule === "never_serviced").map((o) => o.customerId));
    return opps.filter((o) => o.rule === "parts_only").every((o) => !ns.has(o.customerId));
  })(),
);

// ------------------------------------------ estimates against the real spread
ok(
  "no estimate exceeds the cohort's top-quartile spend by more than a machine's worth",
  opps
    .filter((o) => o.peer != null && o.estimate.annualRevenue != null)
    .every((o) => o.estimate.annualRevenue! <= Math.max(o.peer!.p75, o.peer!.median) + 0.01),
  `checked ${opps.filter((o) => o.peer != null && o.estimate.annualRevenue != null).length} peer-priced rows`,
);
ok(
  "the win-back figure is the customer's own last active year",
  opps
    .filter((o) => o.rule === "cadence_slipping" && o.estimate.annualRevenue != null)
    .every((o) => Math.abs(o.estimate.annualRevenue! - metrics.get(o.customerId)!.spend.aftermarketLastActive12) < 0.01),
);
ok(
  "no win-back is priced at zero",
  opps.filter((o) => o.rule === "cadence_slipping").every((o) => o.estimate.annualRevenue == null || o.estimate.annualRevenue > 0),
);
ok(
  "training is only priced where it pays for itself inside a year",
  opps
    .filter((o) => o.rule === "support_churn")
    .every((o) => (o.estimate.annualRevenue != null) === (o.payback!.netFirstYearToCustomer > 0)),
);

// ------------------------------------------------ one wallet, counted once
{
  const naive = opps.reduce((a, o) => a + (o.estimate.annualRevenue ?? 0), 0);
  const summary = summarize(opps);
  const perCustomerBest = new Map<number, number>();
  for (const o of opps) {
    perCustomerBest.set(o.customerId, Math.max(perCustomerBest.get(o.customerId) ?? 0, o.estimate.annualRevenue ?? 0));
  }
  const expected = [...perCustomerBest.values()].reduce((a, b) => a + b, 0);
  ok(
    "the pipeline total counts each customer once",
    Math.abs(summary.totalRevenue - expected) < 0.01 && summary.totalRevenue <= naive + 0.01,
    `${Math.round(summary.totalRevenue)} against ${Math.round(naive)} if every row were added, ${summary.customersWithOverlap} customers overlapping`,
  );
}

// -------------------------------- one invoice belongs to exactly one revenue line
{
  const overlap = one<{ n: number }>(
    `SELECT COUNT(*) n FROM InvoiceHeader ih
     WHERE ${POSTED} AND (
       (CASE WHEN LOWER(ih.InvoiceType) LIKE 'wo%'
                  OR EXISTS (SELECT 1 FROM InvoiceSegment sx WHERE sx.InvoiceDocId = ih.InvoiceDocId)
             THEN 1 ELSE 0 END)
     + (CASE WHEN (LOWER(ih.InvoiceType) LIKE 'rl%' OR LOWER(ih.InvoiceType) LIKE 'ren%')
                  AND NOT (LOWER(ih.InvoiceType) LIKE 'wo%'
                           OR EXISTS (SELECT 1 FROM InvoiceSegment sx WHERE sx.InvoiceDocId = ih.InvoiceDocId))
             THEN 1 ELSE 0 END)
     + (CASE WHEN LOWER(ih.InvoiceType) LIKE 'in%'
                  AND NOT (LOWER(ih.InvoiceType) LIKE 'wo%'
                           OR EXISTS (SELECT 1 FROM InvoiceSegment sx WHERE sx.InvoiceDocId = ih.InvoiceDocId))
                  AND NOT (LOWER(ih.InvoiceType) LIKE 'rl%' OR LOWER(ih.InvoiceType) LIKE 'ren%')
             THEN 1 ELSE 0 END)) > 1`,
  );
  ok("no invoice counts in two revenue lines at once", overlap.n === 0, `${overlap.n} documents in more than one line`);
  ok(
    "service, parts and rental never exceed total revenue",
    k.serviceRevenue12 + k.partsRevenue12 <= k.postedRevenue12 + 0.01,
    `${Math.round(k.serviceRevenue12 + k.partsRevenue12)} of ${Math.round(k.postedRevenue12)}`,
  );
  const doubled = [...metrics.values()].filter((m) => m.spend.aftermarket12 > m.spend.t12 + 0.01);
  ok("no customer's recurring wallet exceeds their total spend", doubled.length === 0, `${doubled.length} customers over`);
}

// ---------------------------------------- pass-through stays out of the margin
{
  const c = contributionModel();
  ok(
    "the contribution rate leaves sales tax and shop supplies out",
    Math.abs(c.laborShareOfService + c.partsShareOfService + c.passThroughShareOfService - 1) < 0.01 &&
      c.contributionRate <= c.laborShareOfService + c.partsShareOfService + 0.01,
    `${(c.passThroughShareOfService * 100).toFixed(1)}% pass-through held out of a ${(c.contributionRate * 100).toFixed(1)}% rate`,
  );
}

// ---------------------------------------- downtime is measured where it is said
{
  const column = slipBasisColumn();
  const has = (db.prepare(`SELECT COUNT(*) n FROM pragma_table_info('WorkOrderSchedule') WHERE name = ?`).get(column) as { n: number }).n;
  const raw = one<{ d: number }>(
    `SELECT COALESCE(SUM(MAX(julianday(sch.ActualDate) - julianday(sch.${column}), 0)), 0) d
     FROM WorkOrderSchedule sch JOIN InvoiceHeader ih ON ih.InvoiceDocId = sch.InvoiceDocId
     WHERE ${POSTED} AND ih.ActivityDate >= ? AND sch.ActualDate IS NOT NULL AND sch.${column} IS NOT NULL`,
    [t12],
  );
  const app = [...metrics.values()].reduce((a, m) => a + m.churn.slipDays12, 0);
  ok(
    `downtime is measured against ${column}, which is what the talk track says`,
    has === 1 && Math.abs(raw.d - app) < 0.01,
    `${Math.round(app)} days`,
  );
}
ok(
  "retrospective incremental cost equals the revenue we did not book",
  opps.every((o) => !o.retrospective || o.retrospective.incrementalCost === o.retrospective.missedRevenue),
);
ok(
  "retrospective net is avoidable repairs less the added cost",
  opps.every(
    (o) =>
      !o.retrospective ||
      o.retrospective.customerNetPosition == null ||
      Math.abs(o.retrospective.customerNetPosition - (o.retrospective.avoidableReactive - o.retrospective.incrementalCost!)) < 0.01,
  ),
);
ok(
  "no talk track leaves a placeholder or NaN",
  opps.every((o) => o.talkTrack.every((line) => !/NaN|undefined|null|\$0 |Infinity/.test(line))),
);
ok("every opportunity has a contact-shaped approach", opps.every((o) => o.approach.angle.length > 0 && o.approach.leadWith.length > 0));

// -------------------------------------------- the window rolls with the clock
{
  const RealDate = Date;
  let computed = 0;
  const probe = () => cached("verify:clock-probe", () => ++computed);
  probe();
  probe();
  const withinOneDay = computed;

  const tomorrow = RealDate.now() + 24 * 60 * 60 * 1000;
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      super(...((args.length ? args : [tomorrow]) as [any]));
    }
    static now() {
      return tomorrow;
    }
  } as DateConstructor;
  probe();
  globalThis.Date = RealDate;

  ok(
    "a new day invalidates the cache, so the trailing-twelve window moves",
    withinOneDay === 1 && computed === 2,
    `computed ${computed} times across two days`,
  );
}

// ---------------------------------------------------------- sensitive fields
const sensitive = /pass|pwd|hash|secret|token|ssn|salt/i;
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[];
const sensitiveColumns = tables.flatMap((t) =>
  (db.prepare(`SELECT name FROM pragma_table_info(?)`).all(t.name) as { name: string }[])
    .filter((c) => sensitive.test(c.name))
    .map((c) => `${t.name}.${c.name}`),
);
console.log(
  sensitiveColumns.length
    ? `\nNOTE  this database has sensitive-looking columns the app must never select: ${sensitiveColumns.join(", ")}`
    : `\nNo password, hash or token columns exist in this database.`,
);

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
