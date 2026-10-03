"use client";

import { useActionState } from "react";
import { signIn } from "../actions";
import { initialAuthState } from "../form-state";
import { Field, FormError, SubmitButton } from "../form-parts";

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, initialAuthState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormError message={state.error} />
      <Field
        id="email"
        label="Email"
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Signing in">Sign in</SubmitButton>
    </form>
  );
}
