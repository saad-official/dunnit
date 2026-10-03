"use client";

import { useEffect } from "react";

const KEYS = new Set(["j", "k", "a", "e", "r"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Queue shortcuts: J/K move between cards, A approves, E edits, R rejects the
 * selected card. Works on the DOM rendered by QueueCard (data-queue-card and
 * data-shortcut attributes), so cards keep their own state and pending UI.
 * A card is "selected" when focus is on it or inside it; A/E/R do nothing
 * until one is, so a stray key press never sends an email.
 */
export function QueueKeyboard() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!KEYS.has(key)) return;
      // Leave menus and dialogs alone.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"]')) return;

      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-queue-card]"));
      if (cards.length === 0) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const current = active?.closest<HTMLElement>("[data-queue-card]") ?? null;
      const index = current ? cards.indexOf(current) : -1;

      if (key === "j" || key === "k") {
        event.preventDefault();
        const next =
          index === -1 ? 0 : key === "j" ? Math.min(index + 1, cards.length - 1) : Math.max(index - 1, 0);
        const card = cards[next];
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: "nearest" });
        return;
      }

      if (!current) return;
      const button = current.querySelector<HTMLButtonElement>(`[data-shortcut="${key}"]`);
      if (button && !button.disabled) {
        event.preventDefault();
        button.click();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <p className="hidden text-xs text-muted-foreground md:block">
      Shortcuts: <kbd className="font-sans font-medium text-foreground">J</kbd>/
      <kbd className="font-sans font-medium text-foreground">K</kbd> move ·{" "}
      <kbd className="font-sans font-medium text-foreground">A</kbd> approve ·{" "}
      <kbd className="font-sans font-medium text-foreground">E</kbd> edit ·{" "}
      <kbd className="font-sans font-medium text-foreground">R</kbd> reject
    </p>
  );
}
