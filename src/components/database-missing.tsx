import { Database } from "lucide-react";
import { searchedPaths } from "@/lib/db";

/** Shown instead of a stack trace when no database file can be found. */
export function DatabaseMissing() {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border bg-card p-8">
      <Database className="mb-3 size-6 text-muted-foreground" />
      <h1 className="text-xl font-semibold tracking-tight">No database found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This app reads a dealer management database directly. Put the dealership export at the repository root as{" "}
        <code className="rounded bg-secondary px-1 py-0.5">perseus_equipment_database.db</code>, or generate the
        sample dataset to explore the app first.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md bg-secondary p-3 text-xs">npm run seed</pre>
      <p className="mt-4 text-xs font-medium text-muted-foreground">Locations checked, in order:</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {searchedPaths().map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Set <code className="rounded bg-secondary px-1 py-0.5">PERSEUS_DB</code> to read a file from anywhere else.
      </p>
    </div>
  );
}
