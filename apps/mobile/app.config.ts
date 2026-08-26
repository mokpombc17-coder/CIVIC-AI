import type { ConfigContext, ExpoConfig } from "expo/config";

const appName = process.env.APP_DISPLAY_NAME ?? "Next WebView Shell";
const appSlug = process.env.APP_SLUG ?? "next-webview-shell";
const appHost = optionalHost(process.env.EXPO_PUBLIC_APP_HOST);
const appScheme = normalizeScheme(process.env.EXPO_PUBLIC_APP_SCHEME);
const iosBundleIdentifier =
  process.env.IOS_BUNDLE_IDENTIFIER?.trim() || "com.example.nextwebviewshell";
const androidPackageName =
  process.env.ANDROID_PACKAGE_NAME?.trim() || "com.example.nextwebviewshell";
const easProjectId = process.env.EAS_PROJECT_ID?.trim();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: appSlug,
  version: "0.1.0",
  platforms: ["ios", "android"],
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: appScheme,
  plugins: [
    ["expo-dev-client", { launchMode: "most-recent" }],
    "expo-web-browser",
    "expo-sharing",
    "expo-notifications",
    "@preeternal/react-native-cookie-manager/app.plugin",
  ],
  extra: {
    ...config.extra,
    ...(easProjectId
      ? {
          eas: {
            ...(isRecord(config.extra?.eas) ? config.extra.eas : {}),
            projectId: easProjectId,
          },
        }
      : {}),
  },
  ios: {
    ...config.ios,
    supportsTablet: true,
    bundleIdentifier: iosBundleIdentifier,
    ...(appHost ? { associatedDomains: [`applinks:${appHost}`] } : {}),
  },
  android: {
    ...config.android,
    softwareKeyboardLayoutMode: "resize",
    package: androidPackageName,
    ...(appHost
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              category: ["BROWSABLE", "DEFAULT"],
              data: [
                {
                  scheme: "https",
                  host: appHost,
                  pathPrefix: "/",
                },
              ],
            },
          ],
        }
      : {}),
  },
});

function optionalHost(value: string | undefined): string | undefined {
  const host = value?.trim();
  if (!host) {
    return undefined;
  }

  if (host.includes("://") || host.includes("/") || host.includes(":")) {
    throw new Error("EXPO_PUBLIC_APP_HOST must be a hostname without protocol, port, or path.");
  }

  return host.toLowerCase();
}

function normalizeScheme(value: string | undefined): string {
  const scheme = value?.trim().toLowerCase() || "nextwebview";
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error("EXPO_PUBLIC_APP_SCHEME must be a valid URL scheme.");
  }

  return scheme;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
