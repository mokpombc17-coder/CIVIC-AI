"use client";

import { useState } from "react";

type UpstreamHealth = {
  reachable: boolean;
  upstreamStatus: number | null;
};

export function UpstreamHealthPanel() {
  const [result, setResult] = useState<UpstreamHealth | null>(null);
  const [pending, setPending] = useState(false);

  const check = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/upstream-health", { cache: "no-store" });
      setResult((await response.json()) as UpstreamHealth);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Next BFF → Spring Boot</p>
          <h2>운영 서버 경계</h2>
        </div>
      </div>

      <p>
        Route Handler가 내부 주소의 Spring Boot Actuator를 호출하고, 브라우저에는 축약된 결과만 반환한다.
      </p>

      <button className="secondary-button" disabled={pending} onClick={check} type="button">
        {pending ? "확인 중…" : "upstream 확인"}
      </button>

      {result ? (
        <p>
          reachable: <strong>{String(result.reachable)}</strong>, status:{" "}
          <strong>{result.upstreamStatus ?? "connection failed"}</strong>
        </p>
      ) : null}
    </section>
  );
}
