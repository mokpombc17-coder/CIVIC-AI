"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export const PARTICIPANT_DOCUMENT_CATALOG_PATH = "/api/v1/rag/documents/random";

export type ParticipantDocumentCatalogItem = Readonly<{
  document_id: string;
  document_version_id: string;
  filename: string;
  media_type: string;
  page_count: number;
  created_at: string;
}>;

type CatalogState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; items: readonly ParticipantDocumentCatalogItem[] }>
  | Readonly<{ status: "error" }>;

export function ParticipantDocumentCatalog() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) setState({ status: "loading" });
    });

    void authenticatedFetch(PARTICIPANT_DOCUMENT_CATALOG_PATH, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Participant document catalog failed: ${response.status}`);
        const items = parseParticipantDocumentCatalog(await response.json());
        if (active) setState({ status: "ready", items });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setState({ status: "error" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  return (
    <section aria-label="질문할 수 있는 참고 자료" className="civic-rag-catalog">
      <p className="civic-rag-catalog-prompt">이런 자료에 관해 질문해 보세요</p>
      {state.status === "loading" ? <ParticipantDocumentCatalogSkeleton /> : null}
      {state.status === "ready" && state.items.length > 0 ? (
        <ul className="civic-rag-catalog-list">
          {state.items.map((item) => (
            <li key={`${item.document_id}:${item.document_version_id}`}>
              <span aria-hidden="true" className="civic-rag-catalog-file-icon">
                {documentKindLabel(item.filename)}
              </span>
              <span className="civic-rag-catalog-copy">
                <strong>{item.filename}</strong>
                <small>{item.page_count}페이지</small>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <p className="civic-rag-catalog-status">현재 참고할 수 있는 문서가 없습니다.</p>
      ) : null}
      {state.status === "error" ? (
        <div className="civic-rag-catalog-status" role="status">
          <span>문서 목록을 불러오지 못했습니다.</span>
          <button onClick={() => setAttempt((current) => current + 1)} type="button">
            다시 시도
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ParticipantDocumentCatalogSkeleton() {
  return (
    <ul aria-label="참고 문서를 불러오는 중" aria-live="polite" className="civic-rag-catalog-list">
      {Array.from({ length: 3 }, (_, index) => (
        <li aria-hidden="true" className="is-loading" key={index}>
          <span className="civic-skeleton civic-rag-catalog-icon-skeleton" />
          <span className="civic-rag-catalog-copy">
            <span className="civic-skeleton civic-rag-catalog-title-skeleton" />
            <span className="civic-skeleton civic-rag-catalog-meta-skeleton" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function parseParticipantDocumentCatalog(
  value: unknown,
): readonly ParticipantDocumentCatalogItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new TypeError("Invalid participant document catalog response.");
  }
  if (value.items.length > 3) {
    throw new TypeError("Participant document catalog exceeds its maximum size.");
  }
  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.document_id) ||
      !isNonEmptyString(item.document_version_id) ||
      !isNonEmptyString(item.filename) ||
      !isNonEmptyString(item.media_type) ||
      typeof item.page_count !== "number" ||
      !Number.isSafeInteger(item.page_count) ||
      item.page_count < 1 ||
      !isNonEmptyString(item.created_at)
    ) {
      throw new TypeError("Invalid participant document catalog item.");
    }
    return {
      document_id: item.document_id,
      document_version_id: item.document_version_id,
      filename: item.filename,
      media_type: item.media_type,
      page_count: item.page_count,
      created_at: item.created_at,
    };
  });
}

export function documentKindLabel(filename: string): string {
  const extension = filename.match(/\.([\p{L}\p{N}]+)$/u)?.[1];
  if (!extension || extension.length > 5) return "문서";
  return extension.toLocaleUpperCase("ko-KR");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
