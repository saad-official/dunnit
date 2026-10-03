import { ListSkeleton } from "@/components/invoices/list-skeleton";

export default function InvoicesLoading() {
  return <ListSkeleton label="Loading invoices" withTabs />;
}
