const KAKAO_POSTCODE_SCRIPT_ID = "kakao-postcode-script";
const KAKAO_POSTCODE_SCRIPT_URL =
  "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
const KAKAO_POSTCODE_LOAD_TIMEOUT_MS = 10_000;

export type KakaoPostcodeData = Readonly<{
  bname1: string;
  bname2: string;
  sido: string;
  sigungu: string;
}>;

export type SurveyResidence = Readonly<{
  eupMyeonDong: string;
  sido: string;
  sigungu: string;
}>;

type KakaoPostcodeOptions = Readonly<{
  height?: string;
  onclose?: () => void;
  oncomplete: (data: KakaoPostcodeData) => void;
  shorthand?: boolean;
  width?: string;
}>;

type KakaoPostcodeInstance = Readonly<{
  embed: (element: HTMLElement, options?: Readonly<{ autoClose?: boolean }>) => void;
}>;

export type KakaoPostcodeConstructor = new (options: KakaoPostcodeOptions) => KakaoPostcodeInstance;

type KakaoPostcodeWindow = Window &
  typeof globalThis & {
    kakao?: {
      Postcode?: KakaoPostcodeConstructor;
    };
  };

let postcodeScriptPromise: Promise<KakaoPostcodeConstructor> | null = null;

export function normalizeKakaoResidence(data: KakaoPostcodeData): SurveyResidence | null {
  const sido = data.sido.trim();
  const sigungu = data.sigungu.trim();
  const bname1 = data.bname1.trim();
  const bname2 = data.bname2.trim();
  const eupMyeonDong = bname1 || bname2;

  if (!sido || !eupMyeonDong) return null;
  if (!bname1 && bname2.endsWith("리")) return null;

  return { sido, sigungu, eupMyeonDong };
}

export function loadKakaoPostcode(): Promise<KakaoPostcodeConstructor> {
  const postcodeWindow = window as KakaoPostcodeWindow;
  const availableConstructor = postcodeWindow.kakao?.Postcode;
  if (availableConstructor) return Promise.resolve(availableConstructor);
  if (postcodeScriptPromise) return postcodeScriptPromise;

  postcodeScriptPromise = new Promise<KakaoPostcodeConstructor>((resolve, reject) => {
    const existingScript = document.getElementById(
      KAKAO_POSTCODE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");
    let settled = false;

    const finish = (
      result:
        | Readonly<{ constructor: KakaoPostcodeConstructor; type: "success" }>
        | Readonly<{ error: Error; type: "failure" }>,
    ) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);

      if (result.type === "success") {
        resolve(result.constructor);
        return;
      }

      script.remove();
      postcodeScriptPromise = null;
      reject(result.error);
    };

    const handleLoad = () => {
      const constructor = postcodeWindow.kakao?.Postcode;
      if (constructor) {
        finish({ type: "success", constructor });
      } else {
        finish({ type: "failure", error: new Error("Kakao Postcode API is unavailable.") });
      }
    };
    const handleError = () =>
      finish({ type: "failure", error: new Error("Failed to load Kakao Postcode API.") });
    const timeoutId = window.setTimeout(
      () => finish({ type: "failure", error: new Error("Kakao Postcode API load timed out.") }),
      KAKAO_POSTCODE_LOAD_TIMEOUT_MS,
    );

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      script.async = true;
      script.id = KAKAO_POSTCODE_SCRIPT_ID;
      script.src = KAKAO_POSTCODE_SCRIPT_URL;
      document.head.append(script);
    }
  });

  return postcodeScriptPromise;
}

export function resetKakaoPostcodeLoader(): void {
  if ((window as KakaoPostcodeWindow).kakao?.Postcode) return;
  document.getElementById(KAKAO_POSTCODE_SCRIPT_ID)?.remove();
  postcodeScriptPromise = null;
}
