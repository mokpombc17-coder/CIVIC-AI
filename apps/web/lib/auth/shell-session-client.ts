import { z } from "zod";
import { PLATFORM_AUTH_COOKIE_NAME } from "@/lib/server/auth/platform-auth-contract";
import type { ShellSession } from "./shell-access";

const accessTokenPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const currentUserResponseSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["PARTICIPANT", "ADMIN", "HIGHEST_ADMIN"]),
  permissions: z.array(z.enum(["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"])),
  account_state: z.enum(["ACTIVE", "INACTIVE", "DELETED"]),
  must_change_password: z.boolean(),
});

type FetchCurrentUserInput = Readonly<{
  baseUrl: URL;
  accessToken: string;
  request?: typeof fetch;
}>;

export class MainAuthUnavailableError extends Error {
  constructor() {
    super("Main/Auth current-user service is temporarily unavailable");
    this.name = "MainAuthUnavailableError";
  }
}

/** Reads the current identity from Main/Auth without parsing the JWT in Frontend. */
export async function fetchCurrentUser({
  baseUrl,
  accessToken,
  request = fetch,
}: FetchCurrentUserInput): Promise<ShellSession | null> {
  if (!accessTokenPattern.test(accessToken)) return null;

  try {
    const response = await request(new URL("/api/v1/auth/me", baseUrl), {
      cache: "no-store",
      headers: { cookie: `${PLATFORM_AUTH_COOKIE_NAME}=${accessToken}` },
      redirect: "manual",
    });
    if (response.status === 429 || response.status >= 500) {
      throw new MainAuthUnavailableError();
    }
    if (!response.ok) return null;

    const parsed = currentUserResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return {
      userId: parsed.data.user_id,
      role: parsed.data.role,
      permissions: parsed.data.permissions,
      accountState: parsed.data.account_state,
      mustChangePassword: parsed.data.must_change_password,
    };
  } catch (error) {
    if (error instanceof MainAuthUnavailableError) throw error;
    throw new MainAuthUnavailableError();
  }
}
