import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { formatDateTime } from "@/components/queue/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/db/queries";
import { optionalEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { MessageSheet, type OutboxMessage } from "./message-sheet";

export const metadata: Metadata = { title: "Outbox" };

const PROVIDER_LABELS: Record<string, string> = {
  outbox: "Stored (demo)",
  resend: "Sent via Resend",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Stored",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
};

function currentMode(): string {
  if (!optionalEnv("RESEND_API_KEY")) return "Right now nothing is sent: every email is stored here.";
  if (optionalEnv("EMAIL_DEMO_RECIPIENT")) return "Right now Resend is on in demo mode: emails go to the owner's inbox.";
  return "Right now Resend is on: emails go to your customers.";
}

export default async function OutboxPage() {
  const { org } = await requireOrgContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outbox")
    .select("id, to_email, subject, text, html, provider, status, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not load the outbox: ${error.message}`);
  const rows = data ?? [];
  const timezone = org.timezone || "UTC";

  return (
    <>
      <PageHeader
        title="Outbox"
        description="Every email Dunnit has sent for you, exactly as your customer received it."
      />

      <p className="-mt-2 mb-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Demo mode: no email leaves the app unless <code className="font-mono text-foreground">RESEND_API_KEY</code> is
        set, and with <code className="font-mono text-foreground">EMAIL_DEMO_RECIPIENT</code> also set every message
        goes to the owner&rsquo;s inbox instead of the customer. {currentMode()}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing sent yet"
          description="Approved drafts are delivered and kept here, so you can always check what went out and when."
          action={
            <Button asChild variant="outline">
              <Link href="/queue">Open the queue</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Email</TableHead>
                <TableHead className="hidden md:table-cell">Provider</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="w-0 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const providerLabel = PROVIDER_LABELS[row.provider] ?? row.provider;
                const createdLabel = formatDateTime(row.created_at, timezone);
                const message: OutboxMessage = {
                  id: row.id,
                  toEmail: row.to_email,
                  subject: row.subject,
                  text: row.text,
                  html: row.html,
                  createdLabel,
                  providerLabel,
                };
                return (
                  <TableRow key={row.id}>
                    <TableCell className="w-full max-w-0 py-3 pl-4 whitespace-normal">
                      <p className="truncate font-medium">{row.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.to_email}</p>
                      <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                        {STATUS_LABELS[row.status] ?? row.status} ·{" "}
                        <span className="tabular">{createdLabel}</span>
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge
                        variant={row.provider === "resend" ? "outline" : "secondary"}
                        className="h-6 px-2.5"
                      >
                        {providerLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span
                        className={cn(
                          "text-sm",
                          row.status === "failed" ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </TableCell>
                    <TableCell className="tabular hidden text-muted-foreground sm:table-cell">
                      {createdLabel}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <MessageSheet message={message} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
