import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./site";

const items: { q: string; a: React.ReactNode }[] = [
  {
    q: "Does it send without asking?",
    a: (
      <>
        <p>
          Not on the Free plan. Every message waits in your approval queue until you approve it, edit it, or reject
          it.
        </p>
        <p>
          On Pro you can let step-one reminders go out on their own when the draft&rsquo;s confidence is 0.80 or
          higher. Firmer steps still wait for you unless you change the autonomy setting yourself. A draft that fails
          a guardrail check drops to zero confidence and always waits.
        </p>
      </>
    ),
  },
  {
    q: "What does it never do?",
    a: (
      <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
        <li>Threaten, or make legal claims. Those phrases are blocked before a draft is saved.</li>
        <li>Contact a customer marked do-not-contact, or one who asked to unsubscribe.</li>
        <li>Send outside your send window: weekdays, 08:00 to 18:00 in your timezone.</li>
        <li>Touch the same invoice more than once in five days.</li>
        <li>Keep chasing once an invoice is paid, or while a reply is waiting to be handled.</li>
      </ul>
    ),
  },
  {
    q: "Where do replies come from in the demo?",
    a: (
      <p>
        From the Demo Inbox. Paste a reply yourself, or press &ldquo;Simulate reply&rdquo; and a model writes a
        plausible customer response, clearly labelled as simulated. Outgoing email lands in an in-app outbox by
        default, so nothing reaches a real customer while you try it.
      </p>
    ),
  },
  {
    q: "Which models does it use?",
    a: (
      <p>
        Groq-hosted gpt-oss writes the drafts and classifies replies. Gemini Flash-Lite is the fallback when Groq is
        unavailable. Every call is logged with the model, prompt version, token counts and latency.
      </p>
    ),
  },
  {
    q: "Is my data used for training?",
    a: (
      <p>
        Dunnit does not train models. The public demo uses synthetic data only, and the free Gemini tier is never
        given real customer data. Please don&rsquo;t enter real customer details into the demo.
      </p>
    ),
  },
];

/** Native disclosure list: works without JavaScript and with find-in-page. */
export function Faq({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <div className="border-t border-border">
      {items.map((item) => (
        <details key={item.q} className="group border-b border-border">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-start justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden",
              focusRing,
            )}
          >
            <Heading className="font-display text-lg leading-snug font-medium sm:text-xl">{item.q}</Heading>
            <Plus
              aria-hidden="true"
              className="mt-1 size-5 shrink-0 text-muted-foreground group-open:rotate-45 motion-safe:transition-transform"
            />
          </summary>
          <div className="max-w-2xl space-y-3 pb-6 text-[0.9375rem] leading-relaxed text-foreground/80">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
