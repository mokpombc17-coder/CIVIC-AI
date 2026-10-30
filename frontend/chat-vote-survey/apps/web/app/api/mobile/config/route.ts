import { parseNativeShellUserAgent } from "@repo/bridge";
import { serverEnv } from "@/lib/server/env";
import { getRequiredMobileUpdate, type MobileConfig } from "@/lib/mobile/mobile-config";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const baseConfig = {
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
  } satisfies Omit<MobileConfig, "requiredUpdate">;

  const nativeIdentity = parseNativeShellUserAgent(request.headers.get("user-agent"));
  const config = {
    ...baseConfig,
    requiredUpdate: nativeIdentity ? getRequiredMobileUpdate(nativeIdentity, baseConfig) : null,
  } satisfies MobileConfig;

  return Response.json(config, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
