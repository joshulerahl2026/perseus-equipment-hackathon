import { cached, getDb } from "./db";

/**
 * Every query in the app declares the tables and columns it needs. The probe
 * runs once per database generation so a mismatch surfaces as a readable
 * report instead of an exception thrown from deep inside a query.
 */
const REQUIREMENTS = {
  core: {
    Customer: ["CustomerId", "CustomerName", "CustomerNo"],
    InvoiceHeader: ["InvoiceDocId", "Status", "InvoiceType", "ActivityDate", "CustomerId", "TotalInvoice"],
  },
  invoiceLines: { InvoiceDetail: ["ItemId", "InvoiceDocId", "ItemType", "NetExt"] },
  // Sale lines only reach an invoice through InvoiceDetail, so every query
  // over them needs that table as much as it needs the sale table itself.
  partsSales: {
    SalePart: ["ItemId", "PartId", "PartNo", "Qty", "NetExt"],
    InvoiceDetail: ["ItemId", "InvoiceDocId"],
  },
  partsCost: { SalePart: ["AvgCost"], InvoiceDetail: ["ItemId", "InvoiceDocId"] },
  partsCatalog: { PartMaster: ["PartId", "PartNo", "Description"] },
  partsPolicy: { PartLocation: ["PartId", "MinStock", "MaxStock"] },
  units: { UnitBase: ["UnitId", "StockNo", "StockStatus", "BaseRetail", "BaseCost"] },
  unitOwnership: { UnitCustomer: ["UnitId", "CustomerId"] },
  warranty: { UnitSerial: ["UnitId", "WarrantyEndDate"] },
  serviceSegments: { InvoiceSegment: ["InvoiceDocId", "ServiceCode", "LaborAmount", "LaborHours"] },
  technicianTime: { WorkInProgress: ["InvoiceDocId", "ElapsedHours"] },
  schedule: { WorkOrderSchedule: ["InvoiceDocId", "ActualDate"] },
  workOrderStatus: { SettingsWorkOrderStatus: ["WorkOrderStatusId", "Description"] },
  customerClass: { CustomerClass: ["CustomerClassId", "Description"] },
  contacts: { Contact: ["ContactId", "CustomerId"] },
  payments: { Payment: ["InvoiceDocId", "Amount"] },
} as const;

export type Capability = keyof typeof REQUIREMENTS;

export type SchemaReport = {
  tables: Record<string, string[]>;
  capabilities: Record<Capability, boolean>;
  /** What each unavailable capability was missing, for the diagnostics page. */
  gaps: { capability: Capability; table: string; missing: string[] }[];
  /**
   * Tables whose names suggest support tickets or call logs. The plan calls for
   * preferring real contact records over service-data proxies if they exist.
   */
  supportTableCandidates: string[];
  dateFormat: { sample: string | null; recognized: boolean };
};

function listTables(): Record<string, string[]> {
  const { db } = getDb();
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  const out: Record<string, string[]> = {};
  for (const { name } of tables) {
    const cols = db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all() as { name: string }[];
    out[name] = cols.map((c) => c.name);
  }
  return out;
}

export function schemaReport(): SchemaReport {
  return cached("schema:report", () => {
    const tables = listTables();
    const lower = new Map(Object.keys(tables).map((t) => [t.toLowerCase(), t]));

    const resolveTable = (want: string) => lower.get(want.toLowerCase());
    const capabilities = {} as Record<Capability, boolean>;
    const gaps: SchemaReport["gaps"] = [];

    for (const [capability, spec] of Object.entries(REQUIREMENTS) as [Capability, Record<string, readonly string[]>][]) {
      let ok = true;
      for (const [table, columns] of Object.entries(spec)) {
        const actual = resolveTable(table);
        if (!actual) {
          ok = false;
          gaps.push({ capability, table, missing: [...columns] });
          continue;
        }
        const have = new Set(tables[actual].map((c) => c.toLowerCase()));
        const missing = columns.filter((c) => !have.has(c.toLowerCase()));
        if (missing.length) {
          ok = false;
          gaps.push({ capability, table, missing });
        }
      }
      capabilities[capability] = ok;
    }

    const supportTableCandidates = Object.keys(tables).filter((t) =>
      /ticket|helpdesk|help_desk|calllog|call_log|\bcase\b|support|complaint|incident/i.test(t),
    );

    let sample: string | null = null;
    if (capabilities.core) {
      const row = getDb()
        .db.prepare(`SELECT ActivityDate d FROM InvoiceHeader WHERE ActivityDate IS NOT NULL LIMIT 1`)
        .get() as { d: string } | undefined;
      sample = row?.d ?? null;
    }

    return {
      tables,
      capabilities,
      gaps,
      supportTableCandidates,
      // Everything downstream slices or string-compares the leading date, which
      // holds for any YYYY-MM-DD prefixed value.
      dateFormat: { sample, recognized: sample ? /^\d{4}-\d{2}-\d{2}/.test(sample) : false },
    };
  });
}

export function can(capability: Capability): boolean {
  return schemaReport().capabilities[capability];
}

/** Case-insensitive table lookup, returning the real name as spelled in the file. */
export function tableName(want: string): string | undefined {
  const { tables } = schemaReport();
  return Object.keys(tables).find((t) => t.toLowerCase() === want.toLowerCase());
}

export function hasTable(want: string): boolean {
  return tableName(want) !== undefined;
}

export function hasColumn(table: string, column: string): boolean {
  const actual = tableName(table);
  if (!actual) return false;
  return schemaReport().tables[actual].some((c) => c.toLowerCase() === column.toLowerCase());
}

/** Newest activity in the file, which is the honest "data as of" for the UI. */
export function dataAsOf(): string | null {
  return cached("schema:dataAsOf", ({ db }) => {
    if (!can("core")) return null;
    const row = db.prepare(`SELECT MAX(ActivityDate) d FROM InvoiceHeader`).get() as { d: string | null };
    return row?.d ? row.d.slice(0, 10) : null;
  });
}
