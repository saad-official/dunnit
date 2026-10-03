import type { Metadata } from "next";
import { Faq } from "@/components/marketing/faq";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { SectionLabel } from "@/components/marketing/section-label";
import { container } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free for up to 10 active invoices with manual approval. Pro is $29/month for unlimited invoices, auto-sent step-one reminders, Stripe sync and a weekly digest. Stripe runs in test mode.",
};

const rows: { feature: string; free: string | null; pro: string | null }[] = [
  { feature: "Active invoices", free: "10", pro: "Unlimited" },
  { feature: "Approval", free: "Every message", pro: "Every message, or auto-send step one" },
  { feature: "Import", free: "CSV, manual, demo data", pro: "CSV, manual, demo data, Stripe sync" },
  { feature: "Reply reading", free: "Included", pro: "Included" },
  { feature: "Audit trail", free: "Included", pro: "Included" },
  { feature: "Weekly digest email", free: null, pro: "Included" },
  { feature: "Price", free: "$0", pro: "$29/month, test mode" },
];

function Cell({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <>{value}</>;
}

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className={cn(container, "pt-14 pb-20 sm:pt-20 sm:pb-24")}>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Pricing</SectionLabel>
            <h1 id="pricing-title" className="mt-4 text-4xl leading-[1.08] font-medium text-balance sm:text-5xl">
              Priced for a small book of invoices.
            </h1>
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed text-foreground/80">
              Two plans. Start on Free with demo data, and move to Pro when you want the easy reminders sent for you.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <PricingPlans headingLevel="h2" />
          </div>
        </div>
      </section>

      <section aria-labelledby="compare-title" className="border-y border-border bg-card">
        <div className={cn(container, "grid gap-10 py-20 sm:py-24 lg:grid-cols-12")}>
          <div className="lg:col-span-4">
            <h2 id="compare-title" className="text-3xl leading-tight font-medium sm:text-4xl">
              Side by side
            </h2>
          </div>
          <div className="min-w-0 overflow-x-auto lg:col-span-8">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <caption className="sr-only">Free and Pro plans compared</caption>
              <thead>
                <tr className="border-b border-foreground/20">
                  <th scope="col" className="w-[38%] py-3 pr-4 font-medium text-muted-foreground">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="py-3 pr-4 font-display text-lg font-medium">
                    Free
                  </th>
                  <th scope="col" className="py-3 font-display text-lg font-medium">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature} className="border-b border-border align-top">
                    <th scope="row" className="py-3 pr-4 font-normal text-muted-foreground">
                      {r.feature}
                    </th>
                    <td className="tabular py-3 pr-4">
                      <Cell value={r.free} />
                    </td>
                    <td className="tabular py-3">
                      <Cell value={r.pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className={cn(container, "py-20 sm:py-24")}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 id="faq-title" className="text-3xl leading-tight font-medium sm:text-4xl">
              Questions
            </h2>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <Faq />
          </div>
        </div>
      </section>
    </>
  );
}
