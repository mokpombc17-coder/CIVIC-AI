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
}>;

export function ReadOnlyPdfViewer({
  documentTitle,
  currentPage,
  totalPages,
  sourceUrl,
  onClose,
}: ReadOnlyPdfViewerProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.max(1, Math.min(currentPage, safeTotalPages));
  const documentSource = sourceUrl.endsWith("/document") ? sourceUrl : `${sourceUrl}/document`;
  const viewerSource = `${documentSource}#page=${safePage}&toolbar=0&navpanes=0&scrollbar=1&view=FitH`;

  return (
    <section
      aria-label={`${documentTitle} 읽기 전용 PDF`}
      className="civic-pdf-viewer"
      data-pdf-scroll-mode="continuous"
    >
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
            전체 {safeTotalPages}페이지 · 인용 {safePage}페이지 · 연속 스크롤
          </p>
        </header>
        <div className="civic-pdf-canvas">
          <AuthenticatedResourceFrame
            src={viewerSource}
            title={`${documentTitle} 전체 문서, ${safePage}페이지 인용 위치`}
          />
        </div>
        <strong aria-live="polite" className="sr-only">
          인용 {safePage} / {safeTotalPages}페이지, 연속 스크롤
        </strong>
      </div>
    </section>
  );
}
