import type { Metadata } from "next";
import { CtaLink } from "@/components/marketing/cta-link";
import { Faq } from "@/components/marketing/faq";
import { ApprovalQueueMock } from "@/components/marketing/mocks/approval-queue-mock";
import { AutonomyMock } from "@/components/marketing/mocks/autonomy-mock";
import { CadenceMock } from "@/components/marketing/mocks/cadence-mock";
import { DashboardTilesMock } from "@/components/marketing/mocks/dashboard-tiles-mock";
import { ImportMock } from "@/components/marketing/mocks/import-mock";
import { ReplyMock } from "@/components/marketing/mocks/reply-mock";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { SectionLabel } from "@/components/marketing/section-label";
import { container, links } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Dunnit · Invoices chased, politely." },
  description:
    "An accounts-receivable agent for small businesses. Dunnit plans the reminders, writes them in your voice, waits for your OK, and reads the replies.",
};

const stats = [
  {
    figure: "59%",
    text: "of small businesses carry invoices 30+ days overdue.",
    source: "QuickBooks Late Payments Report, 2026",
  },
  {
    figure: "$17.7K",
    text: "owed to them on average.",
    source: "QuickBooks Late Payments Report, 2026",
  },
  {
    figure: "29%",
    text: "of owners delayed paying themselves because a customer paid late.",
    source: "Bluevine survey, Feb 2026",
  },
];

const steps = [
  {
    title: "Import invoices",
    body: "Upload a CSV, add invoices by hand, or sync open invoices from Stripe on Pro.",
    visual: <ImportMock />,
  },
  {
    title: "Cadence planned",
    body: "Each invoice gets four steps, friendly to firm to formal to final, timed from its due date and adjusted for the customer’s history.",
    visual: <CadenceMock />,
  },
  {
    title: "You approve, or trust it on step one",
    body: "Every draft waits in your queue with its reasoning. On Pro, step-one reminders can go out on their own when the agent is confident.",
    visual: <AutonomyMock />,
  },
  {
    title: "Replies read",
    body: "When a customer writes back, Dunnit labels the reply and changes the schedule to match, so a promise pauses the chase.",
    visual: <ReplyMock />,
  },
];

