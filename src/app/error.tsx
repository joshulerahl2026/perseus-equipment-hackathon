"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const missingDatabase = /no perseus database/i.test(error.message);

  return (
    <div className="mx-auto max-w-2xl rounded-lg border bg-card p-8">
      <AlertTriangle className="mb-3 size-6 text-[color:var(--warning)]" />
      <h1 className="text-xl font-semibold tracking-tight">
        {missingDatabase ? "No database found" : "That screen could not be built"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {missingDatabase
          ? "The app reads a dealer management database directly. Run npm run seed to generate the sample dataset, or put the dealership export at the repository root."
          : "Something went wrong reading the database. This usually means the file's schema differs from what a query expected."}
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md bg-secondary p-3 text-xs">{error.message}</pre>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <a href="/diagnostics" className="rounded-md border px-3 py-2 text-sm hover:bg-secondary">
          Check the data source
        </a>
      </div>
    </div>
  );
}
