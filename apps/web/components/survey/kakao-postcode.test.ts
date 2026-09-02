import { describe, expect, it } from "vitest";
import { normalizeKakaoResidence } from "./kakao-postcode";

describe("normalizeKakaoResidence", () => {
  it("uses the legal dong for an urban address", () => {
    expect(
      normalizeKakaoResidence({
        sido: " 경기도 ",
        sigungu: "성남시 분당구",
        bname1: "",
        bname2: "백현동",
      }),
    ).toEqual({
      sido: "경기도",
      sigungu: "성남시 분당구",
      eupMyeonDong: "백현동",
    });
  });

  it("uses eup or myeon and discards ri for a rural address", () => {
    expect(
      normalizeKakaoResidence({
        sido: "경기도",
        sigungu: "양평군",
        bname1: "양서면",
        bname2: "양수리",
      }),
    ).toEqual({
      sido: "경기도",
      sigungu: "양평군",
      eupMyeonDong: "양서면",
    });
  });

  it("accepts a valid region without a sigungu level", () => {
    expect(
      normalizeKakaoResidence({
        sido: "세종특별자치시",
        sigungu: "",
        bname1: "",
        bname2: "나성동",
      }),
    ).toEqual({
      sido: "세종특별자치시",
      sigungu: "",
      eupMyeonDong: "나성동",
    });
  });

  it("rejects a result that only exposes ri without its eup or myeon", () => {
    expect(
      normalizeKakaoResidence({
        sido: "경기도",
        sigungu: "양평군",
        bname1: "",
        bname2: "양수리",
      }),
    ).toBeNull();
  });
});
