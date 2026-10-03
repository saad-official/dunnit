import Link from "next/link";
import { cn } from "@/lib/utils";
import { focusRing } from "./site";

/** The amber square mark. Drawn in CSS, slightly rotated like a stamp. */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3 shrink-0 rotate-[-4deg] bg-amber", className)}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Dunnit, home"
      className={cn("inline-flex items-center gap-2.5", focusRing, className)}
    >
      <Mark />
      <span className="font-display text-[1.375rem] leading-none font-semibold tracking-tight">
        Dunnit
      </span>
    </Link>
  );
}
