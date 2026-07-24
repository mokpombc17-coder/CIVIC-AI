import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      store: {
        ios: serverEnv.IOS_APP_STORE_URL ?? null,
        android: serverEnv.ANDROID_PLAY_STORE_URL ?? null,
      },
      oauth: {
        callbackUrl: `${serverEnv.MOBILE_APP_SCHEME}://auth/callback`,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
