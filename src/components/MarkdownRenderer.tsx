import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  // Parse **bold**, *italic*, and `code` safely into React nodes
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={idx} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const ListTag = isOrdered ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${listKey++}`}
        className={`my-2 space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 ${
          isOrdered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {listItems.map((item, idx) => (
          <li key={idx} className="pl-1">
            {renderInline(item.text)}
          </li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    if (line.startsWith('### ')) {
      flushList();
      blocks.push(
        <h3
          key={`h3-${idx}`}
          className="mt-4 mb-1.5 font-display text-sm font-semibold tracking-tight text-slate-900 first:mt-0"
        >
          {renderInline(line.slice(4))}
        </h3>
      );
      return;
    }

    if (line.startsWith('## ')) {
      flushList();
      blocks.push(
        <h2
          key={`h2-${idx}`}
          className="mt-4 mb-2 font-display text-base font-semibold tracking-tight text-slate-900 first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
      return;
    }

    if (line.startsWith('# ')) {
      flushList();
      blocks.push(
        <h1
          key={`h1-${idx}`}
          className="mt-4 mb-2 font-display text-lg font-bold tracking-tight text-slate-900 first:mt-0"
        >
          {renderInline(line.slice(2))}
        </h1>
      );
      return;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList();
      listItems.push({ ordered: false, text: bulletMatch[1] });
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList();
      listItems.push({ ordered: true, text: orderedMatch[1] });
      return;
    }

    flushList();
    blocks.push(
      <p key={`p-${idx}`} className="my-2 text-sm leading-relaxed text-slate-700 first:mt-0 last:mb-0">
        {renderInline(line)}
      </p>
    );
  });

  flushList();

  return <div className={className}>{blocks}</div>;
};
