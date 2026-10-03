import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-grain flex min-h-svh flex-1 flex-col bg-paper lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between bg-ink p-12 text-paper lg:flex">
        <Link
          href="/"
          className="font-display text-3xl tracking-tight text-paper outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Dunnit
        </Link>
        <div className="max-w-md space-y-4">
          <p className="font-display text-4xl leading-tight">
            Invoices chased, politely, in your voice.
          </p>
          <p className="text-sm text-paper/70">
            Dunnit plans each reminder, drafts it for your approval and reads the
            replies, so you get paid without the awkward follow-up.
          </p>
        </div>
        <p className="text-xs text-paper/50">Accounts receivable for owner-operators.</p>
      </aside>

      <div className="flex flex-1 flex-col px-4 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight lg:invisible"
          >
            Dunnit
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
