"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/db/queries";
import { optionalEnv } from "@/lib/env";
import { createCheckoutSession, createPortalSession, isBillingConfigured } from "@/lib/stripe/billing";
import type { BillingActionState } from "./form-state";

/*
 * Billing actions only create Stripe-hosted sessions and redirect to them.
 * The plan itself changes when Stripe calls /api/webhooks/stripe, which
 * writes organizations.plan with the service client.
 */

/** Base URL for Stripe's return links: NEXT_PUBLIC_APP_URL when set, else the request's own origin. */
async function appUrl(): Promise<string> {
  const configured = optionalEnv("NEXT_PUBLIC_APP_URL");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function describe(error: unknown): string {
  console.error("[stripe] session creation failed", error instanceof Error ? error.message : error);
  return "Stripe could not start that session. Check the Stripe keys and price id, then try again.";
}

export async function startCheckout(): Promise<BillingActionState> {
  const { user, org, role } = await requireOrgContext();
  if (role !== "owner") return { error: "Only the account owner can change the plan." };
  if (!isBillingConfigured()) return { error: "Billing is not configured on this deployment." };
  if (org.plan === "pro") return { error: "You're already on Pro. Use Manage subscription instead." };

  let url: string;
  try {
    url = await createCheckoutSession({ org, userEmail: user.email, appUrl: await appUrl() });
  } catch (error) {
    return { error: describe(error) };
  }
  redirect(url);
}

export async function openPortal(): Promise<BillingActionState> {
  const { org, role } = await requireOrgContext();
  if (role !== "owner") return { error: "Only the account owner can manage the subscription." };
  if (!optionalEnv("STRIPE_SECRET_KEY")) return { error: "Billing is not configured on this deployment." };
  if (!org.stripe_customer_id) return { error: "There is no Stripe customer for this account yet." };

  let url: string;
  try {
    url = await createPortalSession({ customerId: org.stripe_customer_id, appUrl: await appUrl() });
  } catch (error) {
    return { error: describe(error) };
  }
  redirect(url);
}
