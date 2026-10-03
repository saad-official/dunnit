import { cn } from "@/lib/utils";

/**
 * Wraps a rendered product mock in a <figure> with a caption, the way a
 * magazine captions a photograph. The caption names the data as synthetic.
 */
export function MockFrame({
  caption,
  children,
  className,
}: {
  caption: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      {children}
      <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

/** App-style panel: white card, hairline border, soft shadow from the token. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  meta,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <p className="font-display text-[0.9375rem] font-medium">{title}</p>
      {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

/**
 * Non-interactive stand-in for an app button. The mock is a picture of the
 * product, so its controls are text, not focusable buttons that do nothing.
 */
export function FauxButton({
  tone = "outline",
  children,
  kbd,
}: {
  tone?: "ink" | "outline" | "ghost";
  children: React.ReactNode;
  kbd?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium",
        tone === "ink" && "border-foreground bg-foreground text-background",
        tone === "outline" && "border-border bg-background text-foreground",
        tone === "ghost" && "border-transparent text-muted-foreground",
      )}
    >
      {children}
      {kbd ? (
        <kbd
          className={cn(
            "rounded border px-1 font-sans text-[0.6875rem] leading-4",
            tone === "ink" ? "border-background/30 text-background/80" : "border-border text-muted-foreground",
          )}
        >
          {kbd}
        </kbd>
      ) : null}
    </span>
  );
}

/** Visual-only switch in the "on" state, matching components/ui/switch. */
export function FauxSwitch() {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-[18.4px] w-8 shrink-0 items-center rounded-full bg-primary"
    >
      <span className="block size-4 translate-x-[calc(100%-2px)] rounded-full bg-background" />
    </span>
  );
}
