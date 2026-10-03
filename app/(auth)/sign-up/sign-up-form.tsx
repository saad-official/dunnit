"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { signUp } from "../actions";
import { initialAuthState } from "../form-state";
import { Field, FormError, SubmitButton } from "../form-parts";

export function SignUpForm() {
  const [state, formAction] = useActionState(signUp, initialAuthState);

  if (state.checkEmail) {
    return (
      <div className="grid gap-3 text-center" role="status">
        <MailCheck className="mx-auto size-8 text-moss" aria-hidden />
        <h2 className="font-display text-xl">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{state.values?.email}</span>.
          Open it on this device to finish setting up{" "}
          {state.values?.businessName || "your account"}.
        </p>
        <p className="text-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        id="businessName"
        label="Business name"
        autoComplete="organization"
        required
        maxLength={120}
        defaultValue={state.values?.businessName}
        error={state.fieldErrors?.businessName}
        hint="Used to sign the reminders Dunnit drafts for you."
      />
      <Field
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        error={state.fieldErrors?.password}
        hint="At least 10 characters."
      />
      <SubmitButton pendingLabel="Creating your account">Create account</SubmitButton>
    </form>
  );
}
