import { SearchX } from "lucide-react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-14 text-center">
      <SearchX className="size-6 text-muted-foreground/60" />
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
