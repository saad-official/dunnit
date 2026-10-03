"use client";

import { RouteError } from "@/components/invoices/route-error";

export default function InvoicesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="Invoices didn't load"
      backHref="/dashboard"
      backLabel="Go to dashboard"
    />
  );
}
