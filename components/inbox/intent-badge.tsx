import { Badge } from "@/components/ui/badge";
import type { ReplyIntent } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { formatCalendarDate } from "@/components/queue/format";

export const INTENT_LABELS: Record<ReplyIntent, string> = {
  paid: "Paid",
  promise_to_pay: "Promise to pay",
  dispute: "Dispute",
  question: "Question",
  wrong_contact: "Wrong contact",
  out_of_office: "Out of office",
  unsubscribe: "Unsubscribe",
  other: "Other",
};

/** Moss for paid, amber for promises, brick only for disputes; everything else stays quiet. */
const INTENT_CLASSES: Partial<Record<ReplyIntent, string>> = {
  paid: "bg-moss text-moss-foreground",
  promise_to_pay: "bg-amber text-amber-foreground",
  dispute: "bg-brick text-brick-foreground",
};

export function IntentBadge({
  intent,
  promiseDate,
  className,
}: {
  intent: ReplyIntent | null;
  promiseDate?: string | null;
  className?: string;
}) {
  if (!intent) {
    return (
      <Badge variant="outline" className={cn("h-6 px-2.5", className)}>
        Unclassified
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className={cn("h-6 px-2.5", INTENT_CLASSES[intent], className)}>
      {INTENT_LABELS[intent]}
      {intent === "promise_to_pay" && promiseDate ? (
        <span className="tabular">· {formatCalendarDate(promiseDate)}</span>
      ) : null}
    </Badge>
  );
}
