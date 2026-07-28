import {
  BRIDGE_VERSION,
  NATIVE_TO_WEB_EVENT,
  createBridgeId,
  createNativeShellUserAgent,
  parseWebToNativeMessage,
  serializeBridgeMessage,
  type KnownNativeCapability,
  type NativeContext,
  type NativeToWebMessage,
  type WebToNativeMessage,
} from "@repo/bridge";
import * as Application from "expo-application";
import { useNetworkState } from "expo-network";
import {
  type ElementRef,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { startNativeAuth } from "../auth/native-auth";
import {
  DOWNLOADS_ENABLED,
  OAUTH_ENABLED,
  PUSH_ENABLED,
  WEB_APP_ORIGIN,
  WEB_APP_URL,
} from "../config/runtime";
import { downloadAndShareFile } from "../downloads/native-download";
import {
  configureForegroundNotifications,
  registerForPushNotifications,
  subscribeNotificationLinks,
} from "../notifications/native-notifications";
import { normalizeDeepLink } from "./deep-link";
import { isMainDocumentHttpError } from "./load-policy";
import {
  getNetworkAvailability,
  shouldAutoRetryAfterNetworkRecovery,
  type NetworkAvailability,
} from "./network-state";
import { initialWebViewLoadState, reduceWebViewLoadState, type LoadFailure } from "./load-state";

type WebViewHandle = ElementRef<typeof WebView>;

export function WebAppView() {
  const webViewRef = useRef<WebViewHandle>(null);
  const pendingDeepLinkRef = useRef<string | null>(null);
  const webReadyRef = useRef(false);
  const currentDocumentUrlRef = useRef(WEB_APP_URL);
  const previousNetworkAvailabilityRef = useRef<NetworkAvailability>("unknown");
  const [webViewKey, setWebViewKey] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadState, dispatchLoad] = useReducer(reduceWebViewLoadState, initialWebViewLoadState);
  const networkState = useNetworkState();
  const networkAvailability = getNetworkAvailability(networkState);
  const isOffline = networkAvailability === "offline";
  const loading = loadState.status === "loading";
  const failure = loadState.status === "failed" ? loadState.failure : null;

  const nativeContext = useMemo<NativeContext>(() => {
    const capabilities: KnownNativeCapability[] = ["share", "deep-link", "app-state"];
    if (OAUTH_ENABLED) {
      capabilities.push("oauth");
    }
    if (DOWNLOADS_ENABLED) {
      capabilities.push("download");
    }
    if (PUSH_ENABLED) {
      capabilities.push("push");
    }

    return {
      platform: Platform.OS === "ios" ? "ios" : "android",
      appVersion: Application.nativeApplicationVersion ?? "development",
      buildVersion: Application.nativeBuildVersion ?? "development",
      capabilities,
    };
  }, []);
  const nativeShellUserAgent = useMemo(
    () => createNativeShellUserAgent(nativeContext),
    [nativeContext],
  );

  const postToWeb = useCallback((message: NativeToWebMessage) => {
    const serialized = serializeBridgeMessage(message);
    const safeJavaScriptString = JSON.stringify(serialized).replace(/</g, "\\u003c");

    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(
        new CustomEvent(${JSON.stringify(NATIVE_TO_WEB_EVENT)}, {
          detail: ${safeJavaScriptString}
        })
      );
      true;
    `);
  }, []);

  const postError = useCallback(
    (request: WebToNativeMessage | null, code: string, message: string) => {
      postToWeb({
        version: BRIDGE_VERSION,
        id: request?.id ?? createBridgeId("native"),
        sentAt: Date.now(),
        type: "BRIDGE_ERROR",
        payload: {
          code,
          message,
          requestType: request?.type,
        },
      });
    },
    [postToWeb],
  );

  const handleBridgeRequest = useCallback(
    async (raw: string) => {
      const request = parseWebToNativeMessage(raw);
      if (!request) {
        postError(null, "INVALID_MESSAGE", "Bridge message validation failed.");
        return;
      }

      switch (request.type) {
        case "WEB_READY": {
          webReadyRef.current = true;
          postToWeb({
            version: BRIDGE_VERSION,
            id: request.id,
            sentAt: Date.now(),
            type: "NATIVE_READY",
            payload: nativeContext,
          });

          if (pendingDeepLinkRef.current) {
            const url = pendingDeepLinkRef.current;
            pendingDeepLinkRef.current = null;
            postToWeb({
              version: BRIDGE_VERSION,
              id: createBridgeId("native"),
              sentAt: Date.now(),
              type: "DEEP_LINK",
              payload: { url },
            });
          }
          return;
        }

        case "GET_NATIVE_CONTEXT":
          postToWeb({
            version: BRIDGE_VERSION,
            id: request.id,
            sentAt: Date.now(),
            type: "NATIVE_CONTEXT",
            payload: nativeContext,
          });
          return;

        case "SHARE": {
          try {
            const message = [request.payload.text, request.payload.url].filter(Boolean).join("\n");
            const result = await Share.share({
              title: request.payload.title,
              message: message || request.payload.title || "",
            });

            postToWeb({
              version: BRIDGE_VERSION,
              id: request.id,
              sentAt: Date.now(),
              type: "SHARE_RESULT",
              payload: {
                completed: result.action === Share.sharedAction,
              },
            });
          } catch (cause) {
            postError(
              request,
              "SHARE_FAILED",
              cause instanceof Error ? cause.message : "Native share failed.",
            );
          }
          return;
        }

        case "START_OAUTH": {
          if (!OAUTH_ENABLED) {
            postError(request, "OAUTH_DISABLED", "Native OAuth is disabled.");
            return;
          }

          try {
            const result = await startNativeAuth(request.payload.url, request.payload.callbackUrl);
            if (result.type === "success") {
              postToWeb({
                version: BRIDGE_VERSION,
                id: request.id,
                sentAt: Date.now(),
                type: "AUTH_RESULT",
                payload: { callbackUrl: result.callbackUrl },
              });
            } else {
              postToWeb({
                version: BRIDGE_VERSION,
                id: request.id,
                sentAt: Date.now(),
                type: "AUTH_CANCELLED",
                payload: {},
              });
            }
          } catch (cause) {
            postError(
              request,
              "OAUTH_FAILED",
              cause instanceof Error ? cause.message : "Native OAuth failed.",
            );
          }
          return;
        }

        case "DOWNLOAD_FILE": {
          if (!DOWNLOADS_ENABLED) {
            postError(request, "DOWNLOADS_DISABLED", "Native downloads are disabled.");
            return;
          }

          try {
            const fileName = await downloadAndShareFile(request.payload);
            postToWeb({
              version: BRIDGE_VERSION,
              id: request.id,
              sentAt: Date.now(),
              type: "DOWNLOAD_RESULT",
              payload: {
                completed: true,
                fileName,
              },
            });
          } catch (cause) {
            postError(
              request,
              "DOWNLOAD_FAILED",
              cause instanceof Error ? cause.message : "Native download failed.",
            );
          }
          return;
        }

        case "REQUEST_PUSH_PERMISSION": {
          const result = await registerForPushNotifications();
          postToWeb({
            version: BRIDGE_VERSION,
            id: request.id,
            sentAt: Date.now(),
            type: "PUSH_REGISTRATION_RESULT",
            payload: result,
          });
          return;
        }
      }
    },
    [nativeContext, postError, postToWeb],
  );

  const sendDeepLink = useCallback(
    (rawUrl: string) => {
      const url = normalizeDeepLink(rawUrl);
      if (!url) {
        return;
      }

      if (!webReadyRef.current) {
        pendingDeepLinkRef.current = url;
        return;
      }

      postToWeb({
        version: BRIDGE_VERSION,
        id: createBridgeId("native"),
        sentAt: Date.now(),
        type: "DEEP_LINK",
        payload: { url },
      });
    },
    [postToWeb],
  );

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) {
        sendDeepLink(url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => sendDeepLink(url));
    return () => subscription.remove();
  }, [sendDeepLink]);

  useEffect(() => {
    if (!PUSH_ENABLED) {
      return;
    }

    configureForegroundNotifications();
    return subscribeNotificationLinks(sendDeepLink);
  }, [sendDeepLink]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (!webReadyRef.current) {
        return;
      }

      postToWeb({
        version: BRIDGE_VERSION,
        id: createBridgeId("native"),
        sentAt: Date.now(),
        type: "APP_STATE_CHANGED",
        payload: { state: normalizeAppState(state) },
      });
    });

    return () => subscription.remove();
  }, [postToWeb]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) {
        return false;
      }

      webViewRef.current?.goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  const handleLoadEnd = () => {
    dispatchLoad({ type: "LOAD_SUCCEEDED" });
  };

  const showFailure = (nextFailure: LoadFailure) => {
    dispatchLoad({
      type: "LOAD_FAILED",
      failure: nextFailure,
    });
  };

  const retry = useCallback(() => {
    currentDocumentUrlRef.current = WEB_APP_URL;
    dispatchLoad({ type: "RETRY" });
    webReadyRef.current = false;
    setWebViewKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const previous = previousNetworkAvailabilityRef.current;
    previousNetworkAvailabilityRef.current = networkAvailability;

    if (
      shouldAutoRetryAfterNetworkRecovery(
        previous,
        networkAvailability,
        failure?.kind === "network",
      )
    ) {
      retry();
    }
  }, [failure?.kind, networkAvailability, retry]);

  return (
    <View style={styles.container}>
      <WebView
        key={webViewKey}
        ref={webViewRef}
        applicationNameForUserAgent={nativeShellUserAgent}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        cacheEnabled
        domStorageEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction
        mixedContentMode="never"
        onError={() => {
          showFailure({
            kind: "network",
            title: "서비스에 연결하지 못했습니다.",
            detail: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
          });
        }}
        onHttpError={(event) => {
          const { url } = event.nativeEvent;
          if (!isMainDocumentHttpError(url, currentDocumentUrlRef.current)) {
            return;
          }

          showFailure({
            kind: "http",
            title: "서비스를 불러오지 못했습니다.",
            detail: "요청을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          });
        }}
        onLoadEnd={handleLoadEnd}
        onLoadStart={(event) => {
          currentDocumentUrlRef.current = event.nativeEvent.url;
        }}
        onMessage={(event) => void handleBridgeRequest(event.nativeEvent.data)}
        onNavigationStateChange={(navigation) => {
          currentDocumentUrlRef.current = navigation.url;
          setCanGoBack(navigation.canGoBack);
        }}
        onOpenWindow={(event) => {
          void openExternalUrl(event.nativeEvent.targetUrl);
        }}
        onContentProcessDidTerminate={() => {
          showFailure({
            kind: "process",
            title: "화면을 불러오는 중 문제가 발생했습니다.",
            detail: "화면을 다시 불러와 주세요.",
          });
        }}
        onRenderProcessGone={() => {
          showFailure({
            kind: "process",
            title: "화면을 불러오는 중 문제가 발생했습니다.",
            detail: "화면을 다시 불러와 주세요.",
          });
        }}
        onShouldStartLoadWithRequest={(request) => {
          const { url } = request;

          if (url === "about:blank" || url.startsWith(`blob:${WEB_APP_ORIGIN}`)) {
            return true;
          }

          try {
            if (new URL(url).origin === WEB_APP_ORIGIN) {
              return true;
            }
          } catch {
            // Non-HTTP schemes are delegated to the operating system below.
          }

          void openExternalUrl(url);
          return false;
        }}
        originWhitelist={["http://*", "https://*"]}
        pullToRefreshEnabled={Platform.OS === "ios"}
        sharedCookiesEnabled
        source={{ uri: WEB_APP_URL }}
        thirdPartyCookiesEnabled={false}
      />

      {loading && !failure && !isOffline ? (
        <View accessibilityRole="progressbar" style={[StyleSheet.absoluteFill, styles.overlay]}>
          <ActivityIndicator size="large" />
          <Text style={styles.overlayText}>서비스를 불러오는 중…</Text>
        </View>
      ) : null}

      {isOffline ? (
        <View accessibilityRole="alert" style={[StyleSheet.absoluteFill, styles.overlay]}>
          <Text style={styles.errorTitle}>인터넷에 연결되어 있지 않습니다.</Text>
          <Text style={styles.errorDetail}>네트워크 연결이 복구되면 자동으로 다시 확인합니다.</Text>
        </View>
      ) : null}

      {failure && !isOffline ? (
        <View accessibilityRole="alert" style={[StyleSheet.absoluteFill, styles.overlay]}>
          <Text style={styles.errorTitle}>{failure.title}</Text>
          <Text style={styles.errorDetail}>{failure.detail}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

async function openExternalUrl(rawUrl: string): Promise<void> {
  try {
    const parsed = new URL(rawUrl);
    const allowed =
      parsed.protocol === "https:" ||
      (__DEV__ && parsed.protocol === "http:") ||
      parsed.protocol === "mailto:" ||
      parsed.protocol === "tel:" ||
      parsed.protocol === "sms:";

    if (!allowed || !(await Linking.canOpenURL(rawUrl))) {
      return;
    }

    await Linking.openURL(rawUrl);
  } catch {
    // Ignore malformed or unsupported external URLs.
  }
}

function normalizeAppState(
  state: AppStateStatus,
): "active" | "background" | "inactive" | "unknown" {
  if (state === "active" || state === "background" || state === "inactive") {
    return state;
  }

  return "unknown";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f5f7fb",
    padding: 24,
  },
  overlayText: {
    color: "#475569",
    fontSize: 15,
  },
  errorTitle: {
    color: "#172033",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorDetail: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    borderRadius: 10,
    backgroundColor: "#3049ae",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
