/**
 * A tiny hand-written markdown -> React converter (no library).
 * Supports: ATX headings, paragraphs, **bold**, *italic*, `code`, fenced code
 * blocks, [links](url), bullet and numbered lists, blockquotes, horizontal
 * rules and inline HTML comments (stripped). Everything else is plain text.
 */
import { Fragment, createElement, type ReactNode } from "react";
import { actions } from "../state/store";

export interface MarkdownProps {
  source: string;
  /** Hide links (spoiler-free); the link text is still shown. */
  hideLinks?: boolean;
  className?: string;
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

function parseBlocks(src: string): Block[] {
  const text = src.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const number = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || number.test(line)) {
      const ordered = number.test(line);
      const re = ordered ? number : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i].replace(re, "");
        i++;
        // continuation lines (indented)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) item += " " + lines[i++].trim();
        items.push(item);
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !number.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    )
      buf.push(lines[i++]);
    blocks.push({ kind: "paragraph", text: buf.join("\n") });
  }
  return blocks;
}

// Underscore emphasis is deliberately unsupported: mod file names are full of underscores.
const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*|<https?:\/\/[^>]+>|https?:\/\/[^\s<>()]+)/g;

export function renderInline(text: string, hideLinks = false): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const parts = t.split("\n");
    parts.forEach((p, idx) => {
      out.push(<Fragment key={key++}>{p}</Fragment>);
      if (idx < parts.length - 1) out.push(<br key={key++} />);
    });
  };
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index ?? 0;
    pushText(text.slice(last, start));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={key++}>{renderInline(tok.slice(2, -2), hideLinks)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(<MdLink key={key++} href={mm[2]} hide={hideLinks}>{renderInline(mm[1], hideLinks)}</MdLink>);
    } else if (tok.startsWith("<")) {
      const url = tok.slice(1, -1);
      out.push(<MdLink key={key++} href={url} hide={hideLinks}>{url}</MdLink>);
    } else if (tok.startsWith("http")) {
      out.push(<MdLink key={key++} href={tok} hide={hideLinks}>{tok}</MdLink>);
    } else {
      out.push(<em key={key++}>{renderInline(tok.slice(1, -1), hideLinks)}</em>);
    }
    last = start + tok.length;
  }
  pushText(text.slice(last));
  return out;
}

function MdLink({ href, hide, children }: { href: string; hide: boolean; children: ReactNode }) {
  if (hide) return <span className="md-link-hidden" title="Links hidden in spoiler-free mode">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => {
        if (window.modsync?.openExternal) {
          e.preventDefault();
          void actions.openExternal(href);
        }
      }}
    >
      {children}
    </a>
  );
}

export function Markdown({ source, hideLinks = false, className }: MarkdownProps) {
  const blocks = parseBlocks(source ?? "");
  return (
    <div className={`markdown ${className ?? ""}`}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading": {
            return createElement(`h${Math.min(6, b.level)}`, { key: i }, ...renderInline(b.text, hideLinks));
          }
          case "paragraph":
            return <p key={i}>{renderInline(b.text, hideLinks)}</p>;
          case "code":
            return (
              <pre key={i}>
                <code>{b.text}</code>
              </pre>
            );
          case "list":
            return b.ordered ? (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, hideLinks)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, hideLinks)}</li>
                ))}
              </ul>
            );
          case "quote":
            return <blockquote key={i}>{renderInline(b.text, hideLinks)}</blockquote>;
          case "hr":
            return <hr key={i} />;
        }
      })}
    </div>
  );
}