export default function HomePage() {
  return (
    <>
      {/* a. Hero */}
      <section aria-labelledby="hero-title" className={cn(container, "pt-14 pb-20 sm:pt-20 lg:pt-24 lg:pb-28")}>
        <div className="grid items-start gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6 lg:pt-6">
            <SectionLabel>Accounts receivable, for owner-operators</SectionLabel>
            <h1
              id="hero-title"
              className="mt-6 text-[2.625rem] leading-[1.02] font-medium text-balance sm:text-6xl lg:text-[4.5rem]"
            >
              Invoices chased,{" "}
              <span className="underline decoration-amber decoration-[0.09em] underline-offset-[0.14em]">
                politely.
              </span>
            </h1>
            <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-foreground/80">
              Dunnit plans a reminder schedule for every overdue invoice, writes each message in your voice, and
              waits for your OK before anything goes out. When the customer replies, it reads the reply, so a promise
              to pay or a dispute changes what happens next.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <CtaLink href={links.signUp}>Start free</CtaLink>
              <CtaLink href="#how-it-works" tone="outline">
                See how it works
              </CtaLink>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">Free for up to 10 active invoices. No card needed.</p>
          </div>
          <div className="lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8">
            <ApprovalQueueMock />
          </div>
        </div>
      </section>

      {/* b. Problem strip */}
      <section aria-labelledby="problem-title" className="bg-foreground text-background">
        <div className={cn(container, "py-14 sm:py-16")}>
          <h2 id="problem-title" className="font-sans text-sm font-medium text-background/75">
            Late payment, in three numbers
          </h2>
          <ul className="mt-8 grid divide-y divide-background/15 md:grid-cols-3 md:divide-x md:divide-y-0">
            {stats.map((s, i) => (
              <li key={s.figure} className={cn("py-7 md:py-0", i === 0 ? "md:pr-8" : "md:px-8", i === 0 && "pt-0")}>
                <p className="money font-display text-6xl leading-none font-medium sm:text-7xl">{s.figure}</p>
                <p className="mt-4 max-w-[18rem] text-[0.9375rem] leading-snug">{s.text}</p>
                <p className="mt-3 text-xs text-background/70">
                  Source: <cite className="not-italic">{s.source}</cite>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* c. How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="paper-grain scroll-mt-4 border-b border-border">
        <div className={cn(container, "py-20 sm:py-28")}>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <SectionLabel>How it works</SectionLabel>
              <h2 id="how-title" className="mt-4 text-4xl leading-[1.08] font-medium text-balance sm:text-5xl">
                Four steps. You decide how many need you.
              </h2>
            </div>
            <p className="max-w-md text-[0.9375rem] leading-relaxed text-foreground/80 lg:col-span-5 lg:col-start-8 lg:self-end">
              The schedule is plain rules you can read. The model only writes the words and reads the replies, and
              both are logged.
            </p>
          </div>

          <ol className="mt-14 border-t border-foreground/15">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="grid gap-6 border-b border-foreground/15 py-10 md:grid-cols-12 md:gap-8 md:py-12"
              >
                <p aria-hidden="true" className="money font-display text-5xl leading-none text-foreground/30 md:col-span-1">
                  {i + 1}
                </p>
                <div className="md:col-span-4">
                  <h3 className="text-2xl leading-snug font-medium">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-foreground/80">{step.body}</p>
                </div>
                <div className="min-w-0 md:col-span-6 md:col-start-7 lg:col-span-5 lg:col-start-8">{step.visual}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* d. Outcomes */}
      <section aria-labelledby="outcomes-title" className={cn(container, "py-20 sm:py-28")}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Outcomes</SectionLabel>
            <h2 id="outcomes-title" className="mt-4 text-4xl leading-[1.08] font-medium sm:text-5xl">
              Reported in dollars and days.
            </h2>
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-foreground/80">
              The dashboard counts money that arrived after a reminder went out, how often promises were kept, and
              how long invoices take to clear. Not tokens, and not emails sent.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8 lg:pt-14">
            <DashboardTilesMock />
          </div>
        </div>
      </section>

      {/* e. Trust */}
      <section aria-labelledby="trust-title" className="border-y border-border bg-card">
        <div className={cn(container, "grid gap-10 py-20 sm:py-28 lg:grid-cols-12")}>
          <div className="lg:col-span-5">
            <SectionLabel>Trust</SectionLabel>
            <h2 id="trust-title" className="mt-4 text-4xl leading-[1.08] font-medium text-balance sm:text-5xl">
              Everything it does is written down.
            </h2>
          </div>
          <div className="space-y-10 lg:col-span-6 lg:col-start-7">
            <div>
              <h3 className="text-xl font-medium">An audit trail you can read</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-foreground/80">
                Every model call and every human decision is logged to an append-only record: which model, which
                prompt version, what went in, what came out, who approved it and when. Nothing in it is edited after
                the fact.
              </p>
            </div>
            <div className="border-t border-border pt-10">
              <h3 className="text-xl font-medium">Guardrails before anything is saved</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed text-foreground/80 marker:text-muted-foreground">
                <li>Never threatens, and never makes legal claims.</li>
                <li>Never contacts a customer marked do-not-contact.</li>
                <li>Sends only inside your window, weekdays 08:00 to 18:00, and no more than once in five days.</li>
                <li>Every draft must name the invoice number and amount, with no placeholders left in.</li>
              </ul>
            </div>
            <div className="border-t border-border pt-10">
              <h3 className="text-xl font-medium">Your voice, not a template</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-foreground/80">
                Set your business name, your signature and a few notes on tone, such as &ldquo;first names,
                short sentences, no legalese&rdquo;. Drafts follow them, and you can edit any draft before it
                goes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* f. Pricing */}
      <section id="pricing" aria-labelledby="pricing-title" className={cn(container, "scroll-mt-4 py-20 sm:py-28")}>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Pricing</SectionLabel>
            <h2 id="pricing-title" className="mt-4 text-4xl leading-[1.08] font-medium sm:text-5xl">
              Two plans. One of them is free.
            </h2>
            <p className="mt-5 max-w-xs text-[0.9375rem] leading-relaxed text-foreground/80">
              Start on Free with demo data. Move to Pro when you want it sending the easy ones for you.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <PricingPlans />
          </div>
        </div>
      </section>

      {/* g. FAQ */}
      <section aria-labelledby="faq-title" className={cn(container, "pb-20 sm:pb-28")}>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Questions</SectionLabel>
            <h2 id="faq-title" className="mt-4 text-4xl leading-[1.08] font-medium sm:text-5xl">
              Answered plainly.
            </h2>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <Faq />
          </div>
        </div>
      </section>

      {/* h. Final CTA */}
      <section aria-labelledby="cta-title" className="bg-sand">
        <div className={cn(container, "grid gap-8 py-16 sm:py-20 md:grid-cols-12 md:items-end")}>
          <h2 id="cta-title" className="text-4xl leading-[1.08] font-medium text-balance sm:text-5xl md:col-span-7">
            Get paid without writing the awkward email.
          </h2>
          <div className="md:col-span-5 md:justify-self-end">
            <div className="flex flex-wrap gap-3">
              <CtaLink href={links.signUp}>Start free</CtaLink>
              <CtaLink href={links.pricing} tone="outline">
                See pricing
              </CtaLink>
            </div>
            <p className="mt-4 text-sm text-foreground/75">Load the demo data and approve a first draft. No card needed.</p>
          </div>
        </div>
      </section>
    </>
  );
}
