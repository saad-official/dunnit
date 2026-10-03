import "server-only";
import type Stripe from "stripe";
import type { Organization, OrganizationUpdate, Plan } from "@/lib/db/types";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { Client } from "@/lib/services/shared";
import { stripe } from "@/lib/stripe/client";

/**
 * Stripe Checkout, Customer Portal and subscription → plan sync (spec 3.8).
 * Sandbox / test mode only. organizations.plan and stripe_* are written only
 * by syncSubscriptionToOrg with the service client (from the webhook); members
 * cannot write those columns (column-level grant in the RLS migration).
 */

/** True when the keys Checkout needs are present. The page disables its buttons otherwise. */
export function isBillingConfigured(): boolean {
  return Boolean(optionalEnv("STRIPE_SECRET_KEY") && optionalEnv("STRIPE_PRICE_PRO_MONTHLY"));
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export async function createCheckoutSession(input: {
  org: Pick<Organization, "id" | "stripe_customer_id">;
  userEmail: string | null;
  appUrl: string;
}): Promise<string> {
  const { org, userEmail, appUrl } = input;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: requireEnv("STRIPE_PRICE_PRO_MONTHLY"), quantity: 1 }],
    ...(org.stripe_customer_id
      ? { customer: org.stripe_customer_id }
      : userEmail
        ? { customer_email: userEmail }
        : {}),
    client_reference_id: org.id,
    metadata: { org_id: org.id },
    // Copied onto the subscription so later customer.subscription.* events can find the org.
    subscription_data: { metadata: { org_id: org.id } },
    success_url: joinUrl(appUrl, "/billing?checkout=success"),
    cancel_url: joinUrl(appUrl, "/billing?checkout=cancelled"),
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return session.url;
}

export async function createPortalSession(input: { customerId: string; appUrl: string }): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: joinUrl(input.appUrl, "/billing"),
  });
  return session.url;
}

export function planForStatus(status: Stripe.Subscription.Status): Plan {
  return status === "active" || status === "trialing" ? "pro" : "free";
}

export type SyncResult =
  | { kind: "synced"; orgId: string; plan: Plan; downgraded: boolean }
  | { kind: "ignored"; reason: string };

type OrgBilling = Pick<Organization, "id" | "plan" | "stripe_customer_id" | "stripe_subscription_id">;

async function findOrg(
  service: Client,
  subscription: Stripe.Subscription,
  customerId: string,
  orgIdHint?: string | null,
): Promise<OrgBilling | null> {
  const columns = "id, plan, stripe_customer_id, stripe_subscription_id";
  const candidates: [column: "id" | "stripe_subscription_id" | "stripe_customer_id", value: string | null | undefined][] = [
    ["id", orgIdHint],
    ["id", subscription.metadata?.org_id],
    ["stripe_subscription_id", subscription.id],
    ["stripe_customer_id", customerId],
  ];
  for (const [column, value] of candidates) {
    if (!value) continue;
    if (column === "id" && !/^[0-9a-f-]{36}$/i.test(value)) continue;
    const { data, error } = await service.from("organizations").select(columns).eq(column, value).maybeSingle();
    if (error) throw new Error(`find org by ${column}: ${error.message}`);
    if (data) return data;
  }
  return null;
}

/**
 * Writes a subscription's state onto its organization: plan ('pro' for
 * active/trialing, otherwise 'free'), stripe_customer_id and
 * stripe_subscription_id. A downgrade also forces autonomy back to 'manual',
 * since auto-send is a Pro feature. Idempotent; unknown orgs are ignored.
 * Must be called with the service client.
 */
export async function syncSubscriptionToOrg(
  service: Client,
  subscription: Stripe.Subscription,
  options: { orgIdHint?: string | null } = {},
): Promise<SyncResult> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const org = await findOrg(service, subscription, customerId, options.orgIdHint);
  if (!org) return { kind: "ignored", reason: `no organization for subscription ${subscription.id}` };

  const plan = planForStatus(subscription.status);

  // Out-of-order or stale events: a non-active update for an older subscription
  // must not downgrade an org that has since moved to a newer one.
  if (org.stripe_subscription_id && org.stripe_subscription_id !== subscription.id && plan === "free") {
    return { kind: "ignored", reason: `subscription ${subscription.id} is not the org's current one` };
  }

  const patch: OrganizationUpdate = {
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
  };
  const downgraded = plan === "free";
  if (downgraded) patch.autonomy = "manual";

  const { error } = await service.from("organizations").update(patch).eq("id", org.id);
  if (error) throw new Error(`sync subscription to org ${org.id}: ${error.message}`);

  return { kind: "synced", orgId: org.id, plan, downgraded: downgraded && org.plan === "pro" };
}
