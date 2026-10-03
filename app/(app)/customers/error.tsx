"use client";

import { RouteError } from "@/components/invoices/route-error";

export default function CustomersError({
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
      title="Customers didn't load"
      backHref="/dashboard"
      backLabel="Go to dashboard"
    />
  );
}
