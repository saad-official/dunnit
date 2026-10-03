"use client";

import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { approveAllConfident } from "@/app/(app)/queue/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** "Approve all with confidence >= 80%", behind a confirmation dialog. */
export function BulkApproveButton({ count, limit }: { count: number; limit: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const willSend = Math.min(count, limit);

  function confirm() {
    startTransition(async () => {
      const result = await approveAllConfident();
      setOpen(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.approved === 0 && result.failures.length === 0) {
        toast.message("Nothing to approve", { description: "No waiting draft is at 80% confidence or above." });
        return;
      }
      const headline = `${result.approved} approved · ${result.sent} sent`;
      if (result.failures.length > 0) {
        toast.warning(headline, {
          description: `${result.failures.length} not sent. ${result.failures[0]}`,
        });
      } else {
        toast.success(headline, { description: "Check the Outbox to see exactly what went out." });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={count === 0}>
          <CheckCheck aria-hidden />
          Approve all ≥ 80%
          <span className="tabular rounded-full bg-muted px-1.5 text-xs">{count}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Approve and send <span className="tabular">{willSend}</span>{" "}
            {willSend === 1 ? "draft" : "drafts"}?
          </DialogTitle>
          <DialogDescription>
            Every waiting draft with confidence of 80% or higher is approved and sent now, as written.
            {count > limit ? ` Up to ${limit} go per click; run it again for the rest.` : null} Lower-confidence
            drafts stay in the queue for you.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={confirm}
            disabled={pending}
            className="bg-amber text-amber-foreground hover:bg-amber/85"
          >
            {pending ? "Sending" : "Approve & send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
