import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeNextPath } from "../safe-next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const CALLBACK_ERRORS: Record<string, string> = {
  auth_callback: "That sign-in link is invalid or has expired. Sign in again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : undefined;
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const callbackError = errorKey ? CALLBACK_ERRORS[errorKey] : undefined;

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to see what Dunnit has drafted for you.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {callbackError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {callbackError}
          </p>
        ) : null}
        <SignInForm next={next} />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        New to Dunnit?&nbsp;
        <Link
          href="/sign-up"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
