"use client";

import { useActionState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openPortal, startCheckout } from "./actions";
import { initialBillingState } from "./form-state";

function ActionButton({
  action,
  label,
  pendingLabel,
  disabled,
  variant,
}: {
  action: typeof startCheckout;
  label: string;
  pendingLabel: string;
  disabled: boolean;
  variant: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, initialBillingState);
  return (
    <form action={formAction} className="grid gap-2">
      <Button type="submit" size="lg" variant={variant} disabled={disabled || pending} aria-disabled={disabled || pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {pendingLabel}
          </>
        ) : (
          <>
            {label}
            <ArrowUpRight aria-hidden />
          </>
        )}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function UpgradeButton({ disabled }: { disabled: boolean }) {
  return (
    <ActionButton
      action={startCheckout}
      label="Upgrade to Pro"
      pendingLabel="Opening Stripe Checkout"
      disabled={disabled}
      variant="default"
    />
  );
}

export function ManageButton({ disabled }: { disabled: boolean }) {
  return (
    <ActionButton
      action={openPortal}
      label="Manage subscription"
      pendingLabel="Opening Stripe"
      disabled={disabled}
      variant="outline"
    />
  );
}
