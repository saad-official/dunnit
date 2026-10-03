"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createInvoiceAction } from "@/app/(app)/invoices/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initialActionResult, type ActionResult } from "./action-result";
import { Field, FieldShell, FormError, SubmitButton } from "./form-parts";

export type CustomerChoice = { id: string; name: string; email: string; company: string | null };

const NEW_CUSTOMER = "new";

export function AddInvoiceDialog({
  customers,
  defaultIssuedAt,
  defaultDueAt,
  disabled,
  trigger,
}: {
  customers: CustomerChoice[];
  /** Today in the org zone, YYYY-MM-DD. */
  defaultIssuedAt: string;
  /** Net-30 default. */
  defaultDueAt: string;
  disabled?: boolean;
  /** Custom trigger; defaults to an "Add invoice" button. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button disabled={disabled}>
            <Plus aria-hidden />
            Add invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Add an invoice</DialogTitle>
          <DialogDescription>
            Dunnit plans its reminder cadence from the due date as soon as you save.
          </DialogDescription>
        </DialogHeader>
        <AddInvoiceForm
          customers={customers}
          defaultIssuedAt={defaultIssuedAt}
          defaultDueAt={defaultDueAt}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddInvoiceForm({
  customers,
  defaultIssuedAt,
  defaultDueAt,
  onDone,
}: {
  customers: CustomerChoice[];
  defaultIssuedAt: string;
  defaultDueAt: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const [pending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState<string>(customers.length === 0 ? NEW_CUSTOMER : "");
  const isNew = customerId === NEW_CUSTOMER;
  const errors = state.fieldErrors ?? {};

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("customerId", customerId || "");
    startTransition(async () => {
      const result = await createInvoiceAction(initialActionResult, formData);
      setState(result);
      if (result.ok) {
        toast.success(result.message ?? "Invoice added.");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={state.error} />

      <FieldShell id="customerId" label="Customer" error={errors.customerId}>
        <Select value={customerId || undefined} onValueChange={setCustomerId}>
          <SelectTrigger
            id="customerId"
            className="w-full"
            aria-invalid={errors.customerId ? true : undefined}
          >
            <SelectValue placeholder="Choose a customer" />
          </SelectTrigger>
          <SelectContent position="popper">
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.company ? `${c.name} · ${c.company}` : c.name}
              </SelectItem>
            ))}
            {customers.length > 0 ? <SelectSeparator /> : null}
            <SelectItem value={NEW_CUSTOMER}>New customer…</SelectItem>
          </SelectContent>
        </Select>
      </FieldShell>

      {isNew ? (
        <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
          <Field
            id="customerName"
            label="Contact name"
            autoComplete="off"
            required
            error={errors.customerName}
          />
          <Field
            id="customerEmail"
            label="Billing email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            error={errors.customerEmail}
          />
          <Field
            id="customerCompany"
            label="Company (optional)"
            autoComplete="off"
            className="sm:col-span-2"
            error={errors.customerCompany}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="number" label="Invoice number" autoComplete="off" required error={errors.number} />
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <Field
            id="amount"
            label="Amount"
            inputMode="decimal"
            placeholder="1,250.00"
            autoComplete="off"
            required
            className="money"
            error={errors.amount}
          />
          <FieldShell id="currency" label="Currency" error={errors.currency}>
            <Input
              id="currency"
              name="currency"
              defaultValue="USD"
              maxLength={3}
              autoCapitalize="characters"
              className="uppercase"
              aria-invalid={errors.currency ? true : undefined}
            />
          </FieldShell>
        </div>
        <Field
          id="issuedAt"
          label="Issued"
          type="date"
          defaultValue={defaultIssuedAt}
          required
          error={errors.issuedAt}
        />
        <Field id="dueAt" label="Due" type="date" defaultValue={defaultDueAt} required error={errors.dueAt} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving" disabled={!customerId}>
          Add invoice
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
