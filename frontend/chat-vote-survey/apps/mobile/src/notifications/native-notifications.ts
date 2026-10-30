import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { PUSH_ENABLED } from "../config/runtime";

export type PushRegistrationResult = {
  status: "granted" | "denied" | "undetermined" | "unavailable";
  expoPushToken?: string;
  reason?: string;
};

export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!PUSH_ENABLED) {
    return {
      status: "unavailable",
      reason: "Push notifications are disabled by EXPO_PUBLIC_PUSH_ENABLED.",
    };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && permissions.status !== "denied") {
    permissions = await Notifications.requestPermissionsAsync();
  }

  if (!permissions.granted) {
    return {
      status: permissions.status === "denied" ? "denied" : "undetermined",
    };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    return {
      status: "unavailable",
      reason: "EAS_PROJECT_ID is required to create an Expo push token.",
    };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return {
      status: "granted",
      expoPushToken: token.data,
    };
  } catch (cause) {
    return {
      status: "unavailable",
      reason: cause instanceof Error ? cause.message : "Push token registration failed.",
    };
  }
}

export function subscribeNotificationLinks(onUrl: (url: string) => void): () => void {
  if (!PUSH_ENABLED) {
    return () => undefined;
  }

  try {
    const initialResponse = Notifications.getLastNotificationResponse();
    const initialUrl = readNotificationUrl(initialResponse);
    if (initialUrl) {
      onUrl(initialUrl);
      void Notifications.clearLastNotificationResponseAsync();
    }
  } catch {
    // A native notification module is unavailable in the current runtime.
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = readNotificationUrl(response);
    if (url) {
      onUrl(url);
    }
  });

  return () => subscription.remove();
}

function readNotificationUrl(response: Notifications.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === "string" ? url : null;
}
