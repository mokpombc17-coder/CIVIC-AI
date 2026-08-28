import { Fragment, memo, type ReactNode } from "react";
import type { Citation } from "./participant-rag-screen";

const CITATION_MARKER_PATTERN =
  /\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/giu;

/** 답변 본문에 섞여 오는 내부 인용 마커([UUID])를 제거한다. 칩으로 치환하지 못한 잔여분 정리에 사용한다. */
export function stripCitationMarkers(answer: string): string {
  return answer.replace(CITATION_MARKER_PATTERN, "").replace(/[ \t]{2,}/gu, " ");
}

/** 마커의 UUID(document_version_id)로 인용 정보를 찾는다. */
export function citationForMarker(citations: readonly Citation[], marker: string): Citation | null {
  const versionId = marker.slice(1, -1).toLowerCase();
  return (
    citations.find((citation) => citation.document_version_id.toLowerCase() === versionId) ?? null
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
  const renderInline = (source: string, keyPrefix: string) =>
    inlineMarkdown(source, keyPrefix, citations, onOpenCitation);
  // 인용 목록에 없는 마커는 앞 공백까지 제거해 문장 부호가 어색하게 남지 않게 한다.
  const cleaned = answer.replace(
    /[ \t]*(\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\])/giu,
    (_, marker: string) => (citationForMarker(citations, marker) ? ` ${marker}` : ""),
  );
  const lines = cleaned.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) {
      const content = renderInline(heading[2] ?? "", `heading-${index}`);
      blocks.push(
        heading[1]?.length === 2 ? (
          <h2 key={`heading-${index}`}>{content}</h2>
        ) : (
          <h3 key={`heading-${index}`}>{content}</h3>
        ),
      );
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) {
        const item = (lines[index]?.trim() ?? "").replace(/^[-*]\s+/, "");
        items.push(<li key={`unordered-${index}`}>{renderInline(item, `unordered-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`unordered-list-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index]?.trim() ?? "")) {
        const item = (lines[index]?.trim() ?? "").replace(/^\d+[.)]\s+/, "");
        items.push(<li key={`ordered-${index}`}>{renderInline(item, `ordered-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ordered-list-${index}`}>{items}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index]?.trim() ?? "";
      if (!next || /^(?:#{2,4}\s+|[-*]\s+|\d+[.)]\s+)/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>{renderInline(paragraph.join(" "), `paragraph-${index}`)}</p>,
    );
  }

  return <div className="civic-rag-markdown">{blocks}</div>;
});

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

function inlineMarkdown(
  source: string,
  keyPrefix: string,
  citations: readonly Citation[],
  onOpenCitation: ((citation: Citation) => void) | undefined,
): ReactNode[] {
  return source
    .split(
      /(\*\*[^*]+\*\*|`[^`]+`|\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\])/giu,
    )
    .filter(Boolean)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      if (new RegExp(`^${CITATION_MARKER_PATTERN.source}$`, "iu").test(part)) {
        const citation = citationForMarker(citations, part);
        // 인용 목록에서 찾지 못한 마커는 본문에 노출하지 않는다.
        if (!citation) return <Fragment key={key} />;
        const label = citationChipLabel(citation);
        return (
          <button
            aria-label={`출처 ${label} 열기`}
            className="civic-citation-chip"
            key={key}
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
      return <Fragment key={key}>{part}</Fragment>;
    });
}
