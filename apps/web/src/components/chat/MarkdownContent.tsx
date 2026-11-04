import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { ImageGenerationCard } from './ImageGenerationCard';
import { FileAttachmentCard } from './FileAttachmentCard';
import { PromptFlashcard } from './PromptFlashcard';
import { InteractiveSimulationCard } from './InteractiveSimulationCard';
import { highlightCode } from '../../utils/syntaxHighlighter';
import './MarkdownContent.css';

// Initialize Mermaid once with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    darkMode: true,
    background: '#13151c',
    primaryColor: '#3b82f6',
    primaryTextColor: '#f3f4f6',
    primaryBorderColor: '#60a5fa',
    lineColor: '#94a3b8',
    secondaryColor: '#1e222d',
    tertiaryColor: '#181b24',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
});

interface MarkdownContentProps {
  content: string;
  isError?: boolean;
}

// Mermaid Diagram Component with Live Render & Action Controls
const MermaidDiagram: React.FC<{ code: string }> = ({ code }) => {
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const containerId = useRef<string>(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        const cleanChart = code.trim();
        const { svg } = await mermaid.render(containerId.current, cleanChart);
        if (isMounted) {
          setSvgHtml(svg);
          setRenderError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setRenderError(err instanceof Error ? err.message : 'Invalid Mermaid syntax');
        }
      }
    };
    void renderChart();
    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${containerId.current}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (renderError) {
    return (
      <div className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-lang">diagram (syntax fallback)</span>
          <button type="button" className="code-copy-btn" onClick={handleCopyCode}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="code-block-pre">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="mermaid-diagram-container">
      <div className="mermaid-diagram-header">
        <div className="mermaid-diagram-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>DIAGRAM</span>
        </div>
        <div className="mermaid-diagram-actions">
          <button type="button" className="mermaid-tool-btn" onClick={handleDownloadSvg} title="Download SVG">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>SVG</span>
          </button>
          <button type="button" className="mermaid-tool-btn" onClick={handleCopyCode} title="Copy diagram code">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div
        className="mermaid-svg-viewport"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>
  );
};

