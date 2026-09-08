import { memo } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "./participant-rag-screen";

const CITATION_MARKER_PATTERN =
  /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})#([1-9][0-9]*)\]/giu;
const CITATION_REFERENCE_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})#([1-9][0-9]*)/giu;
const CITATION_REFERENCE_GROUP_PATTERN =
  /\[[^\]\r\n]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#[1-9][0-9]*[^\]\r\n]*\]/giu;
const CITATION_SEQUENCE_WITH_TRAILING_PERIOD_PATTERN = new RegExp(
  `([\\t ]+)(${CITATION_REFERENCE_GROUP_PATTERN.source}(?:(?:[\\t ]*,[\\t ]*|[\\t ]+)${CITATION_REFERENCE_GROUP_PATTERN.source})*)\\.`,
  "giu",
);
const LEGACY_CITATION_MARKER_PATTERN =
  /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/giu;
const CIVIC_CITATION_URL_PREFIX = "civic-citation:";

/** 답변 본문에 섞여 오는 내부 인용 마커([UUID#page])를 제거한다. */
export function stripCitationMarkers(answer: string): string {
  return answer
    .replace(CITATION_REFERENCE_GROUP_PATTERN, "")
    .replace(LEGACY_CITATION_MARKER_PATTERN, "")
    .replace(/[ \t]{2,}/gu, " ");
}

/** 한글 조사까지 굵게 묶어 CommonMark 닫힘 구분자가 본문에 노출되지 않게 한다. */
export function normalizeKoreanStrongEmphasis(answer: string): string {
  return answer.replace(/\*\*([^*\r\n]+(?:\)|\]))\*\*([가-힣]+)/gu, "**$1$2**");
}

/** 문장 끝 출처 묶음 뒤의 마침표를 본문과 출처 사이로 옮긴다. */
export function normalizeCitationPunctuation(answer: string): string {
  return answer.replace(
    CITATION_SEQUENCE_WITH_TRAILING_PERIOD_PATTERN,
    (_match, spacing: string, citationSequence: string) => `.${spacing}${citationSequence}`,
  );
}

/** 마커의 문서 버전과 페이지가 모두 일치하는 인용 정보를 찾는다. */
export function citationForMarker(citations: readonly Citation[], marker: string): Citation | null {
  const match = new RegExp(`^${CITATION_MARKER_PATTERN.source}$`, "iu").exec(marker);
  if (!match) return null;
  const versionId = match[1]?.toLowerCase();
  const pageNumber = Number(match[2]);
  return (
    citations.find(
      (citation) =>
        citation.document_version_id.toLowerCase() === versionId &&
        citation.page_number === pageNumber,
    ) ?? null
  );
}

/** iKMS 인용 칩과 같은 축약 표기: 문서명은 CSS 말줄임, 페이지는 p.N. */
export function citationChipLabel(citation: Citation): string {
  return `${citation.title ?? "문서"} p.${citation.page_number}`;
}

type SafeMarkdownAnswerProps = Readonly<{
  answer: string;
  citations?: readonly Citation[];
  onOpenCitation?: (citation: Citation) => void;
}>;

export const SafeMarkdownAnswer = memo(function SafeMarkdownAnswer({
  answer,
  citations = [],
  onOpenCitation,
}: SafeMarkdownAnswerProps) {
  const markdown = normalizeKoreanStrongEmphasis(normalizeCitationPunctuation(answer))
    .replace(CITATION_REFERENCE_GROUP_PATTERN, (group) =>
      citationMarkdownLinksForGroup(citations, group),
    )
    .replace(LEGACY_CITATION_MARKER_PATTERN, (marker, versionId: string) => {
      const matches = citations.filter(
        (citation) => citation.document_version_id.toLowerCase() === versionId.toLowerCase(),
      );
      return matches.length === 1
        ? citationMarkdownLink(
            citations,
            `[${matches[0]?.document_version_id}#${matches[0]?.page_number}]`,
          )
        : "";
    });

  return (
    <div className="civic-rag-markdown">
      <Markdown
        components={{
          a: ({ href, children, node, ...props }) => {
            void node;
            if (href?.startsWith(CIVIC_CITATION_URL_PREFIX)) {
              const marker = decodeURIComponent(href.slice(CIVIC_CITATION_URL_PREFIX.length));
              const citation = citationForMarker(citations, marker);
              if (!citation) return null;
              const label = citationChipLabel(citation);
              return (
                <button
                  aria-label={`출처 ${label} 열기`}
                  className="civic-citation-chip"
                  onClick={onOpenCitation ? () => onOpenCitation(citation) : undefined}
                  title={label}
                  type="button"
                >
                  <CitationDocumentIcon />
                  <span className="civic-citation-chip-title">{citation.title ?? "문서"}</span>
                  <span>p.{citation.page_number}</span>
                </button>
              );
            }
            return (
              <a {...props} href={href} rel="noopener noreferrer" target="_blank">
                {children}
              </a>
            );
          },
          table: ({ children, node, ...props }) => {
            void node;
            return (
              <div className="civic-rag-table-scroll">
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) =>
          url.startsWith(CIVIC_CITATION_URL_PREFIX) ? url : defaultUrlTransform(url)
        }
      >
        {markdown}
      </Markdown>
    </div>
  );
});

function citationMarkdownLink(citations: readonly Citation[], marker: string): string {
  if (!citationForMarker(citations, marker)) return "";
  return `[citation](${CIVIC_CITATION_URL_PREFIX}${encodeURIComponent(marker)})`;
}

function citationMarkdownLinksForGroup(citations: readonly Citation[], group: string): string {
  const links = Array.from(group.matchAll(CITATION_REFERENCE_PATTERN), (match) =>
    citationMarkdownLink(citations, `[${match[1]}#${match[2]}]`),
  ).filter((link, index, all) => link.length > 0 && all.indexOf(link) === index);
  return links.join(" ");
}

function CitationDocumentIcon() {
  return (
    <svg aria-hidden="true" className="civic-citation-chip-icon" fill="none" viewBox="0 0 16 16">
      <path
        d="M4 1.75h5.1L12.75 5.4v8.85H4z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path d="M9 1.75V5.5h3.75" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
      <path d="M6 8.4h4.75M6 10.9h4.75" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
