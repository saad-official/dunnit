import type Stripe from "stripe";
import { optionalEnv } from "@/lib/env";
import { syncSubscriptionToOrg } from "@/lib/stripe/billing";
import { stripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Stripe webhook (spec 3.8). Endpoint: /api/webhooks/stripe.
 * Needs STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SECRET_KEY. Subscribe to: checkout.session.completed,
 * customer.subscription.created, customer.subscription.updated,
 * customer.subscription.deleted.
 *
 * Handling is idempotent (it re-reads the subscription state and overwrites
 * the org's plan), so Stripe retries and duplicate deliveries are harmless.
 * Events for unknown orgs are acknowledged and ignored. Unexpected failures
 * return 500 so Stripe retries later.
 */

async function handleEvent(event: Stripe.Event): Promise<string> {
  const service = createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return "not a subscription checkout";
      const subscription =
        typeof session.subscription === "string"
          ? await stripe().subscriptions.retrieve(session.subscription)
          : session.subscription;
      const result = await syncSubscriptionToOrg(service, subscription, {
        orgIdHint: session.client_reference_id ?? session.metadata?.org_id ?? null,
      });
      return result.kind === "synced" ? `org ${result.orgId} → ${result.plan}` : `ignored: ${result.reason}`;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const result = await syncSubscriptionToOrg(service, event.data.object);
      return result.kind === "synced" ? `org ${result.orgId} → ${result.plan}` : `ignored: ${result.reason}`;
    }
    default:
      return "unhandled event type";
  }
}

export async function POST(request: Request) {
  const secret = optionalEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret || !optionalEnv("STRIPE_SECRET_KEY")) {
    console.error("[stripe] webhook received but STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not set");
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.info("[stripe] signature verification failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await handleEvent(event);
    console.info(`[stripe] ${event.type} ${event.id}: ${outcome}`);
    return Response.json({ received: true });
  } catch (error) {
    console.error(`[stripe] ${event.type} ${event.id} failed`, error instanceof Error ? error.message : error);
    return Response.json({ error: "handler failed" }, { status: 500 });
  }
}
