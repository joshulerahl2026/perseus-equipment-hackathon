/**
 * Proves the schema probe does its job.
 *
 * The point of declaring what each query needs is that a database of a
 * different shape produces a readable report rather than an exception thrown
 * from inside a query. That only holds if it is tested, so this drops each
 * optional table from a copy of the sample and runs the whole data layer
 * against it.
 *
 *   npm run degrade
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getDb } from "../src/lib/db";

const OPTIONAL_TABLES = [
  "InvoiceSegment",
  "WorkInProgress",
  "WorkOrderSchedule",
  "SalePart",
  "PartMaster",
  "PartLocation",
  "UnitBase",
  "UnitCustomer",
  "UnitSerial",
  "SettingsWorkOrderStatus",
  "CustomerClass",
  "Contact",
  "InvoiceDetail",
  "Payment",
];

const source = getDb().path;
const dir = mkdtempSync(join(tmpdir(), "degrade-"));
let failures = 0;

/**
 * Each case runs in its own process. The data layer memoises against the
 * database file, so re-pointing it inside one process would serve cached
 * results from the previous case.
 */
const child = `
  const { schemaReport } = require("../src/lib/schema");
  const { customerMetrics, medianWorkOrderValue, blendedLaborRate } = require("../src/lib/metrics/customers");
  const { headlineKpis, monthlyRevenue, partsHealth, unitsByStockStatus, topParts, workOrdersByStatus, technicianWorkload } = require("../src/lib/metrics/overview");
  const { buildOpportunities } = require("../src/lib/opportunities/engine");
  const { searchInvoices, inventoryUnits, workOrders, churnLeaderboard, agedInStock } = require("../src/lib/metrics/lists");
  const { contributionModel, workOrderBenchmarks } = require("../src/lib/metrics/economics");

  const report = schemaReport();
  const off = Object.entries(report.capabilities).filter(([, v]) => !v).map(([k]) => k);
  medianWorkOrderValue();
  blendedLaborRate();
  headlineKpis();
  monthlyRevenue(12);
  partsHealth();
  unitsByStockStatus();
  topParts(5);
  workOrdersByStatus();
  technicianWorkload(5);
  contributionModel();
  workOrderBenchmarks();
  searchInvoices({ limit: 5 });
  inventoryUnits({ limit: 5 });
  workOrders({ limit: 5 });
  agedInStock(180);
  churnLeaderboard(5);
  const m = customerMetrics();
  const opps = buildOpportunities();
  console.log(JSON.stringify({ lost: off, customers: m.size, opportunities: opps.length }));
`;

for (const table of ["(nothing dropped)", ...OPTIONAL_TABLES]) {
  const copy = join(dir, `${table.replace(/\W/g, "_")}.db`);
  copyFileSync(source, copy);
  if (table !== "(nothing dropped)") {
    const db = new Database(copy);
    db.exec(`DROP TABLE IF EXISTS "${table}"`);
    db.close();
  }

  try {
    const out = execFileSync("npx", ["tsx", "-e", child], {
      cwd: join(import.meta.dirname, ""),
      env: { ...process.env, PERSEUS_DB: copy },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const line = out.trim().split("\n").filter((l) => l.startsWith("{")).pop() ?? "{}";
    const { lost, customers, opportunities } = JSON.parse(line);
    console.log(
      `PASS  without ${table.padEnd(24)} ${String(customers).padStart(4)} customers, ${String(opportunities).padStart(4)} opportunities` +
        (lost?.length ? `, lost: ${lost.join(", ")}` : ""),
    );
  } catch (err) {
    failures++;
    const detail = err instanceof Error && "stderr" in err ? String(err.stderr).trim().split("\n").slice(-4).join(" | ") : String(err);
    console.log(`FAIL  without ${table.padEnd(24)} ${detail}`);
  }
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures === 0 ? "The data layer degrades cleanly for every optional table." : `${failures} case(s) threw instead of degrading.`}`);
process.exit(failures === 0 ? 0 : 1);
