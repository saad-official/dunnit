import { cn } from "@/lib/utils";
import { CtaLink } from "./cta-link";
import { links } from "./site";

type Plan = {
  name: string;
  price: string;
  per?: string;
  summary: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    summary: "For a handful of overdue invoices and a careful first look.",
    features: [
      "Up to 10 active invoices",
      "Manual approval of every message",
      "CSV import",
      "Demo data to try it on",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$29",
    per: "/month",
    summary: "For when the approval queue is the slowest part of your week.",
    features: [
      "Unlimited invoices",
      "Auto-send step-one reminders at 0.80 confidence or higher",
      "Stripe invoice sync",
      "Weekly digest email",
    ],
    cta: "Start with Pro",
    featured: true,
  },
];

/**
 * Two plans side by side. Pro is set on white with an ink rule; Free sits on
 * the paper. The headingLevel prop keeps the outline correct on each page.
 */
export function PricingPlans({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <div>
      <ul className="grid gap-4 md:grid-cols-2 md:gap-0">
        {plans.map((plan) => (
          <li
            key={plan.name}
            className={cn(
              "flex flex-col rounded-xl border p-6 sm:p-8",
              plan.featured
                ? "border-foreground bg-card shadow-card md:-my-3 md:py-11"
                : "border-border md:rounded-r-none md:border-r-0",
            )}
          >
            <div className="flex items-baseline justify-between gap-4">
              <Heading className="font-display text-2xl font-medium">{plan.name}</Heading>
              {plan.featured ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden="true" className="size-2 bg-amber" />
                  Test mode
                </span>
              ) : null}
            </div>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="money font-display text-6xl leading-none font-medium">{plan.price}</span>
              {plan.per ? <span className="text-sm text-muted-foreground">{plan.per}</span> : null}
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{plan.summary}</p>
            <ul className="mt-6 space-y-2.5 border-t border-border pt-6 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="grid grid-cols-[0.875rem_1fr] items-baseline gap-2.5">
                  <span aria-hidden="true" className="h-px w-3 translate-y-[-0.2em] bg-foreground/50" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-2 md:mt-auto md:pt-8">
              <CtaLink
                href={links.signUp}
                tone={plan.featured ? "amber" : "outline"}
                className="w-full sm:w-auto"
              >
                {plan.cta}
              </CtaLink>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">
        Test mode. Checkout runs on Stripe&rsquo;s sandbox; no card is charged.
      </p>
    </div>
  );
}
