"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ensureAccessToken } from "@/lib/auth/authenticated-fetch";

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

  return (
    <section
      aria-label={`${documentTitle} 읽기 전용 문서`}
      className="civic-pdf-viewer"
      data-pdf-zoom-mode="pinch"
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
            전체 {safeTotalPages}페이지 · 인용 {safePage}페이지
          </p>
        </header>
        <div className="civic-pdf-canvas">
          <AuthenticatedPdfPages
            currentPage={safePage}
            documentSource={documentSource}
            documentTitle={documentTitle}
            totalPages={safeTotalPages}
          />
        </div>
        <strong aria-live="polite" className="sr-only">
          인용 {safePage} / {safeTotalPages}페이지
        </strong>
      </div>
    </section>
  );
}

type AuthenticatedPdfPagesProps = Readonly<{
  currentPage: number;
  documentSource: string;
  documentTitle: string;
  totalPages: number;
}>;

function AuthenticatedPdfPages({
  currentPage,
  documentSource,
  documentTitle,
  totalPages,
}: AuthenticatedPdfPagesProps) {
  const [authorization, setAuthorization] = useState<{
    source: string;
    state: "checking" | "ready" | "unavailable";
  }>({ source: documentSource, state: "checking" });
  const citedPageRef = useRef<HTMLElement>(null);
  const state = authorization.source === documentSource ? authorization.state : "checking";

  useEffect(() => {
    let active = true;
    void ensureAccessToken().then((available) => {
      if (active) {
        setAuthorization({
          source: documentSource,
          state: available ? "ready" : "unavailable",
        });
      }
    });
    return () => {
      active = false;
    };
  }, [documentSource]);

  useEffect(() => {
    if (state !== "ready") return;
    const frame = window.requestAnimationFrame(() => {
      citedPageRef.current?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, state]);

  const title = `${documentTitle} 전체 문서, ${currentPage}페이지 인용 위치`;
  if (state !== "ready") {
    return (
      <div aria-label={title} aria-live="polite" className="civic-pdf-page-status" role="status">
        {state === "checking"
          ? "문서 접근 권한을 확인하고 있습니다."
          : "로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요."}
      </div>
    );
  }

  return (
    <div aria-label={title} className="civic-pdf-page-list">
      {Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        return (
          <PdfPageImage
            isCited={page === currentPage}
            key={page}
            page={page}
            {...(page === currentPage ? { pageRef: citedPageRef } : {})}
            source={`${documentSource}/pages/${page}.png`}
            title={documentTitle}
          />
        );
      })}
    </div>
  );
}

type PdfPageImageProps = Readonly<{
  isCited: boolean;
  page: number;
  pageRef?: RefObject<HTMLElement | null>;
  source: string;
  title: string;
}>;

function PdfPageImage({ isCited, page, pageRef, source, title }: PdfPageImageProps) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const imageSource = retry === 0 ? source : `${source}?retry=${retry}`;

  return (
    <article
      aria-label={`${page}페이지${isCited ? ", 인용 페이지" : ""}`}
      className={`civic-pdf-page${isCited ? " is-cited" : ""}`}
      data-pdf-page={page}
      ref={pageRef}
    >
      <span className="civic-pdf-page-number">
        {page} / {title}
      </span>
      {failed ? (
        <div className="civic-pdf-page-error" role="alert">
          <span>{page}페이지를 불러오지 못했습니다.</span>
          <button
            onClick={() => {
              setFailed(false);
              setRetry((value) => value + 1);
            }}
            type="button"
          >
            다시 시도
          </button>
        </div>
      ) : (
        // The authenticated page-image endpoint has document-specific dimensions and must keep
        // browser cookies, so Next image optimization cannot safely proxy this resource.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`${title} ${page}페이지`}
          decoding="async"
          loading={isCited ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          src={imageSource}
        />
      )}
    </article>
  );
}
