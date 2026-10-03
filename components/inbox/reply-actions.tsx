"use client";

import { useTransition } from "react";
import { Check, CircleDollarSign, Play } from "lucide-react";
import { toast } from "sonner";
import { markInvoicePaidAction, markReplyHandledAction, resumeCadenceAction } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import type { InboxSimpleResult } from "./types";
import type { ReplyTaskType } from "@/lib/domain/replies";

function report(result: InboxSimpleResult) {
  if (result.ok) toast.success(result.message);
  else toast.error(result.error);
}

/** Task-specific buttons for one derived owner task on a reply. */
export function TaskActions({
  replyId,
  taskType,
  isQuestion,
  handled,
  invoicePaid,
}: {
  replyId: string;
  taskType: ReplyTaskType;
  isQuestion: boolean;
  handled: boolean;
  invoicePaid: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const run = (action: (id: string) => Promise<InboxSimpleResult>) =>
    startTransition(async () => report(await action(replyId)));

  if (taskType === "confirm_payment" && !invoicePaid) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => run(markInvoicePaidAction)}
          disabled={pending}
          className="bg-moss text-moss-foreground hover:bg-moss/85"
        >
          <CircleDollarSign aria-hidden />
          {pending ? "Saving" : "Mark invoice paid"}
        </Button>
      </div>
    );
  }

  if (handled) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => run(markReplyHandledAction)}
        disabled={pending}
        className="bg-amber text-amber-foreground hover:bg-amber/85"
      >
        <Check aria-hidden />
        Mark handled
      </Button>
      {isQuestion && taskType !== "confirm_payment" ? (
        <Button size="sm" variant="outline" onClick={() => run(resumeCadenceAction)} disabled={pending}>
          <Play aria-hidden />
          Resume cadence
        </Button>
      ) : null}
    </div>
  );
}

/** For replies with no derived task (e.g. a dated promise or out-of-office): dismiss from Needs attention. */
export function MarkHandledButton({ replyId }: { replyId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(async () => report(await markReplyHandledAction(replyId)))}
    >
      <Check aria-hidden />
      {pending ? "Saving" : "Mark handled"}
    </Button>
  );
}
