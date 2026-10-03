import type { Metadata } from "next";
import { Check, CircleCheck, Info } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/db/queries";
import { optionalEnv } from "@/lib/env";
import { isBillingConfigured } from "@/lib/stripe/billing";
import { cn } from "@/lib/utils";
import { ManageButton, UpgradeButton } from "./billing-buttons";

export const metadata: Metadata = { title: "Billing" };

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Up to 10 active invoices", "Manual approval of every message", "CSV import", "Demo data"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "per month",
    features: [
      "Unlimited invoices",
      "Auto-send for step-one reminders",
      "Stripe invoice sync",
      "Weekly digest",
    ],
  },
] as const;

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { org, role } = await requireOrgContext();
  const { checkout } = await searchParams;
  const isPro = org.plan === "pro";
  const configured = isBillingConfigured();
  const portalAvailable = Boolean(optionalEnv("STRIPE_SECRET_KEY") && org.stripe_customer_id);
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader title="Billing" description="Your plan and subscription." />

      {checkout === "success" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-moss/10 px-4 py-3 text-sm text-moss">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {isPro
            ? "Payment received. You're on Pro."
            : "Payment received. Your plan switches to Pro as soon as Stripe confirms it, usually within a few seconds. Refresh to check."}
        </p>
      ) : checkout === "cancelled" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Checkout cancelled. Nothing was charged.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => {
          const current = plan.id === org.plan;
          return (
            <Card key={plan.id} className={cn(current && "ring-2 ring-ring")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-xl">
                  {plan.name}
                  {current ? <Badge variant="secondary">Current plan</Badge> : null}
                </CardTitle>
                <CardDescription>
                  <span className="money font-display text-3xl text-foreground">{plan.price}</span>{" "}
                  <span>{plan.period}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-moss" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              {plan.id === "pro" ? (
                <CardFooter className="flex-col items-stretch gap-3">
                  {isPro ? (
                    <ManageButton disabled={!portalAvailable || !isOwner} />
                  ) : (
                    <UpgradeButton disabled={!configured || !isOwner} />
                  )}
                  {!isPro && org.stripe_customer_id ? (
                    <ManageButton disabled={!portalAvailable || !isOwner} />
                  ) : null}
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-2 text-sm text-muted-foreground">
        <p className="rounded-lg border border-dashed px-4 py-3">
          <span className="font-medium text-foreground">Test mode:</span> use card 4242 4242 4242 4242, any future
          date, any CVC. No real charge.
        </p>
        {!configured ? (
          <p>
            Billing is not set up on this deployment: STRIPE_SECRET_KEY and STRIPE_PRICE_PRO_MONTHLY are missing, so
            the buttons are disabled.
          </p>
        ) : null}
        {!isOwner ? <p>Only the account owner can change the plan.</p> : null}
        {isPro && !portalAvailable && configured ? (
          <p>Subscription management opens once Stripe has linked a customer to this account.</p>
        ) : null}
      </div>
    </>
  );
}
