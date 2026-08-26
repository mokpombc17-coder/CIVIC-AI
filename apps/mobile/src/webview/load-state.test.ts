import { describe, expect, it } from "vitest";
import { initialWebViewLoadState, reduceWebViewLoadState, type LoadFailure } from "./load-state";

const networkFailure: LoadFailure = {
  kind: "network",
  title: "서비스에 연결하지 못했습니다.",
  detail: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
};

describe("reduceWebViewLoadState", () => {
  it("starts in the loading state", () => {
    expect(initialWebViewLoadState).toEqual({ status: "loading" });
  });

  it("moves from loading to ready after a successful load", () => {
    expect(
      reduceWebViewLoadState(initialWebViewLoadState, {
        type: "LOAD_SUCCEEDED",
      }),
    ).toEqual({ status: "ready" });
  });

  it("keeps a failure when onLoadEnd arrives after an error", () => {
    const failed = reduceWebViewLoadState(initialWebViewLoadState, {
      type: "LOAD_FAILED",
      failure: networkFailure,
    });

    expect(reduceWebViewLoadState(failed, { type: "LOAD_SUCCEEDED" })).toBe(failed);
  });

  it("returns to loading when the user or network recovery retries", () => {
    const failed = reduceWebViewLoadState(initialWebViewLoadState, {
      type: "LOAD_FAILED",
      failure: networkFailure,
    });

    expect(reduceWebViewLoadState(failed, { type: "RETRY" })).toEqual({
      status: "loading",
    });
  });
});
