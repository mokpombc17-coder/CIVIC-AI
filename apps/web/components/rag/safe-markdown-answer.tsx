import { memo } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "./rag-conversation-session";

const CITATION_MARKER_PATTERN =
  /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})#([1-9][0-9]*)\]/giu;
const CITATION_REFERENCE_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})#([1-9][0-9]*)/giu;
const CITATION_REFERENCE_GROUP_PATTERN =
  /\[[^\]\r\n]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#[1-9][0-9]*[^\]\r\n]*\]/giu;
const CITATION_REFERENCE_SEQUENCE_PATTERN = new RegExp(
  `${CITATION_REFERENCE_GROUP_PATTERN.source}(?:(?:[\\t ]*,[\\t ]*|[\\t ]+)${CITATION_REFERENCE_GROUP_PATTERN.source})*`,
  "giu",
);
const CITATION_SEQUENCE_WITH_TRAILING_PERIOD_PATTERN = new RegExp(
  `([\\t ]+)(${CITATION_REFERENCE_SEQUENCE_PATTERN.source})\\.`,
  "giu",
);
const LEGACY_CITATION_MARKER_PATTERN =
  /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/giu;
const CITATION_TOKEN_PATTERN = new RegExp(
  `${CITATION_REFERENCE_GROUP_PATTERN.source}|${LEGACY_CITATION_MARKER_PATTERN.source}`,
  "giu",
);
const CIVIC_CITATION_URL_PREFIX = "civic-citation:";
const VISIBLE_CITATION_COUNT = 2;
const DISPLAY_FILE_EXTENSION_PATTERN =
  /\.(?:bmp|csv|doc|docx|gif|hwp|hwpx|jpe?g|md|ods|pdf|png|ppt|pptx|tiff?|txt|webp|xls|xlsx)$/iu;

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

/** 출처 목록에서는 원본 파일 확장자를 숨기되 원본 인용 정보는 변경하지 않는다. */
export function citationDisplayTitle(citation: Citation): string {
  const title = citation.title?.trim() || "문서";
  return title.replace(DISPLAY_FILE_EXTENSION_PATTERN, "").trim() || "문서";
}

type NumberedCitation = Readonly<{
  citation: Citation;
  number: number;
}>;

function citationKey(citation: Citation): string {
  return `${citation.document_version_id.toLowerCase()}#${citation.page_number}`;
}

