"use client";

import { isNativeShell, requestNativeOAuth, requestNativeResponse } from "./bridge-client";

export async function startOAuth(input: {
  authorizationUrl: string;
  callbackUrl: string;
}): Promise<string | null> {
  if (!isNativeShell()) {
    window.location.assign(input.authorizationUrl);
    return null;
  }

  const response = await requestNativeResponse(
    () =>
      requestNativeOAuth({
        url: input.authorizationUrl,
        callbackUrl: input.callbackUrl,
      }),
    ["AUTH_RESULT", "AUTH_CANCELLED"],
  );

  if (response.type === "AUTH_CANCELLED") {
    return null;
  }
  if (response.type !== "AUTH_RESULT") {
    throw new Error(`Unexpected native OAuth response: ${response.type}`);
  }

  return response.payload.callbackUrl;
}
