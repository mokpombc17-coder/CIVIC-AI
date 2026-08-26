"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

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
  const [zoom, setZoom] = useState(100);
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
        <h3>{documentTitle}</h3>
        <p>
          {safePage} / {totalPages}페이지 · {zoom}%
        </p>
        <div aria-label="PDF 페이지 도구" className="civic-pdf-controls" role="toolbar">
          {onPageChange ? (
            <button
              className="civic-icon-action"
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
              className="civic-icon-action"
              href={
                (safePage <= 1
                  ? "#"
                  : pageHref(sourceUrl, safePage - 1, documentTitle, totalPages)) as Route
              }
            >
              이전 페이지
            </Link>
          )}
          <strong aria-live="polite" className="sr-only">
            {safePage} / {totalPages}
          </strong>
          {onPageChange ? (
            <button
              className="civic-icon-action"
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
              className="civic-icon-action"
              href={
                (safePage >= totalPages
                  ? "#"
                  : pageHref(sourceUrl, safePage + 1, documentTitle, totalPages)) as Route
              }
            >
              다음 페이지
            </Link>
          )}
          <button
            className="civic-icon-action"
            disabled={zoom <= 75}
            onClick={() => setZoom((value) => Math.max(75, value - 25))}
            type="button"
          >
            축소
          </button>
          <span>{zoom}%</span>
          <button
            className="civic-icon-action"
            disabled={zoom >= 200}
            onClick={() => setZoom((value) => Math.min(200, value + 25))}
            type="button"
          >
            확대
          </button>
        </div>
      </div>
      <div
        className="civic-pdf-canvas"
        style={{ "--pdf-zoom": `${zoom / 100}` } as React.CSSProperties}
      >
        <iframe src={viewerSource} title={`${documentTitle} ${safePage}페이지`} />
      </div>
      <p className="civic-reader-note">
        이 화면은 읽기 전용입니다. 원본 저장 기능은 제공하지 않습니다.
      </p>
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
