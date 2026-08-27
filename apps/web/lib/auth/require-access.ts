import "server-only";

import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideShellAccess, type CurrentUser } from "./shell-access";
import { fetchCurrentUser, MainAuthUnavailableError } from "./current-user-client";
import { serverEnv } from "@/lib/server/env";
import { PLATFORM_AUTH_COOKIE_NAME } from "@/lib/server/auth/platform-auth-contract";

export async function hasAccessCredential(): Promise<boolean> {
  return Boolean((await cookies()).get(PLATFORM_AUTH_COOKIE_NAME)?.value);
}

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const cookieValue = (await cookies()).get(PLATFORM_AUTH_COOKIE_NAME)?.value;
  if (!cookieValue || !serverEnv.MAIN_AUTH_INTERNAL_URL) return null;

  try {
    return await fetchCurrentUser({
      baseUrl: new URL(serverEnv.MAIN_AUTH_INTERNAL_URL),
      accessToken: cookieValue,
    });
  } catch (error) {
    if (error instanceof MainAuthUnavailableError) redirect("/service-unavailable");
    throw error;
  }
}

export async function requireParticipantAccess(returnTo: string): Promise<CurrentUser> {
  const currentUser = await loadCurrentUser();
  const decision = decideShellAccess("PARTICIPANT", currentUser, returnTo);

  if (decision === "REDIRECT_LOGIN") {
    redirect(`/auth/refresh?returnTo=${encodeURIComponent(returnTo)}` as Route);
  }
  if (decision === "FORBIDDEN") redirect("/forbidden");

  return currentUser as CurrentUser;
}
