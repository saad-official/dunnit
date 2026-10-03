import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { links, textLink } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What the Dunnit demo stores, which services see it, and how to have it deleted. A portfolio demo, not legal advice.",
};

export default function PrivacyPage() {
  return (
    <LegalPage label="Privacy" title="Privacy" updated="October 3, 2026">
      <h2>The short version</h2>
      <p>
        Dunnit is a portfolio project. It stores what it needs to run your account and nothing else. It does not sell
        data, show ads, or use advertising trackers. Please use synthetic data in the public demo.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>
          <strong>Your account email</strong>, used to sign you in.
        </li>
        <li>
          <strong>The invoices and customers you enter</strong> or import: names, email addresses, amounts and dates.
        </li>
        <li>
          <strong>Messages and replies</strong>: drafted and sent reminders, and replies you paste in or receive.
        </li>
        <li>
          <strong>An activity log</strong> of model calls and your approvals, used for the audit trail. It records
          the model, prompt version, inputs and outputs.
        </li>
      </ul>
      <p>
        No card details are stored. Billing runs through Stripe in test mode, and no real card is charged.
      </p>

      <h2>Who else sees it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts the database and handles sign-in.
        </li>
        <li>
          <strong>Vercel</strong> hosts the site and collects aggregate page analytics.
        </li>
        <li>
          <strong>Stripe</strong>, in test mode, handles the Pro checkout.
        </li>
        <li>
          <strong>Groq</strong> receives invoice context to write drafts and classify replies.
        </li>
        <li>
          <strong>Google AI</strong> (Gemini Flash-Lite) is a fallback when Groq is unavailable. It runs on the free
          tier, whose terms allow Google to use inputs to improve its products. That is why the demo is meant for
          synthetic data only.
        </li>
      </ul>
      <p>Your data is not sold or shared with anyone else.</p>

      <h2>Deleting your data</h2>
      <p>
        Delete your account and its data from the account settings page, or ask by opening an issue on the{" "}
        <a href={links.issues} className={textLink}>
          GitHub repository
        </a>
        . Please don&rsquo;t put personal details in the issue itself; the account email is enough.
      </p>

      <h2>Changes</h2>
      <p>
        Changes to this page are made in the open, in the project&rsquo;s repository. See also the{" "}
        <Link href={links.terms} className={textLink}>
          terms
        </Link>
        .
      </p>
    </LegalPage>
  );
}
