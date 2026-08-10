/**
 * Minimal Markdown renderer that emits React elements.
 *
 * This deliberately avoids `dangerouslySetInnerHTML` entirely. Content from the
 * database (policy text, changelog entries, forum posts) is parsed into React
 * nodes, so an injected `<script>` or `onerror` attribute is rendered as literal
 * text rather than executed. That property is what makes user-supplied Markdown
 * safe to display without a sanitiser dependency.
 *
 * Supported: headings, paragraphs, bold, italic, inline code, links (http/https
 * and mailto only), unordered and ordered lists, blockquotes, tables, rules.
 */
import type { ReactNode } from "react";

interface InlineToken {
  type: "text" | "bold" | "italic" | "code" | "link";
  value: string;
  href?: string;
}

/** Only these schemes may appear in an anchor; everything else renders as text. */
function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  return /^(https?:\/\/|mailto:)/i.test(trimmed);
}

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: code first so its contents are not re-parsed.
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const [raw] = match;
    if (raw.startsWith("`")) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("**")) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*")) {
      tokens.push({ type: "italic", value: raw.slice(1, -1) });
    } else if (raw.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(raw);
      if (linkMatch && isSafeHref(linkMatch[2]!)) {
        tokens.push({ type: "link", value: linkMatch[1]!, href: linkMatch[2]! });
      } else {
        tokens.push({ type: "text", value: raw });
      }
    } else if (isSafeHref(raw)) {
      tokens.push({ type: "link", value: raw, href: raw });
    } else {
      tokens.push({ type: "text", value: raw });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.type) {
      case "bold":
        return <strong key={key}>{token.value}</strong>;
      case "italic":
        return <em key={key}>{token.value}</em>;
      case "code":
        return (
          <code key={key} className="rounded bg-surface-sunken px-1 py-0.5 text-[0.9em]">
            {token.value}
          </code>
        );
      case "link": {
        const external = /^https?:\/\//i.test(token.href ?? "");
        return (
          <a
            key={key}
            href={token.href}
            {...(external
              ? // noreferrer also prevents the target learning the source URL.
                { target: "_blank", rel: "noopener noreferrer nofollow" }
              : {})}
          >
            {token.value}
          </a>
        );
      }
      default:
        return <span key={key}>{token.value}</span>;
    }
  });
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push(<hr key={`hr-${key++}`} />);
      index += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const content = renderInline(heading[2]!, `h-${key}`);
      const Tag = `h${Math.min(level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
      nodes.push(<Tag key={`h-${key++}`}>{content}</Tag>);
      index += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
        quoted.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(
        <blockquote key={`bq-${key++}`}>{renderInline(quoted.join(" "), `bq-${key}`)}</blockquote>,
      );
      continue;
    }

    // Table: a header row followed by a separator row.
    if (line.includes("|") && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[index + 1] ?? "")) {
      const header = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      nodes.push(
        <div key={`table-${key++}`} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex} scope="col">
                    {renderInline(cell, `th-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, `td-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${key++}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `li-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${key++}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `oli-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: consume until a blank line or a block-level marker.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim() === "" ||
        /^(#{1,6})\s/.test(current) ||
        current.startsWith(">") ||
        /^\s*[-*+]\s+/.test(current) ||
        /^\s*\d+[.)]\s+/.test(current) ||
        /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    if (paragraph.length > 0) {
      nodes.push(<p key={`p-${key++}`}>{renderInline(paragraph.join(" "), `p-${key}`)}</p>);
    }
  }

  return nodes;
}

interface MarkdownProps {
  source: string;
  className?: string;
}

export function Markdown({ source, className }: MarkdownProps) {
  return <div className={className ?? "prose-rp"}>{renderMarkdown(source)}</div>;
}
