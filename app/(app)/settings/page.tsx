import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/db/queries";
import type { OrgVoiceJson } from "@/lib/db/types";
import {
  AUTO_LOW_RISK_MAX_STEP,
  AUTO_LOW_RISK_MIN_CONFIDENCE,
  AUTO_LOW_RISK_RISK_CEILING,
  AUTO_STEP1_MIN_CONFIDENCE,
} from "@/lib/domain/guardrails";
import { AutonomyForm, BusinessForm, VoiceForm, type AutonomyOption } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Mirrors decideAutonomy() in lib/domain/guardrails.ts and the ladder in spec 3.2. */
const AUTONOMY_OPTIONS: AutonomyOption[] = [
  {
    value: "manual",
    title: "Manual approval",
    description:
      "Every draft waits in your approval queue. Nothing is sent until you approve it.",
    pro: false,
  },
  {
    value: "auto_step1",
    title: "Auto-send friendly first reminders",
    description: `Step 1 (friendly, the day after the due date) sends on its own when the draft's confidence is at least ${pct(AUTO_STEP1_MIN_CONFIDENCE)}. Steps 2 to 4 (firm, formal, final notice) and check-ins always wait for you.`,
    pro: true,
  },
  {
    value: "auto_all_low_risk",
    title: "Auto-send for low-risk customers",
    description: `Everything above, plus steps 1 to ${AUTO_LOW_RISK_MAX_STEP} (friendly and firm) when confidence is at least ${pct(AUTO_LOW_RISK_MIN_CONFIDENCE)} and the customer's risk score is below ${AUTO_LOW_RISK_RISK_CEILING}. Formal and final notices always wait for you.`,
    pro: true,
  },
];

export default async function SettingsPage() {
  const { org } = await requireOrgContext();
  const voice = (org.voice && typeof org.voice === "object" && !Array.isArray(org.voice) ? org.voice : {}) as OrgVoiceJson;
  const isPro = org.plan === "pro";

  return (
    <>
      <PageHeader title="Settings" description={`How Dunnit writes and sends for ${org.name}.`} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Business</CardTitle>
            <CardDescription>Your organisation and the clock Dunnit sends by.</CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessForm name={org.name} timezone={org.timezone || "UTC"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Voice</CardTitle>
            <CardDescription>How your reminders sound. Every draft is written with these.</CardDescription>
          </CardHeader>
          <CardContent>
            <VoiceForm
              orgName={org.name}
              businessName={voice.business_name ?? ""}
              signature={voice.signature ?? ""}
              toneNotes={voice.tone_notes ?? ""}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Autonomy</CardTitle>
            <CardDescription>How much Dunnit may send without asking you first.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <AutonomyForm current={org.autonomy} isPro={isPro} options={AUTONOMY_OPTIONS} />
            <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Rules that apply at every setting</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>
                  A draft that fails a guardrail (missing invoice number or amount, a leftover placeholder, a banned
                  phrase, too long) drops to 0% confidence and always waits for approval.
                </li>
                <li>Customers marked do-not-contact are never emailed.</li>
                <li>
                  Emails go out on weekdays between 08:00 and 18:00 in your timezone, at most one per invoice every 5
                  days, and never for a paid invoice.
                </li>
                <li>Any reply pauses that invoice&apos;s reminders until it is handled.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="ring-destructive/25">
          <CardHeader>
            <CardTitle className="font-display text-lg">Danger zone</CardTitle>
            <CardDescription>
              Sign out of Dunnit on this device. Account deletion is coming in a later release.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                <LogOut aria-hidden />
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
