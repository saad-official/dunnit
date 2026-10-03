/**
 * Shared constants and class strings for the marketing site.
 * Kept here so header, footer and pages link to the same places.
 */

export const links = {
  repo: "https://github.com/saad-official/dunnit",
  issues: "https://github.com/saad-official/dunnit/issues",
  series: "https://github.com/saad-official/vibe-build-series",
  signIn: "/sign-in",
  signUp: "/sign-up",
  howItWorks: "/#how-it-works",
  pricing: "/pricing",
  privacy: "/privacy",
  terms: "/terms",
} as const;

/** Page container: max-w-6xl with 16px gutters on mobile. */
export const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

/** High-contrast focus ring (ink, not the 50% amber default) for links and summaries. */
export const focusRing =
  "rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground";

/** Inline text link: ink, underlined on hover, visible focus. */
export const textLink =
  "rounded-sm underline decoration-border decoration-1 underline-offset-4 hover:decoration-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground";
