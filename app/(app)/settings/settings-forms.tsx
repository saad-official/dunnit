"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateAutonomy, updateBusiness, updateVoice } from "./actions";
import {
  COMMON_TIMEZONES,
  initialSettingsState,
  OTHER_TIMEZONE,
  type SettingsFormState,
} from "./form-state";

type SettingsAction = (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

/**
 * useActionState wired through onSubmit rather than the form's `action` prop:
 * React resets uncontrolled fields after an action submit, which would wipe
 * what the user typed when validation fails.
 */
function useSettingsForm(fn: SettingsAction) {
  const [state, dispatch, pending] = useActionState(fn, initialSettingsState);
  useResultToast(state);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending };
}

function useResultToast(state: SettingsFormState) {
  useEffect(() => {
    if (!state.at || !state.message) return;
    if (state.status === "success") toast.success(state.message);
    else if (state.status === "error") toast.error(state.message);
  }, [state.at, state.status, state.message]);
}

function SaveButton({ pending, children = "Save" }: { pending: boolean; children?: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Saving
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

export function BusinessForm({ name, timezone }: { name: string; timezone: string }) {
  const { state, onSubmit, pending } = useSettingsForm(updateBusiness);
  const known = COMMON_TIMEZONES.some((z) => z.value === timezone);
  const [choice, setChoice] = useState(known ? timezone : OTHER_TIMEZONE);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="name">Business name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name}
          maxLength={120}
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={selectClass}
          aria-invalid={errors.timezone && choice !== OTHER_TIMEZONE ? true : undefined}
          aria-describedby="timezone-hint"
        >
          {COMMON_TIMEZONES.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
              {z.value !== "UTC" ? ` · ${z.value}` : ""}
            </option>
          ))}
          <option value={OTHER_TIMEZONE}>Other (type an IANA name)</option>
        </select>
        {choice === OTHER_TIMEZONE ? (
          <Input
            id="timezoneCustom"
            name="timezoneCustom"
            aria-label="Timezone name"
            placeholder="e.g. America/Halifax"
            defaultValue={known ? "" : timezone}
            maxLength={64}
            required
            aria-invalid={errors.timezoneCustom ? true : undefined}
            aria-describedby={errors.timezoneCustom ? "timezoneCustom-error" : undefined}
          />
        ) : null}
        <FieldError id="timezoneCustom-error" message={errors.timezoneCustom ?? (choice !== OTHER_TIMEZONE ? errors.timezone : undefined)} />
        <Hint id="timezone-hint">
          Reminders go out on weekdays between 08:00 and 18:00 in this timezone. Weeks on the dashboard start on Monday here.
        </Hint>
      </div>

      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

export function VoiceForm({
  businessName,
  signature,
  toneNotes,
  orgName,
}: {
  businessName: string;
  signature: string;
  toneNotes: string;
  orgName: string;
}) {
  const { state, onSubmit, pending } = useSettingsForm(updateVoice);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="business_name">Name in emails</Label>
        <Input
          id="business_name"
          name="business_name"
          defaultValue={businessName}
          placeholder={orgName}
          maxLength={120}
          aria-invalid={errors.business_name ? true : undefined}
          aria-describedby={errors.business_name ? "business_name-error" : "business_name-hint"}
        />
        <FieldError id="business_name-error" message={errors.business_name} />
        <Hint id="business_name-hint">How your business should be named to customers. Leave empty to use “{orgName}”.</Hint>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="signature">Signature</Label>
        <Textarea
          id="signature"
          name="signature"
          defaultValue={signature}
          placeholder={`Thanks,\n${orgName}`}
          maxLength={500}
          rows={3}
          aria-invalid={errors.signature ? true : undefined}
          aria-describedby={errors.signature ? "signature-error" : "signature-hint"}
        />
        <FieldError id="signature-error" message={errors.signature} />
        <Hint id="signature-hint">Added to the end of every email, exactly as written.</Hint>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tone_notes">Tone notes</Label>
        <Textarea
          id="tone_notes"
          name="tone_notes"
          defaultValue={toneNotes}
          placeholder="Warm and brief. First names. We've worked with most clients for years."
          maxLength={500}
          rows={3}
          aria-invalid={errors.tone_notes ? true : undefined}
          aria-describedby={errors.tone_notes ? "tone_notes-error" : "tone_notes-hint"}
        />
        <FieldError id="tone_notes-error" message={errors.tone_notes} />
        <Hint id="tone_notes-hint">
          Guidance for the draft writer. Each step still has its own tone: friendly, firm, formal, final.
        </Hint>
      </div>

      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

export type AutonomyOption = {
  value: "manual" | "auto_step1" | "auto_all_low_risk";
  title: string;
  description: string;
  pro: boolean;
};

export function AutonomyForm({
  current,
  isPro,
  options,
}: {
  current: AutonomyOption["value"];
  isPro: boolean;
  options: AutonomyOption[];
}) {
  const { state, onSubmit, pending } = useSettingsForm(updateAutonomy);
  const error = state.fieldErrors?.autonomy;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <fieldset className="grid gap-3" aria-describedby={error ? "autonomy-error" : undefined}>
        <legend className="sr-only">How much Dunnit may send without asking</legend>
        {options.map((option) => {
          const disabled = option.pro && !isPro;
          const id = `autonomy-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex gap-3 rounded-lg border p-3 transition-colors has-checked:border-ring has-checked:bg-accent/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/60",
              )}
            >
              <input
                id={id}
                type="radio"
                name="autonomy"
                value={option.value}
                defaultChecked={current === option.value}
                disabled={disabled}
                className="mt-1 size-4 shrink-0 accent-(--ink) dark:accent-(--amber)"
                aria-describedby={`${id}-description`}
              />
              <span className="grid gap-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {option.title}
                  {option.pro ? (
                    <Badge variant={isPro ? "secondary" : "outline"} className="uppercase tracking-wide">
                      Pro
                    </Badge>
                  ) : null}
                </span>
                <span id={`${id}-description`} className="text-sm text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <FieldError id="autonomy-error" message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <SaveButton pending={pending} />
        {!isPro ? (
          <Link href="/billing" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Upgrade to Pro to unlock auto-send
          </Link>
        ) : null}
      </div>
    </form>
  );
}
