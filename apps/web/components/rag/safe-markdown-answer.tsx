import { Fragment, memo, type ReactNode } from "react";

export const SafeMarkdownAnswer = memo(function SafeMarkdownAnswer({
  answer,
}: Readonly<{ answer: string }>) {
  const lines = answer.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
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
      const content = inlineMarkdown(heading[2] ?? "");
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
        items.push(<li key={`unordered-${index}`}>{inlineMarkdown(item)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`unordered-list-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index]?.trim() ?? "")) {
        const item = (lines[index]?.trim() ?? "").replace(/^\d+[.)]\s+/, "");
        items.push(<li key={`ordered-${index}`}>{inlineMarkdown(item)}</li>);
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
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }

  return <div className="civic-rag-markdown">{blocks}</div>;
});

function inlineMarkdown(source: string): ReactNode[] {
  return source
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`strong-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={`code-${index}`}>{part.slice(1, -1)}</code>;
      }
      return <Fragment key={`text-${index}`}>{part}</Fragment>;
    });
}
