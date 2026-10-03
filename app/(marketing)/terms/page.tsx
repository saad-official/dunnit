import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { links, textLink } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using the Dunnit demo: a portfolio project with test-mode billing and no warranty. Not legal advice.",
};

export default function TermsPage() {
  return (
    <LegalPage label="Terms" title="Terms of use" updated="October 3, 2026">
      <h2>What this is</h2>
      <p>
        Dunnit is a portfolio demo built in public. It is not a commercial service, and these terms are written to
        be honest rather than to be a contract a lawyer would draft.
      </p>

      <h2>Billing is pretend</h2>
      <p>
        Stripe runs in test mode. The Pro plan can be &ldquo;bought&rdquo; with Stripe&rsquo;s test cards, and no
        real payment is ever taken. Never enter a real card number.
      </p>

      <h2>Using it</h2>
      <ul>
        <li>Use synthetic customers and invoices. Do not enter real customer data in the public demo.</li>
        <li>Only send reminders to people who expect to hear from you about money they owe.</li>
        <li>
          The agent drafts; you decide. You are responsible for any message you approve or allow it to send.
        </li>
        <li>Don&rsquo;t use it to harass anyone, to attempt access to other accounts, or to overload the service.</li>
      </ul>

      <h2>Email</h2>
      <p>
        By default, outgoing messages land in an in-app outbox and are not delivered. If email delivery is turned on
        in the demo, messages go to your own inbox with a note naming the intended recipient.
      </p>

      <h2>No warranty</h2>
      <p>
        The demo is provided as it is. Data may be reset, accounts may be removed, and the service may stop at any
        time. Model output can be wrong, so read drafts before approving them.
      </p>

      <h2>Questions and changes</h2>
      <p>
        Ask by opening an issue on the{" "}
        <a href={links.issues} className={textLink}>
          GitHub repository
        </a>
        . Changes to these terms are made there in the open. How data is handled is described on the{" "}
        <Link href={links.privacy} className={textLink}>
          privacy page
        </Link>
        .
      </p>
    </LegalPage>
  );
}