// KaTeX Block Math Component
const KaTeXBlock: React.FC<{ math: string }> = ({ math }) => {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  }, [math]);

  if (!html) {
    return <div className="katex-fallback"><code>{math}</code></div>;
  }

  return (
    <div
      className="katex-display-container"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// KaTeX Inline Math Component
const KaTeXInline: React.FC<{ math: string }> = ({ math }) => {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  }, [math]);

  if (!html) {
    return <code className="inline-code">{math}</code>;
  }

  return (
    <span
      className="katex-inline-container"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, isError }) => {
  // Clean raw quota errors
  const cleanContent = React.useMemo(() => {
    if (!content) return '';

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

  // Code Block Component with Copy Button, Syntax Highlighting & Simulation Sandbox
  const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
    const [copied, setCopied] = useState<boolean>(false);
    const lowerLang = (language || '').toLowerCase().trim();

    if (lowerLang === 'mermaid') {
      return <MermaidDiagram code={code} />;
    }

    if (
      lowerLang === 'interactive-simulation' ||
      lowerLang === 'simulation' ||
      lowerLang === 'visual' ||
      lowerLang === 'interactive' ||
      lowerLang === 'atomic-collision' ||
      lowerLang === 'atoms' ||
      lowerLang === 'binary-tree' ||
      lowerLang === 'tree-visualizer' ||
      lowerLang === 'generative-ui' ||
      (lowerLang === 'html' && (code.includes('<canvas') || code.includes('requestAnimationFrame') || code.includes('<script')))
    ) {
      let simType: 'atomic-collision' | 'binary-tree' | 'sorting' | 'custom-html' = 'atomic-collision';
      if (lowerLang.includes('tree') || code.includes('BinarySearchTree') || code.includes('TreeNode') || code.includes('binary-tree')) {
        simType = 'binary-tree';
      } else if (lowerLang.includes('sort') || code.includes('bubbleSort')) {
        simType = 'sorting';
      } else if (lowerLang === 'html' || code.includes('<canvas') || code.includes('<script')) {
        simType = 'custom-html';
      }
      return <InteractiveSimulationCard type={simType} code={code} />;
    }

    const handleCopy = () => {
      void navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const highlighted = React.useMemo(() => {
      return highlightCode(code, language);
    }, [code, language]);

    return (
      <div className="code-block-container">
        <div className="code-block-header">
          <span className="code-block-lang">{highlighted.language || language || 'code'}</span>
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
          <code
            className={`language-${highlighted.language}`}
            dangerouslySetInnerHTML={{ __html: highlighted.html }}
          />
        </pre>
      </div>
    );
  };

  // Helper to format inline markdown, including KaTeX inline math ($...$ and \(...\))
  const formatInline = (text: string): React.ReactNode[] => {
    // 1. Split by inline math: $...$ (ensure not double $$ and not currency like $100)
    // or \( ... \)
    const mathTokenRegex = /(\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)(?:[^\$\n]|\\\$)+?(?<!\$)\$(?!\$))/g;
    const mathSegments = text.split(mathTokenRegex);

    return mathSegments.map((segment, sIdx) => {
      if (!segment) return null;

      // Check if this segment is inline math
      if (segment.startsWith('\\(') && segment.endsWith('\\)')) {
        return <KaTeXInline key={`math-${sIdx}`} math={segment.slice(2, -2)} />;
      }
      if (
        segment.startsWith('$') &&
        segment.endsWith('$') &&
        segment.length > 2 &&
        !/^\$\d+[\d,.]*$/.test(segment)
      ) {
        return <KaTeXInline key={`math-${sIdx}`} math={segment.slice(1, -1)} />;
      }

      // 2. Split by inline code: `code`
      const parts = segment.split(/(`[^`]+`)/g);

      return parts.map((part, pIdx) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={`code-${sIdx}-${pIdx}`} className="inline-code">
              {part.slice(1, -1)}
            </code>
          );
        }

        // 3. Format bold: **bold**
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <React.Fragment key={`bold-${sIdx}-${pIdx}`}>
            {boldParts.map((bPart, bIdx) => {
              if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
                return <strong key={bIdx}>{bPart.slice(2, -2)}</strong>;
              }

              // 4. Format *italic*
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
    });
  };

  // Parse lines into blocks: KaTeX display math, Mermaid diagrams, Tables, and standard elements
  const parseBlocks = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];

    let inMathBlock = false;
    let mathLines: string[] = [];

    let listItems: string[] = [];
    let isOrderedList = false;

    let inTable = false;
    let tableLines: string[] = [];

    let autoDetectedFile: string | null = null;
    let isPreviousLinePromptIntro = false;

    // Visual Simulation Auto-detection
    const hasExplicitSimBlock =
      text.includes('```interactive-simulation') ||
      text.includes('```simulation') ||
      text.includes('```visual') ||
      text.includes('```atomic-collision') ||
      text.includes('```binary-tree');

    const hasAtomicMention =
      !hasExplicitSimBlock &&
      /(?:here['’]?s\s+a\s+simulation\s+of\s+atoms\s+colliding|simulation\s+of\s+atoms\s+colliding|how\s+atoms?\s+collide\s+with\s+visuals|atomic\s+collisions?\s+visual(?:ization|izer)?)/i.test(
        text
      );

    const hasTreeVisualMention =
      !hasExplicitSimBlock &&
      /(?:binary\s+(?:search\s+)?tree\s+visual(?:izer|ization)?|interactive\s+binary\s+(?:search\s+)?tree)/i.test(
        text
      );

    let injectedAtomicSim = false;
    let injectedTreeSim = false;

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

    const flushTable = () => {
      if (tableLines.length === 0) return;
      const rows = tableLines.map((row) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      );

      // Verify at least header and divider rows
      if (rows.length >= 2) {
        const headerCells = rows[0];
        const bodyRows = rows.slice(2);

        nodes.push(
          <div key={`table-wrapper-${nodes.length}`} className="md-table-container">
            <table className="md-table">
              <thead>
                <tr>
                  {headerCells.map((h, hIdx) => (
                    <th key={hIdx}>{formatInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((r, rIdx) => (
                  <tr key={rIdx}>
                    {r.map((cell, cIdx) => (
                      <td key={cIdx}>{formatInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableLines = [];
      inTable = false;
    };

    // Check for auto-detected file mentions
    const fileMentionMatch = text.match(
      /(?:exported\s+(?:in|to)|saved\s+(?:in|to)|created\s+(?:file|doc(?:ument)?)|file:?)\s+([a-zA-Z0-9_\-\.]+\.(?:md|pdf|docx|csv|xlsx|txt|py|json|html))\b/i
    );
    if (fileMentionMatch && !text.includes('file-card:')) {
      autoDetectedFile = fileMentionMatch[1];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Auto-inject visual simulation card right after intro line or before "What you're seeing"
      if (
        hasAtomicMention &&
        !injectedAtomicSim &&
        (line.toLowerCase().includes("what you're seeing") || i === 1 || i === 2)
      ) {
        flushList();
        flushTable();
        nodes.push(
          <InteractiveSimulationCard key={`auto-atomic-sim-${nodes.length}`} type="atomic-collision" />
        );
        injectedAtomicSim = true;
      }
      if (
        hasTreeVisualMention &&
        !injectedTreeSim &&
        (line.toLowerCase().includes('binary') || i === 1 || i === 2)
      ) {
        flushList();
        flushTable();
        nodes.push(
          <InteractiveSimulationCard key={`auto-tree-sim-${nodes.length}`} type="binary-tree" />
        );
        injectedTreeSim = true;
      }

      // 1. Math Display Block: $$ or \[
      if (line.trim().startsWith('$$') || line.trim().startsWith('\\[')) {
        flushList();
        flushTable();
        // Single-line block math: $$ formula $$
        if (
          (line.trim().startsWith('$$') && line.trim().endsWith('$$') && line.trim().length > 4) ||
          (line.trim().startsWith('\\[') && line.trim().endsWith('\\]') && line.trim().length > 4)
        ) {
          const formula = line
            .trim()
            .replace(/^\$\$/, '')
            .replace(/\$\$$/, '')
            .replace(/^\\\[/, '')
            .replace(/\\\]$/, '');
          nodes.push(<KaTeXBlock key={`katex-${nodes.length}`} math={formula} />);
          continue;
        }

        if (!inMathBlock) {
          inMathBlock = true;
          mathLines = [line.trim().replace(/^(\$\$|\\\[)/, '')];
          continue;
        } else {
          inMathBlock = false;
          mathLines.push(line.trim().replace(/(\$\$|\\\])$/, ''));
          nodes.push(<KaTeXBlock key={`katex-${nodes.length}`} math={mathLines.join('\n')} />);
          mathLines = [];
          continue;
        }
      }

      if (inMathBlock) {
        if (line.trim().endsWith('$$') || line.trim().endsWith('\\]')) {
          inMathBlock = false;
          mathLines.push(line.trim().replace(/(\$\$|\\\])$/, ''));
          nodes.push(<KaTeXBlock key={`katex-${nodes.length}`} math={mathLines.join('\n')} />);
          mathLines = [];
        } else {
          mathLines.push(line);
        }
        continue;
      }

      // 2. Code Block: ```
      if (line.trim().startsWith('```')) {
        flushList();
        flushTable();
        if (!inCodeBlock) {
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

      // 3. Markdown Table rows: | col | col |
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        flushList();
        inTable = true;
        tableLines.push(line);
        continue;
      } else if (inTable) {
        flushTable();
      }

      // 4. Lists
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

      flushList();

      // 5. File Card Comment: <!-- file-card: ... -->
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
        autoDetectedFile = null;
        continue;
      }

      // 6. Standalone File Link: [file.ext](url)
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

      // 7. Image Generation Card: ![alt](url)
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

      // 8. Headers & Typography
      if (line.startsWith('#### ')) {
        nodes.push(<h5 key={`h5-${nodes.length}`} className="md-h5">{formatInline(line.slice(5))}</h5>);
      } else if (line.startsWith('### ')) {
        nodes.push(<h4 key={`h4-${nodes.length}`} className="md-h4">{formatInline(line.slice(4))}</h4>);
      } else if (line.startsWith('## ')) {
        nodes.push(<h3 key={`h3-${nodes.length}`} className="md-h3">{formatInline(line.slice(3))}</h3>);
      } else if (line.startsWith('# ')) {
        nodes.push(<h2 key={`h2-${nodes.length}`} className="md-h2">{formatInline(line.slice(2))}</h2>);
      } else if (line.startsWith('> ')) {
        const bqContent = line.slice(2).trim();
        const isPromptLike =
          /^(?:["“]|act as|please act as|i have been studying|prompt|quiz me)/i.test(bqContent) ||
          bqContent.includes('Provide the answers') ||
          isPreviousLinePromptIntro;

        if (isPromptLike) {
          nodes.push(
            <PromptFlashcard
              key={`pf-${nodes.length}`}
              promptText={bqContent}
              title="AI Prompt Flashcard"
              category="Direct Copy"
            />
          );
        } else {
          nodes.push(
            <blockquote key={`bq-${nodes.length}`} className="md-blockquote">
              {formatInline(bqContent)}
            </blockquote>
          );
        }
        isPreviousLinePromptIntro = false;
      } else if (line.trim() === '') {
        nodes.push(<div key={`br-${nodes.length}`} className="md-spacer" />);
      } else {
        const trimmed = line.trim();
        const isPromptIntro =
          /(?:copy\s+and\s+paste\s+this|prompt\s+for\s+your\s+ai|use\s+this\s+prompt|test\s+you|copy\s+this)/i.test(trimmed);

        const isQuotedPrompt =
          ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith('“') && trimmed.endsWith('”'))) &&
          trimmed.length >= 30 &&
          (/\b(?:act as|test my|questions|provide the answers|quiz|explain|prompt|tutor)\b/i.test(trimmed) ||
            isPreviousLinePromptIntro);

        if (isQuotedPrompt) {
          nodes.push(
            <PromptFlashcard
              key={`pf-${nodes.length}`}
              promptText={trimmed}
              title="Interactive Quiz Prompt"
              category="Study Flashcard"
            />
          );
          isPreviousLinePromptIntro = false;
        } else {
          nodes.push(
            <p key={`p-${nodes.length}`} className="md-paragraph">
              {formatInline(line)}
            </p>
          );
          isPreviousLinePromptIntro = isPromptIntro;
        }
      }
    }

    // Flush any pending blocks
    if (inCodeBlock) {
      nodes.push(
        <CodeBlock
          key={`code-${nodes.length}`}
          language={codeLanguage}
          code={codeLines.join('\n')}
        />
      );
    }
    if (inMathBlock && mathLines.length > 0) {
      nodes.push(<KaTeXBlock key={`katex-${nodes.length}`} math={mathLines.join('\n')} />);
    }
    flushTable();
    flushList();

    if (autoDetectedFile) {
      nodes.push(
        <FileAttachmentCard
          key={`autofile-${nodes.length}`}
          filename={autoDetectedFile}
        />
      );
    }

    if (hasAtomicMention && !injectedAtomicSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-atomic-sim-fallback" type="atomic-collision" />
      );
      injectedAtomicSim = true;
    }
    if (hasTreeVisualMention && !injectedTreeSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-tree-sim-fallback" type="binary-tree" />
      );
      injectedTreeSim = true;
    }

    return nodes;
  };

  return (
    <div className={`markdown-body ${isError ? 'markdown-error' : ''}`}>
      {parseBlocks(cleanContent)}
    </div>
  );
};
