"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { AuthFormState } from "./form-state";
import { DEFAULT_AFTER_AUTH, safeNextPath } from "./safe-next";

const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(1, { error: "Enter your password." }),
});

const signUpSchema = z.object({
  businessName: z
    .string()
    .min(1, { error: "Enter your business name." })
    .max(120, { error: "Keep it under 120 characters." }),
  email: z.email({ error: "Enter a valid email address." }),
  password: z
    .string()
    .min(10, { error: "Use at least 10 characters." })
    .max(72, { error: "Use 72 characters or fewer." }),
});

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email").trim() };
  const parsed = signInSchema.safeParse({
    email: values.email,
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { fieldErrors: firstErrors(parsed.error), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Confirm your email first. The link is in your inbox.",
        values,
      };
    }
    if (error.status === 429) {
      return { error: "Too many attempts. Wait a minute and try again.", values };
    }
    return { error: "That email and password don't match.", values };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    businessName: text(formData, "businessName").trim(),
    email: text(formData, "email").trim(),
  };
  const parsed = signUpSchema.safeParse({
    ...values,
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { fieldErrors: firstErrors(parsed.error), values };
  }

  const { businessName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by public.handle_new_user() to name the organization.
      data: { business_name: businessName },
      emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(DEFAULT_AFTER_AUTH)}`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return {
        fieldErrors: { email: "An account with this email already exists. Sign in instead." },
        values,
      };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: error.message }, values };
    }
    if (error.status === 429) {
      return { error: "Too many attempts. Wait a minute and try again.", values };
    }
    return { error: "We couldn't create your account. Try again in a moment.", values };
  }

  if (data.session) {
    redirect(DEFAULT_AFTER_AUTH);
  }

  // Email confirmation is on (or the address is already registered and
  // Supabase is hiding that). Either way the next step is the inbox.
  return { checkEmail: true, values };
}

export async function signOut(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/sign-in");
}
