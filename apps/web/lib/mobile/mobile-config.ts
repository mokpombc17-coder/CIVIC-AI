import type { NativeContext } from "@repo/bridge";

export type MobilePlatform = NativeContext["platform"];

export type RequiredMobileUpdate = {
  platform: MobilePlatform;
  currentBuildVersion: number;
  minimumBuildVersion: number;
  storeUrl: string;
};

export type MobileConfig = {
  store: Record<MobilePlatform, string | null>;
  update: Record<
    MobilePlatform,
    {
      minimumBuildVersion: number | null;
    }
  >;
  requiredUpdate: RequiredMobileUpdate | null;
  oauth: {
    callbackUrl: string;
  };
};

export function getRequiredMobileUpdate(
  nativeContext: Pick<NativeContext, "platform" | "buildVersion">,
  config: Pick<MobileConfig, "store" | "update">,
): RequiredMobileUpdate | null {
  const currentBuildVersion = parseBuildVersion(nativeContext.buildVersion);
  const minimumBuildVersion = config.update[nativeContext.platform].minimumBuildVersion;
  const storeUrl = config.store[nativeContext.platform];

  if (
    currentBuildVersion === null ||
    minimumBuildVersion === null ||
    !storeUrl ||
    currentBuildVersion >= minimumBuildVersion
  ) {
    return null;
  }

  return {
    platform: nativeContext.platform,
    currentBuildVersion,
    minimumBuildVersion,
    storeUrl,
  };
}

function parseBuildVersion(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
