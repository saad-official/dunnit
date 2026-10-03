import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const org = await requireOrg();
  const pro = org.plan === "pro";

  return (
    <>
      <PageHeader title="Billing" description="Your plan and payment details." />
      {pro ? (
        <EmptyState
          title="You're on Pro"
          description="Unlimited invoices, auto-send for friendly first reminders, Stripe invoice sync and a weekly digest. Subscription management is on its way."
        />
      ) : (
        <EmptyState
          title="You're on the Free plan"
          description="Up to 10 active invoices, with every message approved by you. Pro ($29/month) adds unlimited invoices, confidence-based auto-send for first reminders, Stripe invoice sync and a weekly digest."
        />
      )}
    </>
  );
}
