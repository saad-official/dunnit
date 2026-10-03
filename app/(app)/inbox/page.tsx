import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DemoInbox } from "@/components/inbox/demo-inbox";
import { ReplyCard } from "@/components/inbox/reply-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireOrgContext } from "@/lib/db/queries";
import { countReplies, loadDemoInvoices, loadInboxReplies, type InboxTab } from "@/lib/services/inbox";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox" };

function parseTab(value: string | string[] | undefined): InboxTab {
  return value === "all" ? "all" : "attention";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org } = await requireOrgContext();
  const tab = parseTab((await searchParams).tab);
  const supabase = await createClient();
  const timezone = org.timezone || "UTC";

  const [replies, counts, demoInvoices] = await Promise.all([
    loadInboxReplies(supabase, org, tab),
    countReplies(supabase, org.id),
    loadDemoInvoices(supabase, org.id),
  ]);
  const { unhandled, total } = counts;
  const emptyDescription =
    "When a customer answers a reminder, Dunnit reads it, pauses the cadence and suggests what to do next. You can also paste a reply or simulate one to see how it's handled.";

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Customer replies, read and sorted by intent: paid, promise to pay, dispute, question and more."
      />

      <div className="space-y-8">
        <DemoInbox invoices={demoInvoices} />

        <Tabs value={tab}>
          <TabsList aria-label="Filter replies" className="w-full sm:w-fit">
            <TabsTrigger value="attention" asChild>
              <Link href="/inbox" scroll={false}>
                Needs attention
                {unhandled > 0 ? (
                  <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1.5 text-xs font-semibold text-amber-foreground">
                    {unhandled > 99 ? "99+" : unhandled}
                  </span>
                ) : null}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="all" asChild>
              <Link href="/inbox?tab=all" scroll={false}>
                All replies
              </Link>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-2">
            {replies.length === 0 ? (
              tab === "attention" && total > 0 ? (
                <EmptyState
                  title="You're all caught up"
                  description="Every reply has been handled. New ones land here first."
                  action={
                    <Link href="/inbox?tab=all" className="text-sm font-medium underline underline-offset-4">
                      See all replies
                    </Link>
                  }
                />
              ) : (
                <EmptyState title="No replies yet" description={emptyDescription} />
              )
            ) : (
              <ol className="space-y-4">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    <ReplyCard reply={reply} timezone={timezone} />
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
