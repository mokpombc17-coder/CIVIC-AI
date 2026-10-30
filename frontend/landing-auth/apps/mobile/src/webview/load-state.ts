export type LoadFailure = {
  kind: "network" | "http" | "process";
  title: string;
  detail: string;
};

export type WebViewLoadState =
  { status: "loading" } | { status: "ready" } | { status: "failed"; failure: LoadFailure };

export type WebViewLoadAction =
  { type: "LOAD_SUCCEEDED" } | { type: "LOAD_FAILED"; failure: LoadFailure } | { type: "RETRY" };

export const initialWebViewLoadState: WebViewLoadState = {
  status: "loading",
};

export function reduceWebViewLoadState(
  state: WebViewLoadState,
  action: WebViewLoadAction,
): WebViewLoadState {
  switch (action.type) {
    case "LOAD_SUCCEEDED":
      return state.status === "failed" ? state : { status: "ready" };
    case "LOAD_FAILED":
      return {
        status: "failed",
        failure: action.failure,
      };
    case "RETRY":
      return { status: "loading" };
  }
}
