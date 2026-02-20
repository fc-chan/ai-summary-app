'use client';

interface MarkdownProps {
  content: string;
}

/** Minimal markdown renderer: bold, bullet lists, headings, paragraphs */
export default function MarkdownRenderer({ content }: MarkdownProps) {
  const lines = content.split('\n');

  return (
    <div className="prose prose-sm max-w-none text-gray-800 space-y-1">
      {lines.map((line, i) => {
        // Heading ##
        if (/^###\s/.test(line))
          return <h3 key={i} className="text-sm font-bold text-gray-900 mt-3 mb-1">{line.replace(/^###\s/, '')}</h3>;
        if (/^##\s/.test(line))
          return <h2 key={i} className="text-base font-bold text-gray-900 mt-4 mb-1">{line.replace(/^##\s/, '')}</h2>;
        if (/^#\s/.test(line))
          return <h1 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-1">{line.replace(/^#\s/, '')}</h1>;
        // Bullet
        if (/^[-*]\s/.test(line))
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-blue-500 mt-0.5">•</span>
              <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
            </div>
          );
        // Empty line
        if (line.trim() === '') return <div key={i} className="h-1" />;
        // Paragraph
        return <p key={i} className="leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}