/** 답변에 처음 등장한 순서대로 출처 번호를 부여하고 같은 문서·페이지는 같은 번호를 쓴다. */
function numberedCitationsForAnswer(
  answer: string,
  citations: readonly Citation[],
): readonly NumberedCitation[] {
  const numbered: NumberedCitation[] = [];
  const seen = new Set<string>();

  const addCitation = (citation: Citation) => {
    const key = citationKey(citation);
    if (seen.has(key)) return;
    seen.add(key);
    numbered.push({ citation, number: numbered.length + 1 });
  };

  for (const tokenMatch of answer.matchAll(CITATION_TOKEN_PATTERN)) {
    const token = tokenMatch[0];
    const references = Array.from(token.matchAll(CITATION_REFERENCE_PATTERN));
    if (references.length > 0) {
      for (const reference of references) {
        const marker = `[${reference[1]}#${reference[2]}]`;
        const citation = citationForMarker(citations, marker);
        if (citation) addCitation(citation);
      }
      continue;
    }

    const legacyMatch = new RegExp(`^${LEGACY_CITATION_MARKER_PATTERN.source}$`, "iu").exec(token);
    const versionId = legacyMatch?.[1];
    if (!versionId) continue;
    const matches = citations.filter(
      (citation) => citation.document_version_id.toLowerCase() === versionId.toLowerCase(),
    );
    const citation = matches.length === 1 ? matches[0] : undefined;
    if (citation) addCitation(citation);
  }

  return numbered;
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
  const numberedCitations = numberedCitationsForAnswer(answer, citations);
  const citationNumbers = new Map(
    numberedCitations.map(({ citation, number }) => [citationKey(citation), number] as const),
  );
  const markdown = normalizeKoreanStrongEmphasis(normalizeCitationPunctuation(answer))
    .replace(CITATION_REFERENCE_SEQUENCE_PATTERN, (sequence) =>
      citationMarkdownLinksForGroup(citations, sequence, citationNumbers),
    )
    .replace(LEGACY_CITATION_MARKER_PATTERN, (marker, versionId: string) => {
      const matches = citations.filter(
        (citation) => citation.document_version_id.toLowerCase() === versionId.toLowerCase(),
      );
      return matches.length === 1
        ? citationMarkdownLink(
            citations,
            `[${matches[0]?.document_version_id}#${matches[0]?.page_number}]`,
            citationNumbers,
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
              const referenceNumber = citationNumbers.get(citationKey(citation));
              if (!referenceNumber) return null;
              return (
                <button
                  aria-label={`출처 ${referenceNumber}, ${label} 열기`}
                  className="civic-citation-reference"
                  onClick={onOpenCitation ? () => onOpenCitation(citation) : undefined}
                  title={label}
                  type="button"
                >
                  [{referenceNumber}]
                </button>
              );
            }
            return (
              <a {...props} href={href} rel="noopener noreferrer" target="_blank">
                {children}
              </a>
            );
          },
          hr: () => null,
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

type RagCitationSourcesProps = Readonly<{
  answer: string;
  citations: readonly Citation[];
  onOpenCitation?: (citation: Citation) => void;
}>;

export const RagCitationSources = memo(function RagCitationSources({
  answer,
  citations,
  onOpenCitation,
}: RagCitationSourcesProps) {
  const numberedCitations = numberedCitationsForAnswer(answer, citations);
  if (numberedCitations.length === 0) return null;
  const visibleCitations = numberedCitations.slice(0, VISIBLE_CITATION_COUNT);
  const additionalCitations = numberedCitations.slice(VISIBLE_CITATION_COUNT);

  return (
    <section aria-label="답변 출처" className="civic-rag-source-list">
      <h4>출처</h4>
      <ol>
        {visibleCitations.map(({ citation, number }) => (
          <RagCitationSourceItem
            citation={citation}
            key={citationKey(citation)}
            number={number}
            onOpenCitation={onOpenCitation}
          />
        ))}
      </ol>
      {additionalCitations.length > 0 ? (
        <details className="civic-rag-source-more">
          <summary>
            <span className="civic-rag-source-more-label">
              출처 {additionalCitations.length}개 더보기
            </span>
            <span className="civic-rag-source-less-label">출처 접기</span>
          </summary>
          <ol>
            {additionalCitations.map(({ citation, number }) => (
              <RagCitationSourceItem
                citation={citation}
                key={citationKey(citation)}
                number={number}
                onOpenCitation={onOpenCitation}
              />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
});

function RagCitationSourceItem({
  citation,
  number,
  onOpenCitation,
}: Readonly<{
  citation: Citation;
  number: number;
  onOpenCitation: ((citation: Citation) => void) | undefined;
}>) {
  const displayTitle = citationDisplayTitle(citation);
  return (
    <li>
      <button
        aria-label={`출처 ${number}, ${displayTitle} p.${citation.page_number} 열기`}
        className="civic-rag-source-item"
        onClick={onOpenCitation ? () => onOpenCitation(citation) : undefined}
        title={citationChipLabel(citation)}
        type="button"
      >
        <span aria-hidden="true" className="civic-rag-source-number">
          [{number}]
        </span>
        <span className="civic-rag-source-copy">
          <span className="civic-rag-source-title">{displayTitle}</span>
          <span className="civic-rag-source-page">p.{citation.page_number}</span>
        </span>
      </button>
    </li>
  );
}

function citationMarkdownLink(
  citations: readonly Citation[],
  marker: string,
  citationNumbers: ReadonlyMap<string, number>,
): string {
  const citation = citationForMarker(citations, marker);
  if (!citation || !citationNumbers.has(citationKey(citation))) return "";
  return `[citation](${CIVIC_CITATION_URL_PREFIX}${encodeURIComponent(marker)})`;
}

function citationMarkdownLinksForGroup(
  citations: readonly Citation[],
  group: string,
  citationNumbers: ReadonlyMap<string, number>,
): string {
  const seen = new Set<string>();
  const links = Array.from(group.matchAll(CITATION_REFERENCE_PATTERN), (match) => {
    const marker = `[${match[1]}#${match[2]}]`;
    const citation = citationForMarker(citations, marker);
    if (!citation || seen.has(citationKey(citation))) return "";
    seen.add(citationKey(citation));
    return citationMarkdownLink(citations, marker, citationNumbers);
  }).filter((link) => link.length > 0);
  return links.join("");
}
