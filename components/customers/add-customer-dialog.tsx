"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createCustomerAction } from "@/app/(app)/customers/actions";
import { initialActionResult, type ActionResult } from "@/components/invoices/action-result";
import { Field, FormError, SubmitButton } from "@/components/invoices/form-parts";
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
import { RiskScoreField } from "./risk-score-field";

export function AddCustomerDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          Add customer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Add a customer</DialogTitle>
          <DialogDescription>
            The risk score tunes how firmly Dunnit follows up: high-risk customers skip the friendly nudge.
          </DialogDescription>
        </DialogHeader>
        <AddCustomerForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddCustomerForm({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const [pending, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createCustomerAction(initialActionResult, formData);
      setState(result);
      if (result.ok) {
        toast.success(result.message ?? "Customer added.");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError message={state.error} />
      <Field id="name" label="Contact name" autoComplete="off" required error={errors.name} />
      <Field
        id="email"
        label="Billing email"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        error={errors.email}
      />
      <Field id="company" label="Company (optional)" autoComplete="off" error={errors.company} />
      <RiskScoreField id="riskScore" defaultValue={30} error={errors.riskScore} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving">
          Add customer
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
