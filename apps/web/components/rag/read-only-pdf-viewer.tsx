"use client";

import Link from "next/link";
import type { Route } from "next";
import { AuthenticatedResourceFrame } from "@/components/auth/authenticated-resource-frame";

type ReadOnlyPdfViewerProps = Readonly<{
  documentTitle: string;
  currentPage: number;
  totalPages: number;
  sourceUrl: string;
  onClose?: () => void;
  onPageChange?: (page: number) => void;
}>;

export function ReadOnlyPdfViewer({
  documentTitle,
  currentPage,
  totalPages,
  sourceUrl,
  onClose,
  onPageChange,
}: ReadOnlyPdfViewerProps) {
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const viewerSource = `${sourceUrl}#page=${safePage}&toolbar=0&navpanes=0&scrollbar=1`;

  return (
    <section aria-label={`${documentTitle} 읽기 전용 PDF`} className="civic-pdf-viewer">
      <header className="civic-pdf-toolbar">
        <h2>참조 문서</h2>
        {onClose ? (
          <button
            aria-label="참조 문서 닫기"
            className="wf-rag-dialog-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : (
          <Link aria-label="참조 문서 닫기" className="wf-rag-dialog-close" href={"/rag" as Route}>
            <span aria-hidden="true">×</span>
          </Link>
        )}
      </header>
      <div className="wf-rag-document-card">
        <header className="wf-rag-document-meta">
          <h3>{documentTitle}</h3>
          <p>
            {safePage}/{totalPages}페이지 · 100%
          </p>
        </header>
        <div className="civic-pdf-canvas">
          <AuthenticatedResourceFrame
            src={viewerSource}
            title={`${documentTitle} ${safePage}페이지`}
          />
        </div>
        <strong aria-live="polite" className="sr-only">
          {safePage} / {totalPages}페이지
        </strong>
        <div aria-label="PDF 페이지 도구" className="civic-pdf-controls" role="toolbar">
          {onPageChange ? (
            <button
              className="wf-button wf-button-secondary"
              data-page-target={safePage - 1}
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              type="button"
            >
              이전 페이지
            </button>
          ) : (
            <Link
              aria-disabled={safePage <= 1}
              className="wf-button wf-button-secondary"
              href={
                (safePage <= 1
                  ? "#"
                  : pageHref(sourceUrl, safePage - 1, documentTitle, totalPages)) as Route
              }
            >
              이전 페이지
            </Link>
          )}
          {onPageChange ? (
            <button
              className="wf-button wf-button-primary"
              data-page-target={safePage + 1}
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              type="button"
            >
              다음 페이지
            </button>
          ) : (
            <Link
              aria-disabled={safePage >= totalPages}
              className="wf-button wf-button-primary"
              href={
                (safePage >= totalPages
                  ? "#"
                  : pageHref(sourceUrl, safePage + 1, documentTitle, totalPages)) as Route
              }
            >
              다음 페이지
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function pageHref(sourceUrl: string, page: number, title: string, totalPages: number) {
  const match = sourceUrl.match(/\/sources\/([^/]+)\/pages\/\d+/);
  const versionId = decodePathSegment(match?.[1] ?? "");
  return `/rag/source/page?versionId=${encodeURIComponent(versionId)}&page=${page}&title=${encodeURIComponent(title)}&total=${totalPages}`;
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
