import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "./format";

const LABELS: Record<DisplayStatus, string> = {
  open: "Open",
  overdue: "Overdue",
  pending_verification: "Pending",
  paid: "Paid",
  disputed: "Disputed",
  written_off: "Written off",
  paused: "Paused",
};

const STYLES: Record<DisplayStatus, string> = {
  open: "",
  overdue: "border-amber/60 bg-accent text-amber-foreground dark:text-amber",
  pending_verification: "bg-amber text-amber-foreground",
  paid: "bg-moss text-moss-foreground",
  disputed: "bg-brick text-brick-foreground",
  written_off: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
};

export function invoiceStatusLabel(status: DisplayStatus): string {
  return LABELS[status];
}

export function InvoiceStatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  return (
    <Badge
      variant={status === "open" ? "secondary" : "outline"}
      className={cn(status !== "open" && status !== "overdue" && "border-transparent", STYLES[status], className)}
      title={status === "pending_verification" ? "Customer says it's paid; confirm the payment" : undefined}
    >
      {LABELS[status]}
    </Badge>
  );
}
