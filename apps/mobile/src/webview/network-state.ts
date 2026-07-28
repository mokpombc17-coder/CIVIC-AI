import type { NetworkState } from "expo-network";

export type NetworkAvailability = "unknown" | "online" | "offline";

export function getNetworkAvailability(
  state: Pick<NetworkState, "isConnected" | "isInternetReachable">,
): NetworkAvailability {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return "offline";
  }

  if (state.isConnected === true) {
    return "online";
  }

  return "unknown";
}

export function shouldAutoRetryAfterNetworkRecovery(
  previous: NetworkAvailability,
  current: NetworkAvailability,
  hasNetworkLoadFailure: boolean,
): boolean {
  return previous === "offline" && current === "online" && hasNetworkLoadFailure;
}
