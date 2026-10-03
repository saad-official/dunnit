"use client";

import { useTransition } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { runAgentNow } from "@/app/(app)/queue/actions";
import { Button } from "@/components/ui/button";

/** Runs one agent tick for this organization: drafts due steps, sends approved touches. */
export function RunAgentButton() {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await runAgentNow();
      if (!result.ok) {
        toast.error("The agent could not run", { description: result.error });
        return;
      }
      const headline = `Agent run: ${result.drafted} drafted · ${result.sent} sent · ${result.skipped} skipped`;
      if (result.errors.length > 0) {
        toast.warning(headline, {
          description: `${result.errors.length} ${result.errors.length === 1 ? "error" : "errors"}: ${result.errors[0]}`,
        });
      } else if (result.drafted + result.sent + result.skipped === 0) {
        toast.message(headline, { description: "Nothing was due. Cadence steps come due a day or more after the due date." });
      } else {
        toast.success(headline);
      }
    });
  }

  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      <Play aria-hidden />
      {pending ? "Running" : "Run agent now"}
    </Button>
  );
}
