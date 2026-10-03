import { cn } from "@/lib/utils";
import { Mark } from "./wordmark";

/**
 * Small running-head label above a section heading, set like a magazine
 * department name: the brand square, then plain text. Not a shouty eyebrow.
 */
export function SectionLabel({
  children,
  className,
  invert = false,
}: {
  children: React.ReactNode;
  className?: string;
  invert?: boolean;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 text-sm font-medium",
        invert ? "text-background/80" : "text-muted-foreground",
        className,
      )}
    >
      <Mark className="size-2" />
      {children}
    </p>
  );
}
