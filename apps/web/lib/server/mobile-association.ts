import "server-only";
import { serverEnv } from "./env";

export function createAppleAppSiteAssociation(): object | null {
  const { APPLE_TEAM_ID, IOS_BUNDLE_IDENTIFIER } = serverEnv;
  if (!APPLE_TEAM_ID || !IOS_BUNDLE_IDENTIFIER) {
    return null;
  }

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${APPLE_TEAM_ID}.${IOS_BUNDLE_IDENTIFIER}`,
          paths: ["*"],
        },
      ],
    },
  };
}

export function createAndroidAssetLinks(): object[] | null {
  const { ANDROID_PACKAGE_NAME, ANDROID_SHA256_CERT_FINGERPRINTS } = serverEnv;
  if (!ANDROID_PACKAGE_NAME || !ANDROID_SHA256_CERT_FINGERPRINTS) {
    return null;
  }

  const fingerprints = ANDROID_SHA256_CERT_FINGERPRINTS.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (
    fingerprints.length === 0 ||
    fingerprints.some((fingerprint) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint))
  ) {
    throw new Error(
      "ANDROID_SHA256_CERT_FINGERPRINTS must contain comma-separated SHA-256 fingerprints.",
    );
  }

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function associationResponse(payload: object | object[] | null): Response {
  if (!payload) {
    return Response.json(
      { error: "Mobile association is not configured." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}
