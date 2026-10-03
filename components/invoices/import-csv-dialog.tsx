"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importInvoicesCsvAction } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseInvoiceCsv, type CsvError } from "@/lib/domain/csv";
import { formatCents } from "@/lib/domain/money";
import type { CsvImportActionResult } from "./action-result";
import { formatCalendarDate, pluralize } from "./format";
import { FormError } from "./form-parts";

const MAX_BYTES = 512 * 1024;
const SAMPLE = `number,customer,email,amount,currency,issued,due
INV-2001,Harbor Lane Studio,maya@harborlane.example,"2,350.00",USD,2026-09-01,2026-10-01`;

export function ImportCsvDialog({
  disabled,
  remaining,
}: {
  disabled?: boolean;
  /** Free plan headroom; null on Pro. */
  remaining: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        <Button variant="outline" disabled={disabled}>
          <FileUp aria-hidden />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Import invoices from CSV</DialogTitle>
          <DialogDescription>
            Columns: number, customer, email, amount, currency (optional), issued date, due date. Dates as
            YYYY-MM-DD or MM/DD/YYYY. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>
        <ImportCsvForm remaining={remaining} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvForm({ remaining, onDone }: { remaining: number | null; onDone: () => void }) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const deferredText = useDeferredValue(csvText);
  const preview = useMemo(
    () => (deferredText.trim() === "" ? null : parseInvoiceCsv(deferredText)),
    [deferredText],
  );
  const rowCount = preview?.rows.length ?? 0;
  const overLimit = remaining !== null && rowCount > remaining;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setResult(null);
    setReadError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setReadError("That file is larger than 512 KB. Split it and import in parts.");
      return;
    }
    try {
      setCsvText(await file.text());
      setFileName(file.name);
    } catch {
      setReadError("Could not read that file. Try pasting the CSV instead.");
    }
  }

  function onConfirm() {
    startTransition(async () => {
      const response = await importInvoicesCsvAction(csvText);
      setResult(response);
      if (response.ok) {
        toast.success(response.message ?? "Invoices imported.");
        if (!response.errors || response.errors.length === 0) onDone();
      }
    });
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="csvFile">Upload a file</Label>
          <Input id="csvFile" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
          <p className="text-xs text-muted-foreground">
            {fileName ? `Loaded ${fileName}. Edit it on the right if needed.` : "Up to 512 KB."}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="csvText">Or paste CSV</Label>
          <Textarea
            id="csvText"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setResult(null);
            }}
            placeholder={SAMPLE}
            spellCheck={false}
            className="max-h-40 min-h-24 font-mono text-xs"
          />
        </div>
      </div>

      <FormError message={readError ?? undefined} />

      {preview ? <Preview rows={preview.rows} errors={preview.errors} /> : null}

      {overLimit ? (
        <p role="alert" className="rounded-lg border border-amber/50 bg-accent px-3 py-2 text-sm text-amber-foreground">
          Your Free plan has room for {pluralize(remaining ?? 0, "more active invoice")}; this file has {rowCount}.{" "}
          <Link href="/billing" className="font-medium underline underline-offset-3">
            Upgrade to Pro
          </Link>{" "}
          or trim the file.
        </p>
      ) : null}

      {result && !result.ok ? <FormError message={result.error} /> : null}
      {result?.errors && result.errors.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            {result.created ? `Imported ${pluralize(result.created, "invoice")}. ` : ""}
            {pluralize(result.errors.length, "row")} skipped:
          </p>
          <ErrorList errors={result.errors} />
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          {result?.ok ? "Done" : "Cancel"}
        </Button>
        <Button onClick={onConfirm} disabled={pending || rowCount === 0 || overLimit || Boolean(result?.ok)}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Importing
            </>
          ) : (
            `Import ${pluralize(rowCount, "invoice")}`
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Preview({ rows, errors }: { rows: ReturnType<typeof parseInvoiceCsv>["rows"]; errors: CsvError[] }) {
  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-sm">
        <span className="font-medium text-moss">{pluralize(rows.length, "row")} ready</span>
        {errors.length > 0 ? (
          <span className="text-amber-foreground dark:text-amber">
            {" "}
            · {pluralize(errors.length, "problem")} to skip
          </span>
        ) : null}
      </p>
      {rows.length > 0 ? (
        <div className="max-h-56 overflow-auto rounded-lg border">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Line</th>
                <th className="px-2 py-1.5 font-medium">Number</th>
                <th className="px-2 py-1.5 font-medium">Customer</th>
                <th className="px-2 py-1.5 font-medium">Email</th>
                <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                <th className="px-2 py-1.5 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.line} className="border-t">
                  <td className="tabular px-2 py-1.5 text-muted-foreground">{row.line}</td>
                  <td className="px-2 py-1.5 font-medium">{row.number}</td>
                  <td className="px-2 py-1.5">{row.customerName}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.email}</td>
                  <td className="money px-2 py-1.5 text-right">{formatCents(row.amountCents, row.currency)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatCalendarDate(row.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {errors.length > 0 ? <ErrorList errors={errors} /> : null}
    </div>
  );
}

function ErrorList({ errors }: { errors: CsvError[] }) {
  return (
    <ul className="max-h-40 overflow-auto rounded-lg border border-amber/40 bg-accent/50 px-3 py-2 text-xs">
      {errors.map((error, index) => (
        <li key={`${error.line}-${index}`} className="py-0.5">
          <span className="tabular font-medium">Line {error.line}:</span> {error.message}
        </li>
      ))}
    </ul>
  );
}
