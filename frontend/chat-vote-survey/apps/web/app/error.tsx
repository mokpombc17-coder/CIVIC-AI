"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="panel" role="alert">
      <p className="eyebrow">Route error boundary</p>
      <h1>화면을 불러오지 못했습니다.</h1>
      <button className="primary-button" onClick={reset} type="button">
        다시 시도
      </button>
    </section>
  );
}
