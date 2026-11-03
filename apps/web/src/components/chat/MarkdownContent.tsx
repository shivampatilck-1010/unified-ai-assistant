import React, { useState } from 'react';
import { ImageGenerationCard } from './ImageGenerationCard';
import { FileAttachmentCard } from './FileAttachmentCard';
import './MarkdownContent.css';

interface MarkdownContentProps {
  content: string;
  isError?: boolean;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, isError }) => {
  // If this message content is an unsanitized raw Python/JSON error payload, clean it up
  const cleanContent = React.useMemo(() => {
    if (!content) return '';

    // Detect raw Google API / RPC resource exhausted dictionary
    if (
      content.includes('RESOURCE_EXHAUSTED') ||
      content.includes("'status': 'RESOURCE_EXHAUSTED'") ||
      content.includes('Quota exceeded') ||
      content.includes('generate_content_free_tier_requests')
    ) {
      const timeMatch = content.match(/retry in\s+([0-9a-zA-Z.]+)/i) || content.match(/retryDelay['":\s]+([0-9a-zA-Z.]+)/i);
      const modelMatch = content.match(/model:\s*([a-zA-Z0-9.-]+)/i) || content.match(/['"]model['"]:\s*['"]([a-zA-Z0-9.-]+)['"]/i);
      const modelName = modelMatch ? modelMatch[1] : 'Gemini';

      let timeHint = '';
      if (timeMatch) {
        const rawTime = timeMatch[1].replace(/([0-9]+)\.[0-9]+s/, '$1s');
        if (/^\d+s$/.test(rawTime)) {
          const totalSec = parseInt(rawTime, 10);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          timeHint = ` The quota resets in approximately ${h > 0 ? `${h}h ` : ''}${m}m.`;
        } else {
          timeHint = ` The quota resets in approximately ${rawTime}.`;
        }
      }

      return `**Daily Quota Limit Reached**\n\nThe free-tier usage limit for **${modelName}** has been reached for today.${timeHint}\n\n*Tip:* You can select another configured model from the dropdown above to continue immediately.`;
    }

    return content;
  }, [content]);

  // Code Block Component with Copy Button
  const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
    const [copied, setCopied] = useState<boolean>(false);

    const handleCopy = () => {
      void navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-lang">{language || 'code'}</span>
          <button type="button" className="code-copy-btn" onClick={handleCopy} title="Copy to clipboard">
            {copied ? (
              <span className="code-copy-success">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5l-7 7L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied!
              </span>
            ) : (
              <span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Copy
              </span>
            )}
          </button>
        </div>
        <pre className="code-block-pre">
          <code>{code}</code>
        </pre>
      </div>
    );
  };

  // Helper to format inline markdown (bold, italic, inline code, links)
  const formatInline = (text: string): React.ReactNode[] => {
    // Split by inline code first: `code`
    const parts = text.split(/(`[^`]+`)/g);

    return parts.map((part, pIdx) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code key={pIdx} className="inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }

      // Format bold and italics inside this segment
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return (
        <React.Fragment key={pIdx}>
          {boldParts.map((bPart, bIdx) => {
            if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
              return <strong key={bIdx}>{bPart.slice(2, -2)}</strong>;
            }

            // Format *italic*
            const italicParts = bPart.split(/(\*[^*]+\*)/g);
            return (
              <React.Fragment key={bIdx}>
                {italicParts.map((iPart, iIdx) => {
                  if (iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2) {
                    return <em key={iIdx}>{iPart.slice(1, -1)}</em>;
                  }
                  return iPart;
                })}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    });
  };

  // Parse lines into blocks
  const parseBlocks = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];
    let listItems: string[] = [];
    let isOrderedList = false;
    let autoDetectedFile: string | null = null;

    const flushList = () => {
      if (listItems.length === 0) return;
      if (isOrderedList) {
        nodes.push(
          <ol key={`ol-${nodes.length}`} className="md-ordered-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{formatInline(item)}</li>
            ))}
          </ol>
        );
      } else {
        nodes.push(
          <ul key={`ul-${nodes.length}`} className="md-bullet-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{formatInline(item)}</li>
            ))}
          </ul>
        );
      }
      listItems = [];
    };

    // Check for auto-detected file mentions like "exported in INT335_P24_chat_export.md" or "saved to report.md"
    const fileMentionMatch = text.match(/(?:exported\s+(?:in|to)|saved\s+(?:in|to)|created\s+(?:file|doc(?:ument)?)|file:?)\s+([a-zA-Z0-9_\-\.]+\.(?:md|pdf|docx|csv|xlsx|txt|py|json|html))\b/i);
    if (fileMentionMatch && !text.includes('file-card:')) {
      autoDetectedFile = fileMentionMatch[1];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block start / end
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          flushList();
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
          codeLines = [];
        } else {
          inCodeBlock = false;
          nodes.push(
            <CodeBlock
              key={`code-${nodes.length}`}
              language={codeLanguage}
              code={codeLines.join('\n')}
            />
          );
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Check lists
      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        if (isOrderedList) flushList();
        isOrderedList = false;
        listItems.push(bulletMatch[1]);
        continue;
      }

      const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
      if (orderedMatch) {
        if (!isOrderedList) flushList();
        isOrderedList = true;
        listItems.push(orderedMatch[1]);
        continue;
      }

      // Flush any active list if we hit non-list line
      flushList();

      // Explicit File card comment: <!-- file-card: filename | type | url -->
      const fileCardMatch = line.trim().match(/<!--\s*file-card:\s*([^|]+)(?:\|([^|]*))?(?:\|(.*))?\s*-->/);
      if (fileCardMatch) {
        nodes.push(
          <FileAttachmentCard
            key={`file-${nodes.length}`}
            filename={fileCardMatch[1].trim()}
            filetype={fileCardMatch[2]?.trim()}
            downloadUrl={fileCardMatch[3]?.trim()}
          />
        );
        autoDetectedFile = null; // Suppress auto detection if explicit card exists
        continue;
      }

      // Standalone file link line: [filename.ext](url)
      const fileLinkMatch = line.trim().match(/^\[([a-zA-Z0-9_\-\s]+\.(?:md|pdf|docx|csv|xlsx|txt|json))\]\(([^\s)]+)\)$/i);
      if (fileLinkMatch) {
        nodes.push(
          <FileAttachmentCard
            key={`file-${nodes.length}`}
            filename={fileLinkMatch[1].trim()}
            downloadUrl={fileLinkMatch[2].trim()}
          />
        );
        autoDetectedFile = null;
        continue;
      }

      // Markdown standalone image: ![alt](url) -> rendered via high-end ImageGenerationCard
      const imgMatch = line.trim().match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
      if (imgMatch) {
        nodes.push(
          <ImageGenerationCard
            key={`img-${nodes.length}`}
            src={imgMatch[2]}
            alt={imgMatch[1] || 'AI Generated Image'}
          />
        );
        continue;
      }

      // Inline image inside line
      const inlineImgMatch = line.match(/!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
      if (inlineImgMatch && line.trim().startsWith('![')) {
        nodes.push(
          <ImageGenerationCard
            key={`img-${nodes.length}`}
            src={inlineImgMatch[2]}
            alt={inlineImgMatch[1] || 'AI Generated Image'}
          />
        );
        continue;
      }

      // Headers
      if (line.startsWith('### ')) {
        nodes.push(<h4 key={`h4-${nodes.length}`} className="md-h4">{formatInline(line.slice(4))}</h4>);
      } else if (line.startsWith('## ')) {
        nodes.push(<h3 key={`h3-${nodes.length}`} className="md-h3">{formatInline(line.slice(3))}</h3>);
      } else if (line.startsWith('# ')) {
        nodes.push(<h2 key={`h2-${nodes.length}`} className="md-h2">{formatInline(line.slice(2))}</h2>);
      } else if (line.startsWith('> ')) {
        nodes.push(
          <blockquote key={`bq-${nodes.length}`} className="md-blockquote">
            {formatInline(line.slice(2))}
          </blockquote>
        );
      } else if (line.trim() === '') {
        nodes.push(<div key={`br-${nodes.length}`} className="md-spacer" />);
      } else {
        nodes.push(
          <p key={`p-${nodes.length}`} className="md-paragraph">
            {formatInline(line)}
          </p>
        );
      }
    }

    // Flush any remaining code blocks or lists
    if (inCodeBlock) {
      nodes.push(
        <CodeBlock
          key={`code-${nodes.length}`}
          language={codeLanguage}
          code={codeLines.join('\n')}
        />
      );
    }
    flushList();

    // If an exported/shared file was mentioned in the text, append the matching FileAttachmentCard at the bottom
    if (autoDetectedFile) {
      nodes.push(
        <FileAttachmentCard
          key={`autofile-${nodes.length}`}
          filename={autoDetectedFile}
        />
      );
    }

    return nodes;
  };

  return (
    <div className={`markdown-body ${isError ? 'markdown-error' : ''}`}>
      {parseBlocks(cleanContent)}
    </div>
  );
};
