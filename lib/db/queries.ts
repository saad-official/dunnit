import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { MembershipRole, Organization } from "@/lib/db/types";

/**
 * Read helpers for Server Components and Server Actions. Every query goes
 * through the per-request server client, so Row Level Security scopes rows to
 * the caller's organizations. Results are memoised per request with React
 * `cache`, so the layout and the page can both call them for one round trip.
 */

export type SessionUser = { id: string; email: string | null };

export type OrgContext = {
  user: SessionUser;
  org: Organization;
  role: MembershipRole;
};

/** The verified signed-in user for this request, or null. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  return getSessionUser();
});

/**
 * The signed-in user plus their organization (first membership by creation
 * date; v1 is one org per account). Null when signed out or when the user has
 * no membership.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations!inner(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load your organization: ${error.message}`);
  }
  if (!data) return null;

  return {
    user,
    org: data.organizations,
    role: data.role === "owner" ? "owner" : "member",
  };
});

/** The signed-in user's organization, or null. */
export async function getCurrentOrg(): Promise<Organization | null> {
  const ctx = await getOrgContext();
  return ctx?.org ?? null;
}

/**
 * The signed-in user's organization. Redirects to /sign-in when there is no
 * session; throws when the user exists but has no membership (the sign-up
 * trigger should always create one, so this means the database is out of
 * step with auth).
 */
export async function requireOrg(): Promise<Organization> {
  return (await requireOrgContext()).org;
}

/** Like requireOrg(), but also returns the user and their role. */
export async function requireOrgContext(): Promise<OrgContext> {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const ctx = await getOrgContext();
  if (!ctx) {
    throw new Error(
      `No organization membership for user ${user.id}. The on_auth_user_created trigger should have created one at sign-up; check that the migrations ran.`,
    );
  }
  return ctx;
}

/**
 * Drafts waiting in the approval queue: status 'draft' and not snoozed into
 * the future (touches.snoozed_until hides a draft until it passes).
 */
export const getQueueCount = cache(async (orgId: string): Promise<number> => {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { count, error } = await supabase
    .from("touches")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "draft")
    .or(`snoozed_until.is.null,snoozed_until.lte."${now}"`);

  if (error) {
    console.error("getQueueCount failed", error.message);
    return 0;
  }
  return count ?? 0;
});
