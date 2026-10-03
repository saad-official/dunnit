"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { markInvoicePaidAction, setInvoiceStatusAction } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/lib/db/types";
import type { ActionResult } from "./action-result";
import { ConfirmDialog } from "./confirm-dialog";

type Pending = "paid" | "paused" | "open" | "written_off" | null;

/** Owner actions on one invoice; which ones show depends on the status machine. */
export function InvoiceStatusActions({
  invoiceId,
  number,
  status,
}: {
  invoiceId: string;
  number: string;
  status: InvoiceStatus;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [, startTransition] = useTransition();
  const [confirmWriteOff, setConfirmWriteOff] = useState(false);

  function run(kind: Exclude<Pending, null>, call: () => Promise<ActionResult>, after?: () => void) {
    setPending(kind);
    startTransition(async () => {
      const result = await call();
      setPending(null);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        after?.();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  const busy = pending !== null;
  const closed = status === "paid" || status === "written_off";
  if (closed) return null;

  const spinner = <Loader2 className="animate-spin" aria-hidden />;

  return (
    <>
      <Button onClick={() => run("paid", () => markInvoicePaidAction(invoiceId))} disabled={busy}>
        {pending === "paid" ? spinner : <CircleCheck aria-hidden />}
        {status === "pending_verification" ? "Confirm paid" : "Mark paid"}
      </Button>

      {status === "open" ? (
        <Button
          variant="outline"
          onClick={() => run("paused", () => setInvoiceStatusAction(invoiceId, "paused"))}
          disabled={busy}
        >
          {pending === "paused" ? spinner : <Pause aria-hidden />}
          Pause chasing
        </Button>
      ) : null}

      {status === "paused" ? (
        <Button
          variant="outline"
          onClick={() => run("open", () => setInvoiceStatusAction(invoiceId, "open"))}
          disabled={busy}
        >
          {pending === "open" ? spinner : <Play aria-hidden />}
          Resume
        </Button>
      ) : null}

      {status === "disputed" || status === "pending_verification" ? (
        <Button
          variant="outline"
          onClick={() => run("open", () => setInvoiceStatusAction(invoiceId, "open"))}
          disabled={busy}
          title={status === "pending_verification" ? "Payment didn't arrive; reopen and keep chasing" : undefined}
        >
          {pending === "open" ? spinner : <RotateCcw aria-hidden />}
          Reopen
        </Button>
      ) : null}

      <Button variant="ghost" onClick={() => setConfirmWriteOff(true)} disabled={busy}>
        Write off
      </Button>

      <ConfirmDialog
        open={confirmWriteOff}
        onOpenChange={setConfirmWriteOff}
        title={`Write off invoice ${number}?`}
        description="Dunnit stops chasing it for good and it no longer counts as outstanding. This can't be undone from the app."
        confirmLabel="Write off"
        pendingLabel="Writing off"
        pending={pending === "written_off"}
        destructive
        onConfirm={() =>
          run("written_off", () => setInvoiceStatusAction(invoiceId, "written_off"), () => setConfirmWriteOff(false))
        }
      />
    </>
  );
}
