"use client";

import { useState } from "react";

type RuntimeResponse = {
  source: string;
  generatedAt: string;
  cachePolicy: string;
};

export function RuntimeQueryPanel() {
  const [data, setData] = useState<RuntimeResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = async () => {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/runtime", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setData((await response.json()) as RuntimeResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알 수 없는 오류");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Client Component → Route Handler</p>
          <h2>명시적인 HTTP 요청</h2>
        </div>
      </div>

      <p>
        이 버튼 호출은 향후 <code>useQuery</code>의 query function으로 옮길 수 있는 요청/응답 경계다.
      </p>

      <button className="primary-button" disabled={pending} onClick={query} type="button">
        {pending ? "요청 중…" : "Route Handler 호출"}
      </button>

      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
