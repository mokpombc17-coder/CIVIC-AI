"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTHENTICATED_DOWNLOAD_UNSUPPORTED, downloadFile } from "@/lib/native/download-client";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

type Analytics = Readonly<{
  from: string;
  to: string;
  minimum_bucket_size: number;
  suppressed: boolean;
  totals: Readonly<{
    queries: number;
    succeeded: number;
    failed: number;
    avg_latency_ms: number | null;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    helpful: number;
    unhelpful: number;
  }> | null;
  by_provider: readonly Readonly<{
    provider: string;
    model: string;
    prompt_version: string;
    queries: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  }>[];
}>;

function dateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function AdminRagAnalytics() {
  const initial = dateRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [analytics, setAnalytics] = useState<Analytics>();
  const [message, setMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportInFlight = useRef(false);

  const refresh = useCallback(async () => {
    setMessage("");
    const query = new URLSearchParams({ from, to });
    const response = await authenticatedFetch(`/api/v1/rag/analytics?${query}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("운영 지표를 불러오지 못했습니다.");
    setAnalytics((await response.json()) as Analytics);
  }, [from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "운영 지표를 불러오지 못했습니다."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const downloadJsonl = useCallback(
    async (filters: Readonly<{ from?: string; subject?: string; to?: string }>) => {
      if (exportInFlight.current) {
        return;
      }
      exportInFlight.current = true;
      setExporting(true);
      setExportMessage("대화 JSONL 다운로드를 준비하고 있습니다.");
      try {
        await downloadRagConversationJsonl(filters);
        setExportMessage("대화 JSONL 다운로드 요청을 완료했습니다.");
      } catch (error) {
        setExportMessage(
          error instanceof Error && error.message === AUTHENTICATED_DOWNLOAD_UNSUPPORTED
            ? "인증 파일 다운로드를 지원하는 최신 앱으로 업데이트해 주세요."
            : "대화 JSONL을 내려받지 못했습니다.",
        );
      } finally {
        exportInFlight.current = false;
        setExporting(false);
      }
    },
    [],
  );

  return (
    <details className="civic-inline-upload" data-rag-analytics="true">
      <summary>
        <span>
          <strong>RAG 운영 지표</strong>
        </span>
        <span aria-hidden="true" className="civic-inline-upload-toggle">
          통계 보기
        </span>
      </summary>
      <div className="civic-inline-upload-body">
        <div className="civic-admin-form">
          <label>
            <span>시작일</span>
            <input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </label>
          <label>
            <span>종료일</span>
            <input onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </label>
          <button
            onClick={() => void refresh().catch(() => setMessage("조회하지 못했습니다."))}
            type="button"
          >
            조회
          </button>
        </div>
        <dl className="civic-rag-metric-grid">
          <div>
            <dt>질의 수</dt>
            <dd>{analytics?.totals?.queries ?? "—"}</dd>
          </div>
          <div>
            <dt>성공 / 실패</dt>
            <dd>
              {analytics?.totals
                ? `${analytics.totals.succeeded} / ${analytics.totals.failed}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>평균 응답시간</dt>
            <dd>
              {analytics?.totals?.avg_latency_ms == null
                ? "—"
                : `${analytics.totals.avg_latency_ms.toLocaleString("ko-KR")} ms`}
            </dd>
          </div>
          <div>
            <dt>도움됨 / 도움 안 됨</dt>
            <dd>
              {analytics?.totals
                ? `${analytics.totals.helpful} / ${analytics.totals.unhelpful}`
                : "—"}
            </dd>
          </div>
        </dl>
        <section className="civic-admin-form" aria-label="RAG 대화 기록 내보내기">
          <button
            className="civic-secondary-action"
            disabled={exporting}
            onClick={() => void downloadJsonl({ from, to })}
            type="button"
          >
            조회 기간 대화 JSONL
          </button>
          <button
            className="civic-secondary-action"
            disabled={exporting}
            onClick={() => void downloadJsonl({})}
            type="button"
          >
            전체 대화 JSONL
          </button>
          <small>
            실제 사용자 질문·AI 답변·인용 문서·평가가 포함됩니다. 권한이 있는 운영자만 내려받으세요.
          </small>
          {exportMessage ? <small aria-live="polite">{exportMessage}</small> : null}
        </section>
        {analytics?.suppressed ? (
          <p>개인 식별 위험을 줄이기 위해 집계 구간당 3건 미만인 결과는 표시하지 않습니다.</p>
        ) : null}
        {analytics?.by_provider.length ? (
          <div className="civic-table-scroll" role="region" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>제공자</th>
                  <th>모델</th>
                  <th>질의</th>
                  <th>입력 / 출력 / 캐시 토큰</th>
                </tr>
              </thead>
              <tbody>
                {analytics.by_provider.map((item) => (
                  <tr key={`${item.provider}:${item.model}:${item.prompt_version}`}>
                    <td>{item.provider}</td>
                    <td>{item.model}</td>
                    <td>{item.queries}</td>
                    <td>
                      {item.input_tokens.toLocaleString("ko-KR")} /{" "}
                      {item.output_tokens.toLocaleString("ko-KR")} /{" "}
                      {item.cached_tokens.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p>집계 구간당 3건 미만인 세부 결과는 항상 숨깁니다.</p>
        {message ? <p aria-live="polite">{message}</p> : null}
      </div>
    </details>
  );
}

export function ragConversationExportHref({
  from,
  subject,
  to,
}: Readonly<{ from?: string; subject?: string; to?: string }>): string {
  const query = new URLSearchParams();
  const normalizedSubject = subject?.trim();
  if (normalizedSubject) query.set("subject", normalizedSubject);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const suffix = query.toString();
  return `/api/v1/rag/conversations/export${suffix ? `?${suffix}` : ""}`;
}

export async function downloadRagConversationJsonl(
  filters: Readonly<{ from?: string; subject?: string; to?: string }>,
  download: typeof downloadFile = downloadFile,
  origin: string = window.location.origin,
  exportId: string = uniqueRagConversationExportId(),
): Promise<void> {
  await download({
    url: new URL(ragConversationExportHref(filters), origin).toString(),
    fileName: `civic-rag-conversations-${new Date().toISOString().slice(0, 10)}-${exportId}.jsonl`,
    mimeType: "application/x-ndjson",
    requiresAuthentication: true,
  });
}

export function uniqueRagConversationExportId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}
