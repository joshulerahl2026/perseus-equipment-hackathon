import Database from "better-sqlite3";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type DbHandle = {
  db: Database.Database;
  path: string;
  /** True when running against the generated stand-in rather than the real export. */
  isSample: boolean;
  /** Bumped whenever the file changes on disk, so derived results are recomputed. */
  generation: string;
};

const REAL_DB_NAMES = [
  "perseus_equipment_database.db",
  "data/perseus_equipment_database.db",
  "perseus_equipment_database.sqlite",
];
const SAMPLE_DB = "data/perseus-sample.db";

export class DatabaseMissingError extends Error {
  constructor(readonly searched: string[]) {
    super("No Perseus database found");
    this.name = "DatabaseMissingError";
  }
}

function resolveDbPath(): { path: string; isSample: boolean } {
  const candidates = [
    ...(process.env.PERSEUS_DB ? [process.env.PERSEUS_DB] : []),
    ...REAL_DB_NAMES,
    SAMPLE_DB,
  ];
  for (const candidate of candidates) {
    // Resolved at runtime on purpose: the operator drops the real export in
    // beside the app, so the bundler has no way to know the path in advance.
    const full = resolve(/* turbopackIgnore: true */ process.cwd(), candidate);
    if (existsSync(full)) {
      return { path: full, isSample: full.endsWith("perseus-sample.db") };
    }
  }
  throw new DatabaseMissingError(candidates);
}

let handle: DbHandle | null = null;

/**
 * Opens the database read-only. The real export always wins over the sample.
 * Queries run per request; the only thing cached is the connection itself, and
 * that is dropped as soon as the file's mtime or size changes.
 */
export function getDb(): DbHandle {
  const { path, isSample } = resolveDbPath();
  const stat = statSync(path);
  const generation = `${path}:${stat.mtimeMs}:${stat.size}`;

  if (handle && handle.generation === generation) return handle;

  handle?.db.close();
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("query_only = true");
  handle = { db, path, isSample, generation };
  return handle;
}

/** Lets a page render setup instructions instead of throwing. */
export function databaseAvailable(): boolean {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}

export function searchedPaths(): string[] {
  return [
    ...(process.env.PERSEUS_DB ? [process.env.PERSEUS_DB] : []),
    ...REAL_DB_NAMES,
    SAMPLE_DB,
  ];
}

const memo = new Map<string, { generation: string; value: unknown }>();

/**
 * Memoizes a derived result against the current file generation and the
 * current date.
 *
 * A changed database file invalidates everything, so nothing stale can survive
 * a refresh. The date matters just as much: almost every figure in the app is
 * cut to a trailing twelve months measured from today, so a long-running
 * server pointed at a static export would otherwise keep serving the window it
 * computed on its first request, however many days ago that was.
 */
export function cached<T>(key: string, compute: (handle: DbHandle) => T): T {
  const handle = getDb();
  const generation = `${handle.generation}@${new Date().toISOString().slice(0, 10)}`;
  const hit = memo.get(key);
  if (hit && hit.generation === generation) return hit.value as T;
  const value = compute(handle);
  memo.set(key, { generation, value });
  return value;
}

export function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().db.prepare(sql).all(...(params as never[])) as T[];
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().db.prepare(sql).get(...(params as never[])) as T | undefined;
}
