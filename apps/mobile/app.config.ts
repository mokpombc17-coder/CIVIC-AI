import type { ConfigContext, ExpoConfig } from "expo/config";

const appHost = process.env.EXPO_PUBLIC_APP_HOST ?? "app.example.com";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Next WebView Shell",
  slug: "next-webview-shell",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "nextwebview",
  newArchEnabled: true,
  plugins: [["expo-dev-client", { launchMode: "most-recent" }]],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.example.nextwebviewshell",
    associatedDomains: [`applinks:${appHost}`],
  },
  android: {
    package: "com.example.nextwebviewshell",
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
  },
});
