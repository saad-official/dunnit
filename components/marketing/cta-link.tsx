import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CtaLinkProps = ComponentProps<typeof Link> & {
  tone?: "amber" | "ink" | "outline";
  size?: "md" | "lg";
};

/**
 * A link styled as a call to action. Navigation stays a link (not a button),
 * so it works without JavaScript and announces correctly.
 */
export function CtaLink({ tone = "amber", size = "lg", className, ...props }: CtaLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-medium whitespace-nowrap outline-none select-none",
        "motion-safe:transition-colors",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
        size === "lg" ? "h-11 px-5 text-[0.9375rem]" : "h-9 px-3.5 text-sm",
        tone === "amber" &&
          "border-amber bg-amber text-amber-foreground hover:border-[color-mix(in_oklch,var(--amber),var(--ink)_12%)] hover:bg-[color-mix(in_oklch,var(--amber),var(--ink)_12%)]",
        tone === "ink" && "border-foreground bg-foreground text-background hover:bg-foreground/85",
        tone === "outline" && "border-foreground/25 bg-transparent text-foreground hover:border-foreground hover:bg-card",
        className,
      )}
      {...props}
    />
  );
}
