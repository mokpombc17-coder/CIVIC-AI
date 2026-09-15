import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_USER_ID_STORAGE_KEY,
  applyStoredGoogleAnalyticsUserId,
  type GoogleAnalyticsUserIdentityTarget,
} from "./google-analytics-user-identity";

const USER_ID = "8c90ae1f-5b2d-435a-91fa-074ebe3e1d7c";

describe("GoogleAnalyticsUserIdentity", () => {
  it("저장된 사용자 UUID를 GA User-ID로 설정한다", () => {
    const getItem = vi.fn().mockReturnValue(USER_ID);
    const gtag = vi.fn();

    expect(
      applyStoredGoogleAnalyticsUserId({
        gtag,
        sessionStorage: { getItem },
      }),
    ).toBe(true);
    expect(getItem).toHaveBeenCalledWith(ANALYTICS_USER_ID_STORAGE_KEY);
    expect(gtag).toHaveBeenCalledWith("set", { user_id: USER_ID });
  });

  it("GA가 초기화되기 전이면 set 명령을 dataLayer에 대기시킨다", () => {
    const target: GoogleAnalyticsUserIdentityTarget = {
      sessionStorage: { getItem: vi.fn().mockReturnValue(USER_ID) },
    };

    expect(applyStoredGoogleAnalyticsUserId(target)).toBe(true);
    expect(target.dataLayer).toHaveLength(1);
    expect(Array.from(target.dataLayer?.[0] as IArguments)).toEqual(["set", { user_id: USER_ID }]);
  });

  it.each([null, "", "user09", "8c90ae1f-5b2d-435a-91fa-074ebe3e1d7c-extra"])(
    "저장값이 유효한 UUID가 아니면 GA에 전달하지 않는다: %s",
    (storedValue) => {
      const gtag = vi.fn();

      expect(
        applyStoredGoogleAnalyticsUserId({
          gtag,
          sessionStorage: { getItem: vi.fn().mockReturnValue(storedValue) },
        }),
      ).toBe(false);
      expect(gtag).not.toHaveBeenCalled();
    },
  );

  it("sessionStorage를 사용할 수 없어도 앱 진입을 방해하지 않는다", () => {
    const gtag = vi.fn();

    expect(
      applyStoredGoogleAnalyticsUserId({
        gtag,
        sessionStorage: {
          getItem: vi.fn(() => {
            throw new DOMException("Storage access denied", "SecurityError");
          }),
        },
      }),
    ).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });
});
