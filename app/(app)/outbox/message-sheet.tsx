"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type OutboxMessage = {
  id: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string | null;
  createdLabel: string;
  providerLabel: string;
};

/**
 * Shows one stored email. The HTML version renders in a fully sandboxed
 * iframe (no scripts, no same-origin access, no forms), exactly as stored.
 */
export function MessageSheet({ message }: { message: OutboxMessage }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`View email "${message.subject}" to ${message.toEmail}`}>
          View
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="font-display text-lg leading-snug">{message.subject}</SheetTitle>
          <SheetDescription>
            To {message.toEmail} · <span className="tabular">{message.createdLabel}</span> · {message.providerLabel}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={message.html ? "html" : "text"} className="min-h-0 flex-1 p-4">
          <TabsList>
            <TabsTrigger value="html" disabled={!message.html}>
              Formatted
            </TabsTrigger>
            <TabsTrigger value="text">Plain text</TabsTrigger>
          </TabsList>
          {message.html ? (
            <TabsContent value="html" className="min-h-0">
              <iframe
                title={`Formatted email: ${message.subject}`}
                srcDoc={message.html}
                sandbox=""
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-[65svh] w-full rounded-lg border border-border bg-white"
              />
            </TabsContent>
          ) : null}
          <TabsContent value="text" className="min-h-0 overflow-y-auto">
            <pre className="rounded-lg border border-border bg-background p-3.5 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.text}
            </pre>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
