"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/db/queries";
import type { Json, OrganizationUpdate, OrgVoiceJson } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { OTHER_TIMEZONE, type SettingsFormState } from "./form-state";

/*
 * Settings mutations. Every action resolves the caller's org first and writes
 * through the per-request client, so RLS and the column-level grant
 * (name, slug, timezone, voice, autonomy) apply. plan is never written here.
 */

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

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const fail = (message: string, fieldErrors?: Record<string, string>): SettingsFormState => ({
  status: "error",
  message,
  fieldErrors,
  at: Date.now(),
});

const ok = (message: string): SettingsFormState => ({ status: "success", message, at: Date.now() });

async function saveOrg(orgId: string, patch: OrganizationUpdate): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update(patch).eq("id", orgId).select("id");
  if (error) {
    console.error("[settings] update failed", error.message);
    return "Could not save your changes. Try again.";
  }
  if (!data || data.length === 0) return "You don't have permission to change these settings.";
  return null;
}

const businessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your business name." })
    .max(120, { error: "Keep it under 120 characters." }),
  timezone: z
    .string()
    .trim()
    .min(1, { error: "Choose a timezone." })
    .max(64, { error: "That doesn't look like a timezone name." })
    .refine(isValidTimeZone, { error: "Use an IANA timezone name, for example America/New_York." }),
});

export async function updateBusiness(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { org } = await requireOrgContext();
  const choice = text(formData, "timezone");
  const parsed = businessSchema.safeParse({
    name: text(formData, "name"),
    timezone: choice === OTHER_TIMEZONE ? text(formData, "timezoneCustom") : choice,
  });
  if (!parsed.success) {
    const fieldErrors = firstErrors(parsed.error);
    if (choice === OTHER_TIMEZONE && fieldErrors.timezone) {
      fieldErrors.timezoneCustom = fieldErrors.timezone;
    }
    return fail("Check the highlighted fields.", fieldErrors);
  }

  const error = await saveOrg(org.id, { name: parsed.data.name, timezone: parsed.data.timezone });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return ok("Business details saved.");
}

const voiceSchema = z.object({
  business_name: z.string().trim().max(120, { error: "Keep it under 120 characters." }),
  signature: z.string().trim().max(500, { error: "Keep the signature under 500 characters." }),
  tone_notes: z.string().trim().max(500, { error: "Keep tone notes under 500 characters." }),
});

export async function updateVoice(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { org } = await requireOrgContext();
  const parsed = voiceSchema.safeParse({
    business_name: text(formData, "business_name"),
    signature: text(formData, "signature").replace(/\r\n/g, "\n"),
    tone_notes: text(formData, "tone_notes").replace(/\r\n/g, "\n"),
  });
  if (!parsed.success) return fail("Check the highlighted fields.", firstErrors(parsed.error));

  // Keep any other keys already stored in voice; empty fields fall back to defaults (see parseVoice).
  const existing =
    org.voice && typeof org.voice === "object" && !Array.isArray(org.voice) ? (org.voice as Record<string, Json>) : {};
  const next: OrgVoiceJson & Record<string, Json> = { ...existing };
  for (const key of ["business_name", "signature", "tone_notes"] as const) {
    const value = parsed.data[key];
    if (value) next[key] = value;
    else delete next[key];
  }

  const error = await saveOrg(org.id, { voice: next });
  if (error) return fail(error);
  revalidatePath("/settings");
  return ok("Voice saved. New drafts will use it.");
}

const autonomySchema = z.object({
  autonomy: z.enum(["manual", "auto_step1", "auto_all_low_risk"], { error: "Choose how much Dunnit may send." }),
});

export async function updateAutonomy(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { org } = await requireOrgContext();
  const parsed = autonomySchema.safeParse({ autonomy: text(formData, "autonomy") });
  if (!parsed.success) return fail("Choose an option.", firstErrors(parsed.error));

  if (parsed.data.autonomy !== "manual" && org.plan !== "pro") {
    return fail("Auto-send is a Pro feature. Upgrade on the Billing page to turn it on.", {
      autonomy: "Available on Pro.",
    });
  }

  const error = await saveOrg(org.id, { autonomy: parsed.data.autonomy });
  if (error) return fail(error);
  revalidatePath("/settings");
  return ok(
    parsed.data.autonomy === "manual"
      ? "Autonomy saved. Every draft now waits for your approval."
      : "Autonomy saved. Eligible drafts will send on their own.",
  );
}
