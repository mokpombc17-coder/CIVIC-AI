import { serverEnv } from "@/lib/server/env";
import type { MobileConfig } from "@/lib/mobile/mobile-config";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const config = {
    store: {
      ios: serverEnv.IOS_APP_STORE_URL ?? null,
      android: serverEnv.ANDROID_PLAY_STORE_URL ?? null,
    },
    update: {
      ios: {
        minimumBuildVersion: serverEnv.IOS_MINIMUM_BUILD_VERSION ?? null,
      },
      android: {
        minimumBuildVersion: serverEnv.ANDROID_MINIMUM_BUILD_VERSION ?? null,
      },
    },
    oauth: {
      callbackUrl: `${serverEnv.MOBILE_APP_SCHEME}://auth/callback`,
    },
  } satisfies MobileConfig;

  return Response.json(config, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
