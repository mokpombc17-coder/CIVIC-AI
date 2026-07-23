"use client";

import type { NativeContext } from "@repo/bridge";
import { useEffect, useState } from "react";
import {
  isNativeShell,
  requestNativeContext,
  requestNativeShare,
  subscribeNativeMessages,
} from "@/lib/native/bridge-client";

export function NativeBridgePanel() {
  const [native, setNative] = useState(false);
  const [context, setContext] = useState<NativeContext | null>(null);
  const [result, setResult] = useState("브라우저에서는 네이티브 브리지가 비활성입니다.");

  useEffect(() => {
    const insideNativeShell = isNativeShell();
    setNative(insideNativeShell);

    const unsubscribe = subscribeNativeMessages((message) => {
      switch (message.type) {
        case "NATIVE_READY":
        case "NATIVE_CONTEXT":
          setContext(message.payload);
          setResult(`${message.payload.platform} 앱과 연결되었습니다.`);
          break;
        case "SHARE_RESULT":
          setResult(message.payload.completed ? "공유를 완료했습니다." : "공유를 취소했습니다.");
          break;
        case "APP_STATE_CHANGED":
          setResult(`앱 상태: ${message.payload.state}`);
          break;
        case "BRIDGE_ERROR":
          setResult(`브리지 오류: ${message.payload.message}`);
          break;
        case "DEEP_LINK":
          break;
      }
    });

    if (insideNativeShell) {
      requestNativeContext();
    }

    return unsubscribe;
  }, []);

  const share = () => {
    const id = requestNativeShare({
      title: "Next.js + Expo WebView Starter",
      text: "웹 UI가 네이티브 공유 기능을 브리지로 호출했습니다.",
      url: window.location.href,
    });

    setResult(id ? `공유 요청 전송: ${id}` : "네이티브 WebView에서만 실행할 수 있습니다.");
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Web ↔ Native</p>
          <h2>버전된 브리지</h2>
        </div>
        <span className={`status ${native ? "status-success" : "status-neutral"}`}>
          {native ? "native shell" : "browser"}
        </span>
      </div>

      <p>{result}</p>

      {context ? (
        <dl className="definition-grid">
          <div>
            <dt>platform</dt>
            <dd>{context.platform}</dd>
          </div>
          <div>
            <dt>app version</dt>
            <dd>{context.appVersion}</dd>
          </div>
          <div>
            <dt>capabilities</dt>
            <dd>{context.capabilities.join(", ")}</dd>
          </div>
        </dl>
      ) : null}

      <button className="primary-button" disabled={!native} onClick={share} type="button">
        네이티브 공유창 열기
      </button>
    </section>
  );
}
