"use client";

import { useState, useTransition } from "react";
import { Loader2, MoreHorizontal, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { clearDemoDataAction, seedDemoDataAction } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AddInvoiceDialog, type CustomerChoice } from "./add-invoice-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";

/** Disabled buttons swallow pointer events, so the tooltip hangs off a focusable wrapper. */
function DisabledHint({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export function InvoiceHeaderActions({
  customers,
  today,
  netThirty,
  atLimit,
  remaining,
  hasDemoData,
  canRemoveDemo,
}: {
  customers: CustomerChoice[];
  today: string;
  netThirty: string;
  /** Free plan with 10 active invoices. */
  atLimit: boolean;
  remaining: number | null;
  hasDemoData: boolean;
  canRemoveDemo: boolean;
}) {
  const limitHint = "Free plan limit reached (10 active invoices). Upgrade on Billing to add more.";

  const add = (
    <AddInvoiceDialog customers={customers} defaultIssuedAt={today} defaultDueAt={netThirty} disabled={atLimit} />
  );
  const importCsv = <ImportCsvDialog disabled={atLimit} remaining={remaining} />;

  return (
    <TooltipProvider>
      {atLimit ? <DisabledHint hint={limitHint}>{importCsv}</DisabledHint> : importCsv}
      {atLimit ? <DisabledHint hint={limitHint}>{add}</DisabledHint> : add}
      <DemoDataControls hasDemoData={hasDemoData} canRemoveDemo={canRemoveDemo} />
    </TooltipProvider>
  );
}

function DemoDataControls({ hasDemoData, canRemoveDemo }: { hasDemoData: boolean; canRemoveDemo: boolean }) {
  const [seeding, startSeed] = useTransition();
  const [clearing, startClear] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function seed() {
    startSeed(async () => {
      const result = await seedDemoDataAction();
      if (result.ok) toast.success(result.message ?? "Demo data loaded.");
      else toast.error(result.error ?? "Could not load demo data.");
    });
  }

  function clear() {
    startClear(async () => {
      const result = await clearDemoDataAction();
      if (result.ok) {
        toast.success(result.message ?? "Demo data removed.");
        setConfirmOpen(false);
      } else {
        toast.error(result.error ?? "Could not remove demo data.");
      }
    });
  }

  const loadButton = (
    <Button variant="secondary" onClick={seed} disabled={hasDemoData || seeding}>
      {seeding ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
      {seeding ? "Loading demo data" : "Load demo data"}
    </Button>
  );

  return (
    <>
      {hasDemoData ? <DisabledHint hint="Demo data is already loaded.">{loadButton}</DisabledHint> : loadButton}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More invoice actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            variant="destructive"
            disabled={!hasDemoData || !canRemoveDemo}
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 aria-hidden />
            Remove demo data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove demo data?"
        description="This deletes the demo customers and invoices, with their drafts, sent reminders and replies. Your own invoices are not touched. The activity log keeps its history."
        confirmLabel="Remove demo data"
        pendingLabel="Removing"
        pending={clearing}
        destructive
        onConfirm={clear}
      />
    </>
  );
}
