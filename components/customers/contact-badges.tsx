import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const FLAG: Record<string, { label: string; className: string }> = {
  wrong_contact: { label: "Wrong contact", className: "border-amber/60 bg-accent text-amber-foreground dark:text-amber" },
  bounced: { label: "Bounced", className: "border-amber/60 bg-accent text-amber-foreground dark:text-amber" },
  unsubscribed: { label: "Unsubscribed", className: "border-transparent bg-muted text-muted-foreground" },
};

export const CONTACT_FLAG_OPTIONS = [
  { value: "none", label: "Contact OK" },
  { value: "wrong_contact", label: "Wrong contact" },
  { value: "bounced", label: "Bounced" },
  { value: "unsubscribed", label: "Unsubscribed" },
] as const;

/** Do-not-contact and contact_flag badges; renders nothing for a clean contact. */
export function ContactBadges({
  doNotContact,
  contactFlag,
  className,
}: {
  doNotContact: boolean;
  contactFlag: string;
  className?: string;
}) {
  const flag = FLAG[contactFlag];
  if (!doNotContact && !flag) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {doNotContact ? (
        <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
          Do not contact
        </Badge>
      ) : null}
      {flag ? (
        <Badge variant="outline" className={flag.className}>
          {flag.label}
        </Badge>
      ) : null}
    </span>
  );
}
