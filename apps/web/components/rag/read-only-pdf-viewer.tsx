"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ensureAccessToken } from "@/lib/auth/authenticated-fetch";

const PAGE_VISIBILITY_THRESHOLDS = Array.from({ length: 101 }, (_, index) => index / 100);

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
  const viewerKey = `${documentSource}:${safePage}`;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [visibleLocation, setVisibleLocation] = useState({ key: viewerKey, page: safePage });
  const visiblePage = visibleLocation.key === viewerKey ? visibleLocation.page : safePage;
  const handleVisiblePageChange = useCallback(
    (page: number) => {
      setVisibleLocation((current) =>
        current.key === viewerKey && current.page === page ? current : { key: viewerKey, page },
      );
    },
    [viewerKey],
  );

  return (
    <section
      aria-label={`${documentTitle} 읽기 전용 문서`}
      className="civic-pdf-viewer"
      data-pdf-zoom-mode="pinch"
      data-pdf-scroll-mode="continuous"
    >
      <header className="civic-pdf-toolbar">
        <div className="civic-pdf-toolbar-copy">
          <h2 title={`${documentTitle} 미리보기`}>{documentTitle} 미리보기</h2>
          <span
            aria-label={`현재 ${visiblePage} / ${safeTotalPages}페이지`}
            className="civic-pdf-toolbar-page"
          >
            {visiblePage}/{safeTotalPages}
          </span>
        </div>
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
        <div className="civic-pdf-canvas" ref={canvasRef}>
          <AuthenticatedPdfPages
            currentPage={safePage}
            documentSource={documentSource}
            documentTitle={documentTitle}
            onVisiblePageChange={handleVisiblePageChange}
            scrollRootRef={canvasRef}
            totalPages={safeTotalPages}
          />
        </div>
        <strong aria-live="polite" className="sr-only">
          현재 {visiblePage} / {safeTotalPages}페이지
        </strong>
      </div>
    </section>
  );
}

type AuthenticatedPdfPagesProps = Readonly<{
  currentPage: number;
  documentSource: string;
  documentTitle: string;
  onVisiblePageChange: (page: number) => void;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  totalPages: number;
}>;

function AuthenticatedPdfPages({
  currentPage,
  documentSource,
  documentTitle,
  onVisiblePageChange,
  scrollRootRef,
  totalPages,
}: AuthenticatedPdfPagesProps) {
  const [authorization, setAuthorization] = useState<{
    source: string;
    state: "checking" | "ready" | "unavailable";
  }>({ source: documentSource, state: "checking" });
  const pageListRef = useRef<HTMLDivElement>(null);
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
      pageListRef.current
        ?.querySelector<HTMLElement>(`[data-pdf-page="${currentPage}"]`)
        ?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, state]);

  useEffect(() => {
    if (state !== "ready" || typeof IntersectionObserver === "undefined") return;

    const root = scrollRootRef.current;
    const pages = Array.from(
      pageListRef.current?.querySelectorAll<HTMLElement>("[data-pdf-page]") ?? [],
    );
    if (!root || pages.length === 0) return;

    const visibleAreas = new Map<number, number>();
    for (const page of pages) {
      visibleAreas.set(Number(page.dataset.pdfPage), 0);
    }

    let observer: IntersectionObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.pdfPage);
            const visibleArea = entry.intersectionRect.width * entry.intersectionRect.height;
            visibleAreas.set(page, entry.isIntersecting ? visibleArea : 0);
          }

          const rootCenter = root.getBoundingClientRect().top + root.clientHeight / 2;
          let nextPage = currentPage;
          let greatestArea = 0;
          let closestCenterDistance = Number.POSITIVE_INFINITY;

          for (const pageElement of pages) {
            const page = Number(pageElement.dataset.pdfPage);
            const visibleArea = visibleAreas.get(page) ?? 0;
            const rect = pageElement.getBoundingClientRect();
            const centerDistance = Math.abs(rect.top + rect.height / 2 - rootCenter);
            if (
              visibleArea > greatestArea ||
              (visibleArea === greatestArea &&
                visibleArea > 0 &&
                centerDistance < closestCenterDistance)
            ) {
              nextPage = page;
              greatestArea = visibleArea;
              closestCenterDistance = centerDistance;
            }
          }

          if (greatestArea > 0) onVisiblePageChange(nextPage);
        },
        { root, threshold: PAGE_VISIBILITY_THRESHOLDS },
      );

      for (const page of pages) observer.observe(page);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [currentPage, onVisiblePageChange, scrollRootRef, state, totalPages]);

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
    <div aria-label={title} className="civic-pdf-page-list" ref={pageListRef}>
      {Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        return (
          <PdfPageImage
            isCited={page === currentPage}
            key={page}
            page={page}
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
  source: string;
  title: string;
}>;

function PdfPageImage({ isCited, page, source, title }: PdfPageImageProps) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const imageSource = retry === 0 ? source : `${source}?retry=${retry}`;

  return (
    <article
      aria-label={`${page}페이지${isCited ? ", 인용 페이지" : ""}`}
      className="civic-pdf-page"
      data-pdf-page={page}
    >
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
