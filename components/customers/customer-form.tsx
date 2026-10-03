"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateCustomerAction } from "@/app/(app)/customers/actions";
import { initialActionResult, type ActionResult } from "@/components/invoices/action-result";
import { Field, FieldShell, FormError, SubmitButton } from "@/components/invoices/form-parts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ContactFlag } from "@/lib/db/types";
import { CONTACT_FLAG_OPTIONS } from "./contact-badges";
import { RiskScoreField } from "./risk-score-field";

export type EditableCustomer = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  notes: string | null;
  risk_score: number;
  do_not_contact: boolean;
  contact_flag: string;
};

function asFlag(value: string): ContactFlag {
  return CONTACT_FLAG_OPTIONS.some((o) => o.value === value) ? (value as ContactFlag) : "none";
}

export function CustomerForm({ customer }: { customer: EditableCustomer }) {
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const [pending, startTransition] = useTransition();
  const [doNotContact, setDoNotContact] = useState(customer.do_not_contact);
  const [contactFlag, setContactFlag] = useState<ContactFlag>(asFlag(customer.contact_flag));
  const [email, setEmail] = useState(customer.email);
  const errors = state.fieldErrors ?? {};

  const emailChanged = email.trim().toLowerCase() !== customer.email.trim().toLowerCase();
  const willResetFlag = emailChanged && customer.contact_flag === "wrong_contact" && contactFlag === "wrong_contact";

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("doNotContact", doNotContact ? "on" : "");
    formData.set("contactFlag", contactFlag);
    startTransition(async () => {
      const result = await updateCustomerAction(customer.id, formData);
      setState(result);
      if (result.ok) {
        toast.success(result.message ?? "Customer saved.");
        // The server may have reset the flag; mirror it so the next save starts from the truth.
        if (willResetFlag) setContactFlag("none");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Contact name" defaultValue={customer.name} required error={errors.name} />
        <Field
          id="company"
          label="Company"
          defaultValue={customer.company ?? ""}
          placeholder="Optional"
          error={errors.company}
        />
        <Field
          id="email"
          label="Billing email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="sm:col-span-2"
          error={errors.email}
          hint={
            willResetFlag
              ? "Saving a new address clears the wrong-contact flag and re-plans this customer's open invoices."
              : undefined
          }
        />
      </div>

      <RiskScoreField id="riskScore" defaultValue={customer.risk_score} error={errors.riskScore} />

      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div className="grid gap-1">
            <Label htmlFor="doNotContact">Do not contact</Label>
            <p className="text-xs text-muted-foreground">
              Dunnit stops all reminders to this customer. Invoices stay on your books.
            </p>
          </div>
          <Switch id="doNotContact" checked={doNotContact} onCheckedChange={setDoNotContact} />
        </div>
        <FieldShell
          id="contactFlag"
          label="Contact status"
          error={errors.contactFlag}
          hint="Set automatically from replies and bounces. Wrong contact or bounced pauses chasing."
          className="sm:col-span-2"
        >
          <Select value={willResetFlag ? "none" : contactFlag} onValueChange={(v) => setContactFlag(asFlag(v))}>
            <SelectTrigger id="contactFlag" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {CONTACT_FLAG_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      </div>

      <FieldShell id="notes" label="Notes" error={errors.notes} hint="Private to your team; never sent to the customer.">
        <Textarea
          id="notes"
          name="notes"
          defaultValue={customer.notes ?? ""}
          maxLength={2000}
          className="min-h-24"
          aria-invalid={errors.notes ? true : undefined}
        />
      </FieldShell>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}
