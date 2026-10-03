import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const org = await requireOrg();

  return (
    <>
      <PageHeader title="Settings" description={`How Dunnit writes and sends for ${org.name}.`} />
      <EmptyState
        title="Nothing to configure yet"
        description="Your business voice (name, signature, tone notes), the timezone for send windows, and how much Dunnit may send without asking will live here."
      />
    </>
  );
}
