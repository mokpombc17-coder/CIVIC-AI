"use client";

import { requestNativeResponse, requestPushPermission } from "./bridge-client";

export type PushRegistrationStatus = "registered" | "denied" | "undetermined" | "unavailable";

export async function requestAndPersistPushToken(input: {
  platform: "ios" | "android";
  appVersion?: string;
}): Promise<PushRegistrationStatus> {
  const response = await requestNativeResponse(requestPushPermission, ["PUSH_REGISTRATION_RESULT"]);
  if (response.type !== "PUSH_REGISTRATION_RESULT") {
    throw new Error(`Unexpected push registration response: ${response.type}`);
  }

  const { status, expoPushToken } = response.payload;
  if (status !== "granted") {
    return status;
  }
  if (!expoPushToken) {
    return "unavailable";
  }

  const registration = await fetch("/api/mobile/push-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expoPushToken,
      platform: input.platform,
      appVersion: input.appVersion,
    }),
  });
  if (!registration.ok) {
    throw new Error(`Push token persistence failed with HTTP ${registration.status}.`);
  }

  return "registered";
}
