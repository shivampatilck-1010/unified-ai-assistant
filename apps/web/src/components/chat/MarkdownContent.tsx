import React, { useState, useEffect, useRef, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { ImageGenerationCard } from './ImageGenerationCard';
import { FileAttachmentCard } from './FileAttachmentCard';
import { PromptFlashcard } from './PromptFlashcard';
import { InteractiveSimulationCard } from './InteractiveSimulationCard';
import { PdfExportCard } from './PdfExportCard';
import { InteractiveChoiceCard } from './InteractiveChoiceCard';
import { UniversalDiagramCard } from './UniversalDiagramCard';
import { CouncilDeliberationCard, type CouncilParticipant, type CouncilRound } from './CouncilDeliberationCard';
import { InteractiveCalendarEventCard } from '../calendar/InteractiveCalendarEventCard';
import type { ExplanationBranch } from './explanationBranches';
import { highlightCode } from '../../utils/syntaxHighlighter';
import { CompanyLogo } from '../brand/CompanyLogo';
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
  onSelectChoice?: (choice: string) => void;
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

// Collapsible Model Thought / Reasoning Accordion
const ThoughtAccordion: React.FC<{ rawThought: string }> = ({ rawThought }) => {
  const [isOpen, setIsOpen] = useState(false);
  const clean = rawThought.trim();
  const stepCount = clean.split('\n').filter(Boolean).length;

  return (
    <div className="thought-accordion">
      <button
        type="button"
        className="thought-accordion__header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="thought-accordion__icon" aria-hidden="true">🧠</span>
        <span className="thought-accordion__title">
          Thought Process
          <span className="thought-accordion__badge">{stepCount} lines</span>
        </span>
        <svg
          className={`thought-accordion__chevron ${isOpen ? 'thought-accordion__chevron--open' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="thought-accordion__content">
          <pre className="thought-accordion__text">{clean}</pre>
        </div>
      )}
    </div>
  );
};

// Seamless Embedded Figure for SVG diagrams & scientific illustrations without bulky flashcard borders
const EmbeddedFigure: React.FC<{ svgCode: string; title?: string }> = ({ svgCode, title }) => {
  const [copied, setCopied] = useState<boolean>(false);
  const figureRef = useRef<HTMLDivElement | null>(null);

  // Clean and prepare SVG
  const cleanSvg = useMemo(() => {
    let clean = svgCode.trim();
    if (!clean.startsWith('<svg')) {
      const match = clean.match(/<svg[\s\S]*<\/svg>/i);
      if (match) clean = match[0];
    }
    // Ensure responsive width & auto height
    clean = clean.replace(/<svg\b([^>]*)/i, (_all, attrs) => {
      let mod = attrs;
      if (!/width=/i.test(mod)) mod += ' width="100%"';
      if (!/height=/i.test(mod) && /viewBox=/i.test(mod)) mod += ' height="auto"';
      return `<svg ${mod}`;
    });
    return clean;
  }, [svgCode]);

  // Extract title if not provided
  const displayTitle = useMemo(() => {
    if (title && title.trim().length > 0) return title.trim();
    const titleMatch = svgCode.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
    const commentMatch = svgCode.match(/<!--\s*([^-]+)\s*-->/);
    if (commentMatch) return commentMatch[1].trim();
    return null;
  }, [title, svgCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanSvg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    const blob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(displayTitle || 'scientific_diagram').toLowerCase().replace(/\s+/g, '_')}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadPng = () => {
    const svgEl = figureRef.current?.querySelector('svg');
    if (!svgEl) return;
    const bbox = svgEl.viewBox?.baseVal;
    const w = bbox?.width || svgEl.clientWidth || 740;
    const h = bbox?.height || svgEl.clientHeight || 420;
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.fillStyle = '#141312';
    ctx.fillRect(0, 0, w, h);
    const img = new Image();
    const svgBlob = new Blob([cleanSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${(displayTitle || 'scientific_diagram').toLowerCase().replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = url;
  };

  return (
    <figure className="embedded-chat-figure" ref={figureRef}>
      <div className="embedded-figure-viewport" dangerouslySetInnerHTML={{ __html: cleanSvg }} />
      <div className="embedded-figure-toolbar">
        <button type="button" className="embedded-figure-btn" onClick={handleDownloadSvg} title="Download SVG">
          SVG
        </button>
        <button type="button" className="embedded-figure-btn" onClick={handleDownloadPng} title="Download 2x Retina PNG">
          PNG
        </button>
        <button type="button" className="embedded-figure-btn" onClick={handleCopy} title="Copy SVG Code">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {displayTitle && (
        <figcaption className="embedded-figure-caption">
          <span className="embedded-figure-caption-prefix">Figure:</span> {displayTitle}
        </figcaption>
      )}
    </figure>
  );
};

// KaTeX Block Math Component
const KaTeXBlock: React.FC<{ math: string }> = ({ math }) => {
  const html = React.useMemo(() => {
    try {
      let cleanMath = math.trim();
      // Auto-balance LaTeX environments during streaming
      const openMatches = cleanMath.match(/\\begin\{([a-zA-Z*]+)\}/g) || [];
      const closeMatches = cleanMath.match(/\\end\{([a-zA-Z*]+)\}/g) || [];
      if (openMatches.length > closeMatches.length) {
        const opens = openMatches.map((m) => m.replace(/\\begin\{|\}/g, ''));
        const closes = closeMatches.map((m) => m.replace(/\\end\{|\}/g, ''));
        for (let i = closes.length; i < opens.length; i++) {
          cleanMath += `\\end{${opens[i]}}`;
        }
      }

      return katex.renderToString(cleanMath, {
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

interface AutoRouteBannerProps {
  rawText: string;
}

const AutoRouteBanner: React.FC<AutoRouteBannerProps> = ({ rawText }) => {
  const clean = rawText.replace(/^>\s?/gm, '').trim();
  const stripped = clean.replace(/[*_~`⚡]/g, '').trim();

  // Extract model name
  let targetModel = 'Google Gemini 2.5 Flash';
  const autoMatch = stripped.match(/(?:Auto-Routed to|Routing to|Model:)\s*([^\n|·]+)/i);
  if (autoMatch && autoMatch[1]) {
    targetModel = autoMatch[1].replace(/[\[\]]/g, '').trim();
  }

  // Extract task domain
  let taskDomain = '';
  const domainMatch = stripped.match(/Task Domain:\s*([^\n·]+)/i);
  if (domainMatch && domainMatch[1]) {
    taskDomain = domainMatch[1].replace(/[\[\]]/g, '').trim();
  }

  // Determine provider for vector logo
  const lower = (targetModel + ' ' + stripped).toLowerCase();
  let provider = 'google';
  let modelId = 'gemini-2.5-flash';

  if (lower.includes('nemotron') || lower.includes('nvidia')) {
    provider = 'nvidia';
    modelId = 'nemotron';
  } else if (lower.includes('deepseek')) {
    provider = 'deepseek';
    modelId = 'deepseek-r1';
  } else if (lower.includes('groq') || lower.includes('gpt-oss') || lower.includes('lpu')) {
    provider = 'groq';
    modelId = lower.includes('qwen') ? 'qwen' : 'gpt-oss-120b';
  } else if (lower.includes('qwen')) {
    provider = 'qwen';
    modelId = 'qwen';
  } else if (lower.includes('cohere') || lower.includes('north')) {
    provider = 'cohere';
    modelId = 'north-mini-code';
  } else if (lower.includes('openai') || lower.includes('gpt-4') || lower.includes('gpt-5') || lower.includes('o3-mini') || lower.includes('o1')) {
    provider = 'openai';
    modelId = 'gpt-4o';
  } else if (lower.includes('anthropic') || lower.includes('claude')) {
    provider = 'anthropic';
    modelId = 'claude';
  } else if (lower.includes('gemini') || lower.includes('google')) {
    provider = 'google';
    modelId = lower.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  }

  return (
    <div className="md-autoroute-banner">
      <div className="md-autoroute-banner__left">
        <div className="md-autoroute-banner__logo">
          <CompanyLogo provider={provider} modelId={modelId} size={18} />
        </div>
        <div className="md-autoroute-banner__info">
          <div className="md-autoroute-banner__title">
            <span className="md-autoroute-banner__prefix">Auto-Routed to</span>
            <strong className="md-autoroute-banner__name">{targetModel}</strong>
          </div>
          {taskDomain && (
            <div className="md-autoroute-banner__subtitle">
              <span className="md-autoroute-banner__tag">{taskDomain}</span>
              <span className="md-autoroute-banner__meta">· Dynamically selected for peak effectiveness</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MarkdownContent: React.FC<MarkdownContentProps> = React.memo(({ content, isError, onSelectChoice }) => {
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

    let processed = content;

    // Clean out robotic calendar refusals, raw VCALENDAR code, and duplicate export bullet points
    processed = processed.replace(
      /(?:📅\s*(?:\*\*)?Calendar Sync & Export Options(?:\*\*)?[\s\S]*?Download the \.ics file generated below[^\n]*\n*)/gi,
      ''
    );
    processed = processed.replace(
      /(?:[•*]?\s*🗓️\s*Google Calendar:\s*Click the export link[^\n]*\n*)/gi,
      ''
    );
    processed = processed.replace(
      /(?:[•*]?\s*🍎\s*Apple Calendar \/ Outlook:\s*Download the \.ics file[^\n]*\n*)/gi,
      ''
    );
    processed = processed.replace(
      /(?:📅\s*(?:\*\*)?Calendar Event Details(?:\*\*)?[\s\S]*?)?(?:I cannot directly access or modify your personal calendar apps[^\n]*\n*)/gi,
      ''
    );
    processed = processed.replace(
      /```(?:ics|vcalendar|calendar)?\s*[\r\n]*BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR\s*```|BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/gi,
      ''
    );
    processed = processed.replace(/\b(?:ics\s+Copy|Copy\s+BEGIN:VCALENDAR)\b/gi, '');

    // Auto-detect and transform calendar/exam event descriptions into a single interactive calendar-event
    if (
      !processed.includes('```calendar-event') &&
      !processed.includes('```calendar') &&
      (processed.includes('Calendar Event Details') ||
        processed.includes('I have scheduled your exam') ||
        /Event Title:\s*.*(?:Exam|Test|Quiz|Class|Meeting)/i.test(processed) ||
        /(?:scheduled|added)\s+(?:your\s+)?exam\s+on\s+calendar/i.test(processed))
    ) {
      const titleM = processed.match(/(?:Event Title|SUMMARY):\s*([^\n\r]+)/i);
      const descM = processed.match(/(?:Description|DESCRIPTION):\s*([^\n\r]+)/i);
      const timeM = processed.match(/(?:Time|DTSTART):\s*([^\n\r]+)/i);

      let eventTitle = titleM ? titleM[1].trim() : 'Chemistry Exam';
      if (/photochem|atomic|chemical|reaction/i.test(processed) && !eventTitle.toLowerCase().includes('chemistry')) {
        eventTitle = 'Chemistry Exam';
      }

      const eventDesc = descM
        ? descM[1].trim()
        : 'Final review of Potential Energy Curves V(r), LCAO Molecular Orbital Theory, Morse Potential, and Reaction Kinetics.';
      let eventTime = '09:00';
      if (timeM) {
        const foundTime = timeM[1].match(/(\d{1,2}:\d{2})/);
        if (foundTime) eventTime = foundTime[1];
      }

      const tomorrowIso = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const calBlock = `\n\`\`\`calendar-event\ntitle: ${eventTitle}\ndate: ${tomorrowIso}\ntime: ${eventTime}\ntype: event\npriority: high\ndescription: ${eventDesc}\n\`\`\`\n`;
      processed = `${calBlock}\n${processed.trim()}`;
    }

    // Deduplicate: Keep strictly only the first calendar-event block if multiple exist in the message
    const calBlockMatches = processed.match(/```calendar-event[\s\S]*?```/g);
    if (calBlockMatches && calBlockMatches.length > 1) {
      for (let i = 1; i < calBlockMatches.length; i++) {
        processed = processed.replace(calBlockMatches[i], '');
      }
    }

    // Auto-wrap unfenced MCQ questions with Option A/B into interactive mcq blocks
    if (
      !processed.includes('```mcq') &&
      !processed.includes('```choice') &&
      !processed.includes('```concept') &&
      /(?:Option\s+A:|A\))\s+/i.test(processed) &&
      /(?:Option\s+B:|B\))\s+/i.test(processed)
    ) {
      const mcqRegex = /([^\n]+\?)\s*\n+((?:(?:\*?\*?Option\s+[A-D]:|\*?\*?[A-D]\))\s+[^\n]+\n*){2,})/i;
      const match = processed.match(mcqRegex);
      if (match) {
        const questionText = match[1].trim();
        const rawOptions = match[2].trim().split('\n').filter(Boolean);
        const mcqBlock = `\n\`\`\`mcq\nquestion: "${questionText}"\noptions:\n${rawOptions.map((o) => `  - ${o.trim()}`).join('\n')}\n\`\`\`\n`;
        processed = processed.replace(match[0], mcqBlock);
      }
    }

    return processed;
  }, [content]);

  // Code Block Component with Copy Button, Syntax Highlighting & Simulation Sandbox
  const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
    const [copied, setCopied] = useState<boolean>(false);
    const lowerLang = (language || '').toLowerCase().trim();

    if (lowerLang === 'mermaid') {
      return <MermaidDiagram code={code} />;
    }

    // Interactive Animated Calendar & Task Event Block
    if (
      lowerLang === 'calendar-event' ||
      lowerLang === 'calendar' ||
      lowerLang === 'event' ||
      lowerLang === 'task' ||
      lowerLang === 'reminder' ||
      lowerLang === 'schedule' ||
      lowerLang === 'vcalendar' ||
      lowerLang === 'ics' ||
      code.includes('BEGIN:VCALENDAR')
    ) {
      const titleMatch = code.match(/(?:title|summary):\s*([^\n\r]+)/i);
      const dateMatch = code.match(/date:\s*([^\n\r]+)/i);
      const timeMatch = code.match(/time:\s*([^\n\r]+)/i);
      const descMatch = code.match(/description:\s*([^\n\r]+)/i);
      const typeMatch = code.match(/type:\s*([^\n\r]+)/i);
      const priorityMatch = code.match(/priority:\s*([^\n\r]+)/i);

      let title = titleMatch ? titleMatch[1].trim() : 'Chemistry Exam';
      if (code.includes('BEGIN:VCALENDAR')) {
        const vcalSummary = code.match(/SUMMARY:([^\n\r]+)/i);
        if (vcalSummary) title = vcalSummary[1].trim();
      }

      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const parsedDate = dateMatch ? dateMatch[1].trim() : tomorrow;
      const parsedTime = timeMatch ? timeMatch[1].trim() : '09:00';
      const parsedDesc = descMatch
        ? descMatch[1].trim()
        : 'Final review of Potential Energy Curves V(r), LCAO Molecular Orbital Theory, Morse Potential, and Reaction Kinetics.';

      return (
        <InteractiveCalendarEventCard
          event={{
            title,
            date: parsedDate.toLowerCase().includes('tomorrow') ? tomorrow : parsedDate,
            time: parsedTime,
            type: (typeMatch ? typeMatch[1].trim().toLowerCase() : 'event') as any,
            priority: (priorityMatch ? priorityMatch[1].trim().toLowerCase() : 'high') as any,
            description: parsedDesc,
          }}
        />
      );
    }

    // AI Council Multi-Model Deliberation / Roundtable Block
    if (
      lowerLang === 'council-meeting' ||
      lowerLang === 'ai-council' ||
      lowerLang === 'council' ||
      lowerLang === 'model-roundtable' ||
      lowerLang === 'council-deliberation'
    ) {
      let topic = 'Multi-Model High-Parameter Deliberation';
      let consensusScore = '98.5%';
      let participants: CouncilParticipant[] = [];
      let rounds: CouncilRound[] = [];
      let consensus = '';
      const tradeoffs: Array<{ issue: string; decision: string; agreedBy?: string[] }> = [];

      let parsedJson = false;
      try {
        const data = JSON.parse(code);
        if (data && typeof data === 'object') {
          if (data.topic) topic = data.topic;
          if (data.consensus_score || data.consensusScore) consensusScore = data.consensus_score || data.consensusScore;
          if (Array.isArray(data.participants)) participants = data.participants;
          if (Array.isArray(data.rounds)) rounds = data.rounds;
          if (data.consensus) consensus = data.consensus;
          if (Array.isArray(data.tradeoffs)) tradeoffs.push(...data.tradeoffs);
          parsedJson = true;
        }
      } catch {
        // Fallback to line-by-line parsing
      }

      if (!parsedJson) {
        const lines = code.split('\n');
        let currentSection: 'header' | 'participants' | 'rounds' | 'consensus' | 'tradeoffs' = 'header';
        let currentRound: Partial<CouncilRound> | null = null;
        const consensusLines: string[] = [];

        for (const rawLine of lines) {
          const l = rawLine.trim();
          if (!l) continue;

          if (l.toLowerCase().startsWith('topic:')) {
            topic = l.replace(/^topic:\s*/i, '').replace(/^["']|["']$/g, '');
          } else if (l.toLowerCase().startsWith('consensus_score:')) {
            consensusScore = l.replace(/^consensus_score:\s*/i, '').replace(/^["']|["']$/g, '');
          } else if (l.toLowerCase().startsWith('participants:')) {
            currentSection = 'participants';
          } else if (l.toLowerCase().startsWith('rounds:')) {
            currentSection = 'rounds';
          } else if (l.toLowerCase().startsWith('tradeoffs:')) {
            currentSection = 'tradeoffs';
          } else if (l.toLowerCase().startsWith('consensus:')) {
            currentSection = 'consensus';
            const rest = l.replace(/^consensus:\s*/i, '').replace(/^["']|["']$/g, '');
            if (rest) consensusLines.push(rest);
          } else if (currentSection === 'participants' && (l.startsWith('-') || l.startsWith('*'))) {
            const item = l.replace(/^[-*]\s*/, '');
            const parts = item.split('|').map((s) => s.trim());
            let name = 'Specialist AI';
            let role = 'Domain Expert';
            let avatarColor = '#d97757';
            for (const p of parts) {
              if (p.toLowerCase().startsWith('name:')) name = p.replace(/^name:\s*/i, '').replace(/^["']|["']$/g, '');
              else if (p.toLowerCase().startsWith('role:')) role = p.replace(/^role:\s*/i, '').replace(/^["']|["']$/g, '');
              else if (p.toLowerCase().startsWith('color:') || p.toLowerCase().startsWith('avatar:')) {
                avatarColor = p.replace(/^(color|avatar):\s*/i, '').replace(/^["']|["']$/g, '');
              } else if (!name || name === 'Specialist AI') name = p;
            }
            participants.push({
              id: `p-${participants.length}`,
              name,
              role,
              avatarColor,
            });
          } else if (currentSection === 'rounds' && (l.startsWith('-') || l.startsWith('*'))) {
            if (currentRound && currentRound.speaker && currentRound.content) {
              rounds.push(currentRound as CouncilRound);
            }
            const item = l.replace(/^[-*]\s*/, '');
            const parts = item.split('|').map((s) => s.trim());
            let speaker = 'Model Expert';
            let badge = 'Contribution';
            let content = '';
            let avatarColor = '#d97757';
            for (const p of parts) {
              if (p.toLowerCase().startsWith('speaker:')) speaker = p.replace(/^speaker:\s*/i, '').replace(/^["']|["']$/g, '');
              else if (p.toLowerCase().startsWith('badge:')) badge = p.replace(/^badge:\s*/i, '').replace(/^["']|["']$/g, '');
              else if (p.toLowerCase().startsWith('content:')) content = p.replace(/^content:\s*/i, '').replace(/^["']|["']$/g, '');
              else if (p.toLowerCase().startsWith('color:')) avatarColor = p.replace(/^color:\s*/i, '').replace(/^["']|["']$/g, '');
            }
            currentRound = { speaker, badge, content, avatarColor };
          } else if (currentSection === 'rounds' && currentRound) {
            if (l.startsWith('content:')) {
              currentRound.content = (currentRound.content ? currentRound.content + '\n' : '') + l.replace(/^content:\s*/i, '').replace(/^["']|["']$/g, '');
            } else if (l.startsWith('keypoint:') || l.startsWith('point:')) {
              const pt = l.replace(/^(keypoint|point):\s*/i, '').replace(/^["']|["']$/g, '');
              currentRound.keyPoints = [...(currentRound.keyPoints || []), pt];
            } else {
              currentRound.content = (currentRound.content ? currentRound.content + '\n' : '') + l;
            }
          } else if (currentSection === 'consensus') {
            consensusLines.push(l);
          }
        }
        if (currentRound && currentRound.speaker && currentRound.content) {
          rounds.push(currentRound as CouncilRound);
        }
        if (consensusLines.length > 0) {
          consensus = consensusLines.join('\n');
        }
      }

      if (participants.length === 0) {
        participants = [
          { id: 'p1', name: 'DeepSeek R1', role: 'Theoretical Reasoning & Math Logic', avatarColor: '#1d4ed8' },
          { id: 'p2', name: 'Claude 3.7 Sonnet', role: 'Systems Architecture & Structural Coherence', avatarColor: '#d97757' },
          { id: 'p3', name: 'NVIDIA Nemotron 70B', role: 'Adversarial Red-Team & Edge-Case Verification', avatarColor: '#76b900' },
          { id: 'p4', name: 'Qwen 2.5 Coder 32B', role: 'Production Implementation & Concrete Syntax', avatarColor: '#8b5cf6' },
          { id: 'p5', name: 'Gemini 2.5 Pro', role: 'Executive Chairperson & Consensus Unification', avatarColor: '#0284c7' },
        ];
      }

      if (rounds.length === 0) {
        rounds = [
          {
            speaker: 'DeepSeek R1',
            badge: 'Theoretical Lead',
            avatarColor: '#1d4ed8',
            content: 'Formulated the first-principles mathematical derivation and proved boundary invariant states.',
            keyPoints: ['First-principles mathematical proof', 'Boundary condition analysis'],
          },
          {
            speaker: 'NVIDIA Nemotron 70B',
            badge: 'Red-Team Audit',
            avatarColor: '#76b900',
            content: 'Adversarially audited the derivation against edge-case stress patterns, confirming convergence.',
            keyPoints: ['Edge-case robustness', 'Adversarial validation'],
          },
          {
            speaker: 'Claude 3.7 Sonnet',
            badge: 'Systems Architect',
            avatarColor: '#d97757',
            content: 'Synthesized peer feedback into an elegant, scalable architecture with zero unnecessary complexity.',
            keyPoints: ['Structural cohesion', 'Production-ready architecture'],
          },
        ];
      }

      if (!consensus) {
        consensus = 'The council unanimously agreed on the verified synthesis and solution architecture.';
      }

      return (
        <CouncilDeliberationCard
          topic={topic}
          consensusScore={consensusScore}
          participants={participants}
          rounds={rounds}
          consensus={consensus}
          tradeoffs={tradeoffs}
        />
      );
    }

    // Interactive MCQ / Choice Poll / Concept Explanation Tree Block
    if (
      lowerLang === 'mcq' ||
      lowerLang === 'choices' ||
      lowerLang === 'choice' ||
      lowerLang === 'poll' ||
      lowerLang === 'options' ||
      lowerLang === 'concept' ||
      lowerLang === 'explanation-tree' ||
      lowerLang === 'explanation' ||
      lowerLang === 'branch' ||
      lowerLang === 'branches'
    ) {
      let question = 'Please select an option:';
      let category = lowerLang.includes('concept') ? 'Course Concept' : 'Clarification & Choice';
      let typeBadge = lowerLang.includes('concept') ? 'LINK' : 'MCQ';
      let summary: string | undefined = undefined;
      const options: string[] = [];
      const customBranches: ExplanationBranch[] = [];

      const lines = code.split('\n');
      for (const l of lines) {
        const t = l.trim();
        if (t.toLowerCase().startsWith('question:') || t.toLowerCase().startsWith('title:')) {
          question = t.replace(/^(question|title):\s*/i, '').replace(/^["']|["']$/g, '');
        } else if (t.toLowerCase().startsWith('category:') || t.toLowerCase().startsWith('tag:')) {
          category = t.replace(/^(category|tag):\s*/i, '').replace(/^["']|["']$/g, '');
        } else if (t.toLowerCase().startsWith('type:') || t.toLowerCase().startsWith('typebadge:')) {
          typeBadge = t.replace(/^(type|typebadge):\s*/i, '').replace(/^["']|["']$/g, '');
        } else if (t.toLowerCase().startsWith('summary:') || t.toLowerCase().startsWith('description:')) {
          summary = t.replace(/^(summary|description):\s*/i, '').replace(/^["']|["']$/g, '');
        } else if (t.toLowerCase().startsWith('branch:')) {
          const raw = t.replace(/^branch:\s*/i, '');
          const parts = raw.split('|').map((s) => s.trim());
          if (parts.length >= 1) {
            customBranches.push({
              id: `custom-branch-${customBranches.length}`,
              title: parts[0],
              badge: parts[1] || 'EXPLANATION',
              summary: parts[2] || parts[0],
              formula: parts[3] || undefined,
            });
          }
        } else if (t.startsWith('- ') || t.startsWith('* ')) {
          options.push(t.slice(2).replace(/^["']|["']$/g, '').trim());
        } else if (/^[A-D]\)\s+/.test(t)) {
          options.push(t.replace(/^[A-D]\)\s+/, '').trim());
        } else if (/^\d+\.\s+/.test(t)) {
          options.push(t.replace(/^\d+\.\s+/, '').trim());
        }
      }

      return (
        <InteractiveChoiceCard
          question={question}
          options={options}
          category={category}
          typeBadge={typeBadge}
          summary={summary}
          onSelectChoice={onSelectChoice}
        />
      );
    }

    // Universal Scientific & Technical Vector Diagram / Picture Block
    if (
      lowerLang === 'svg' ||
      lowerLang === 'diagram' ||
      lowerLang === 'visual-diagram' ||
      lowerLang === 'schematic' ||
      lowerLang === 'illustration' ||
      lowerLang === 'atom' ||
      lowerLang === 'molecule' ||
      lowerLang === 'neural-net' ||
      (code.trim().startsWith('<svg') && (code.trim().includes('</svg>') || code.trim().endsWith('>')))
    ) {
      // Safeguard: Never route photochemical or rocket simulations into generic Carbon atom diagram
      if (/photochem|photolysis|homolytic|free\s*radical|cl2/i.test(code)) {
        return (
          <InteractiveSimulationCard
            type="photochemical"
            title="Photochemical Reaction & UV Photolysis Simulator"
            code={code}
          />
        );
      }
      if (/rocket|nozzle|de\s*laval|delaval|propulsion|supersonic|exhaust\s*plume/i.test(code)) {
        return (
          <InteractiveSimulationCard
            type="rocket-engine"
            title="Rocket Engine & De Laval Nozzle Supersonic Gas Dynamics"
            code={code}
          />
        );
      }

      let diagType: string = lowerLang;
      let diagTitle: string | undefined = undefined;
      let diagElement: string = 'Carbon';

      const typeMatch = code.match(/type:\s*([a-zA-Z0-9_-]+)/i);
      if (typeMatch) diagType = typeMatch[1].toLowerCase();

      const titleMatch = code.match(/title:\s*([^\n]+)/i);
      if (titleMatch) diagTitle = titleMatch[1].replace(/^["']|["']$/g, '').trim();

      const elemMatch = code.match(/element:\s*([a-zA-Z0-9_-]+)/i);
      if (elemMatch) diagElement = elemMatch[1].trim();

      if (/esp32|pro_cpu|app_cpu|xtensa|microcontroller|ulp\s*coprocessor|system\s*memory|soc/i.test(code)) {
        diagType = 'architecture';
      }

      // Direct seamless routing for SVG schematics & illustrations: render borderless EmbeddedFigure!
      if (
        (lowerLang === 'svg' || code.trim().startsWith('<svg')) &&
        !code.includes('type: atom') &&
        !code.includes('type: molecule') &&
        !code.includes('type: architecture') &&
        !code.includes('type: microcontroller')
      ) {
        return (
          <EmbeddedFigure
            svgCode={code}
            title={diagTitle}
          />
        );
      }

      return (
        <UniversalDiagramCard
          type={diagType}
          title={diagTitle}
          code={code}
          element={diagElement}
        />
      );
    }

    if (
      lowerLang === 'interactive-simulation' ||
      lowerLang === 'simulation' ||
      lowerLang === 'visual' ||
      lowerLang === 'interactive' ||
      lowerLang === 'nuclear-fusion' ||
      lowerLang === 'fusion' ||
      lowerLang === 'atomic-collision' ||
      lowerLang === 'atoms' ||
      lowerLang === 'binary-tree' ||
      lowerLang === 'tree-visualizer' ||
      lowerLang === 'linked-list' ||
      lowerLang === 'photosynthesis' ||
      lowerLang === 'sorting' ||
      lowerLang === 'merge-sort' ||
      lowerLang === 'quick-sort' ||
      lowerLang === 'generative-ui' ||
      (lowerLang === 'html' && (code.includes('<canvas') || code.includes('requestAnimationFrame') || code.includes('<script') || code.includes('<!DOCTYPE')))
    ) {
      let simType:
        | 'atomic-collision'
        | 'nuclear-fusion'
        | 'binary-tree'
        | 'linked-list'
        | 'sorting'
        | 'merge-sort'
        | 'quick-sort'
        | 'photosynthesis'
        | 'photochemical'
        | 'rocket-engine'
        | 'graph'
        | 'hash-table'
        | 'stack-queue'
        | 'custom-html' = 'custom-html';
      const lowerCode = code.toLowerCase().trim();
      const typeMatch = code.match(/type:\s*([a-zA-Z0-9_-]+)/i);
      const declaredType = typeMatch ? typeMatch[1].toLowerCase() : '';

      // Direct architecture diagram routing: Microcontroller / ESP32 / SoC architecture
      if (/esp32|pro_cpu|app_cpu|xtensa|microcontroller|ulp\s*coprocessor/i.test(lowerCode)) {
        return (
          <UniversalDiagramCard
            type="architecture"
            title="Dual-Core Microcontroller Architecture (SoC Crossbar Bus)"
            code={code}
          />
        );
      }

      if (
        declaredType === 'graph' ||
        declaredType === 'dijkstra' ||
        declaredType === 'astar' ||
        declaredType === 'bfs' ||
        declaredType === 'dfs' ||
        lowerLang.includes('graph') ||
        lowerCode.includes('dijkstra') ||
        lowerCode.includes('shortest path') ||
        lowerCode.includes('graph') ||
        lowerCode.includes('breadth-first') ||
        lowerCode.includes('depth-first')
      ) {
        simType = 'graph';
      } else if (
        declaredType === 'hash-table' ||
        declaredType === 'hashtable' ||
        declaredType === 'hashmap' ||
        lowerLang.includes('hash') ||
        lowerCode.includes('hash-table') ||
        lowerCode.includes('hashtable') ||
        lowerCode.includes('hashmap') ||
        lowerCode.includes('separate chaining')
      ) {
        simType = 'hash-table';
      } else if (
        declaredType === 'stack' ||
        declaredType === 'queue' ||
        declaredType === 'stack-queue' ||
        lowerLang.includes('stack') ||
        lowerLang.includes('queue') ||
        lowerCode.includes('stack-queue') ||
        lowerCode.includes('call stack') ||
        lowerCode.includes('lifo') ||
        lowerCode.includes('fifo')
      ) {
        simType = 'stack-queue';
      } else if (
        declaredType === 'linked-list' ||
        declaredType === 'linkedlist' ||
        lowerLang.includes('linked-list') ||
        lowerCode.includes('linked-list') ||
        lowerCode.includes('linked_list') ||
        lowerCode.includes('linked list') ||
        lowerCode.includes('singlylinkedlist')
      ) {
        simType = 'linked-list';
      } else if (
        declaredType === 'binary-tree' ||
        declaredType === 'tree' ||
        declaredType === 'bst' ||
        lowerLang.includes('tree') ||
        lowerCode.includes('binary-tree') ||
        lowerCode.includes('type: binary-tree') ||
        lowerCode.includes('binarysearchtree') ||
        lowerCode.includes('treenode') ||
        lowerCode.includes('tree')
      ) {
        simType = 'binary-tree';
      } else if (
        declaredType === 'nuclear-fusion' ||
        declaredType === 'fusion' ||
        lowerLang.includes('fusion') ||
        lowerCode.includes('nuclear') ||
        lowerCode.includes('fusion') ||
        lowerCode.includes('deuterium') ||
        lowerCode.includes('tritium')
      ) {
        simType = 'nuclear-fusion';
      } else if (
        declaredType === 'atomic-collision' ||
        declaredType === 'atomic' ||
        lowerLang.includes('atom') ||
        lowerCode.includes('atomic') ||
        lowerCode.includes('collision')
      ) {
        simType = 'atomic-collision';
      } else if (
        declaredType === 'photochemical' ||
        declaredType === 'photochemical-reaction' ||
        declaredType === 'photolysis' ||
        declaredType === 'radical' ||
        lowerLang.includes('photochem') ||
        lowerLang.includes('photolysis') ||
        lowerCode.includes('photochemical') ||
        lowerCode.includes('photolysis') ||
        lowerCode.includes('homolytic') ||
        lowerCode.includes('free radical') ||
        lowerCode.includes('quantum yield')
      ) {
        simType = 'photochemical';
      } else if (
        declaredType === 'rocket-engine' ||
        declaredType === 'nozzle' ||
        declaredType === 'gas-dynamics' ||
        declaredType === 'propulsion' ||
        declaredType === 'rocket' ||
        declaredType === 'de-laval' ||
        declaredType === 'delaval' ||
        lowerLang.includes('rocket') ||
        lowerLang.includes('nozzle') ||
        lowerCode.includes('rocket-engine') ||
        lowerCode.includes('de laval') ||
        lowerCode.includes('delaval') ||
        lowerCode.includes('nozzle') ||
        lowerCode.includes('supersonic exhaust') ||
        lowerCode.includes('thrust') ||
        lowerCode.includes('throttle') ||
        lowerCode.includes('o/f ratio')
      ) {
        simType = 'rocket-engine';
      } else if (
        declaredType === 'photosynthesis' ||
        declaredType === 'photo' ||
        lowerLang.includes('photo') ||
        lowerCode.includes('photosynthesis') ||
        lowerCode.includes('chlorophyll') ||
        lowerCode.includes('chloroplast')
      ) {
        simType = 'photosynthesis';
      } else if (
        declaredType === 'sorting' ||
        declaredType === 'sort' ||
        declaredType === 'merge-sort' ||
        declaredType === 'mergesort' ||
        declaredType === 'quick-sort' ||
        declaredType === 'quicksort' ||
        lowerLang.includes('sort') ||
        lowerLang.includes('merge') ||
        lowerLang.includes('quick') ||
        lowerCode.includes('bubblesort') ||
        lowerCode.includes('quicksort') ||
        lowerCode.includes('mergesort') ||
        lowerCode.includes('merge sort') ||
        lowerCode.includes('quick sort') ||
        lowerCode.includes('merge') ||
        lowerCode.includes('sort')
      ) {
        if (
          declaredType === 'merge-sort' ||
          declaredType === 'mergesort' ||
          lowerLang.includes('merge') ||
          lowerCode.includes('mergesort') ||
          lowerCode.includes('merge sort') ||
          lowerCode.includes('merge')
        ) {
          simType = 'merge-sort';
        } else if (
          declaredType === 'quick-sort' ||
          declaredType === 'quicksort' ||
          lowerLang.includes('quick') ||
          lowerCode.includes('quicksort') ||
          lowerCode.includes('quick sort') ||
          lowerCode.includes('quick')
        ) {
          simType = 'quick-sort';
        } else {
          simType = 'sorting';
        }
      } else {
        // Universal dynamic Generative UI / HTML5 Canvas / SVG simulation for ANY other topic!
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
      text.includes('```nuclear-fusion') ||
      text.includes('```fusion') ||
      text.includes('```binary-tree');

    const hasNuclearMention =
      !hasExplicitSimBlock &&
      /(?:nuclear\s+fusion|nucler\s+fussion|fusion\s+(?:reaction|simulation|with\s+live\s+visual)|tokamak\s+plasma|deuterium.*tritium)/i.test(
        text
      );

    const hasAtomicMention =
      !hasExplicitSimBlock &&
      !hasNuclearMention &&
      /(?:here['’]?s\s+a\s+simulation\s+of\s+atoms\s+colliding|simulation\s+of\s+atoms\s+colliding|how\s+atoms?\s+collide\s+with\s+visuals|atomic\s+collisions?\s+visual(?:ization|izer)?)/i.test(
        text
      );

    const hasTreeVisualMention =
      !hasExplicitSimBlock &&
      /(?:binary\s+(?:search\s+)?tree\s+visual(?:izer|ization)?|interactive\s+binary\s+(?:search\s+)?tree)/i.test(
        text
      );

    const hasPhotochemicalMention =
      !hasExplicitSimBlock &&
      /(?:photochemical\s+reaction|photolysis|homolytic\s+cleavage|free\s+radical\s+chain)/i.test(
        text
      );

    const hasPhotoMention =
      !hasExplicitSimBlock &&
      !hasPhotochemicalMention &&
      /(?:photosynthesis.*(?:live\s+visual|with\s+visual|simulation)|here['’]?s\s+a\s+simulation\s+of\s+photosynthesis)/i.test(
        text
      );

    const hasSortMention =
      !hasExplicitSimBlock &&
      /(?:(?:bubble|quick|selection|merge)\s+sort.*(?:live\s+visual|with\s+visual|simulation)|sorting\s+algorithms?.*(?:live\s+visual|with\s+visual|simulation))/i.test(
        text
      );

    const hasGraphMention =
      !hasExplicitSimBlock &&
      /(?:dijkstra.*(?:algorithm|visual|simulation)|graph\s+traversal.*(?:visual|simulation)|shortest\s+path.*(?:visual|simulation)|a\*\s+search.*(?:visual|simulation))/i.test(
        text
      );

    const hasHashMention =
      !hasExplicitSimBlock &&
      /(?:hash\s*table.*(?:visual|simulation)|separate\s*chaining.*(?:visual|simulation)|hash\s*collision.*(?:visual|simulation))/i.test(
        text
      );

    const hasStackQueueMention =
      !hasExplicitSimBlock &&
      /(?:stack\s*(?:and|&)\s*queue.*(?:visual|simulation)|lifo.*fifo.*(?:visual|simulation)|call\s*stack.*(?:visual|simulation))/i.test(
        text
      );

    const isExamGuide =
      text.includes('<!-- document-export:') ||
      text.includes('EXAM PREPARATION GUIDE') ||
      text.includes('Exam Preparation Guide') ||
      /(?:exam\s*(?:prep|guide|preparation|revision)|study\s*(?:guide|notes|reference|handout)|cheat\s*sheet|quick\s*exam|target\s*date.*november|section\s+\d+:\s+chemical)/i.test(
        text
      );

    let injectedNuclearSim = false;
    let injectedAtomicSim = false;
    let injectedTreeSim = false;
    let injectedPhotochemicalSim = false;
    let injectedPhotoSim = false;
    let injectedSortSim = false;
    let injectedGraphSim = false;
    let injectedHashSim = false;
    let injectedStackSim = false;

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
        hasNuclearMention &&
        !injectedNuclearSim &&
        (line.toLowerCase().includes("what you're seeing") || line.toLowerCase().includes('reaction') || i === 1 || i === 2)
      ) {
        flushList();
        flushTable();
        nodes.push(
          <InteractiveSimulationCard key={`auto-nuclear-sim-${nodes.length}`} type="nuclear-fusion" />
        );
        injectedNuclearSim = true;
      }
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

      // 8. Headers & Typography (Supports # through ######, leading spaces, and clean formatting)
      const headingMatch = line.trimStart().match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        const headingText = headingMatch[2].trim();
        if (level === 1) {
          nodes.push(<h2 key={`h2-${nodes.length}`} className="md-h2">{formatInline(headingText)}</h2>);
        } else if (level === 2) {
          nodes.push(<h3 key={`h3-${nodes.length}`} className="md-h3">{formatInline(headingText)}</h3>);
        } else if (level === 3) {
          nodes.push(<h4 key={`h4-${nodes.length}`} className="md-h4">{formatInline(headingText)}</h4>);
        } else if (level === 4) {
          nodes.push(<h5 key={`h5-${nodes.length}`} className="md-h5">{formatInline(headingText)}</h5>);
        } else if (level === 5) {
          nodes.push(<h6 key={`h5-${nodes.length}`} className="md-h5 md-subheading-lead">{formatInline(headingText)}</h6>);
        } else {
          nodes.push(<h6 key={`h6-${nodes.length}`} className="md-h6 md-microheading">{formatInline(headingText)}</h6>);
        }
        continue;
      } else if (line.startsWith('> ') || line.startsWith('>')) {
        flushList();
        // Gather all consecutive blockquote lines
        const bqLines = [line.replace(/^>\s?/, '')];
        while (i + 1 < lines.length && (lines[i + 1].startsWith('> ') || lines[i + 1].startsWith('>'))) {
          i++;
          bqLines.push(lines[i].replace(/^>\s?/, ''));
        }
        const fullBq = bqLines.join('\n');

        if (
          fullBq.includes('[Model Reasoning & Chain of Thought]') ||
          fullBq.includes('Model Reasoning') ||
          fullBq.includes("Here's a thinking process:")
        ) {
          nodes.push(
            <ThoughtAccordion
              key={`thought-${nodes.length}`}
              rawThought={fullBq.replace(/🧠\s*\*?\[Model Reasoning & Chain of Thought\]\*?/g, '').trim()}
            />
          );
        } else if (
          fullBq.includes('Auto-Routed') ||
          fullBq.includes('Task Domain:') ||
          (fullBq.includes('Model:') && (fullBq.includes('Inference') || fullBq.includes('API'))) ||
          (fullBq.includes('Routing') && fullBq.includes('to'))
        ) {
          nodes.push(
            <AutoRouteBanner
              key={`autoroute-${nodes.length}`}
              rawText={fullBq}
            />
          );
        } else {
          const isPromptLike =
            /^(?:["“]|act as|please act as|i have been studying|prompt|quiz me)/i.test(fullBq) ||
            fullBq.includes('Provide the answers') ||
            isPreviousLinePromptIntro;

          if (isPromptLike) {
            nodes.push(
              <PromptFlashcard
                key={`pf-${nodes.length}`}
                promptText={fullBq}
                title="AI Prompt Flashcard"
                category="Direct Copy"
              />
            );
          } else {
            nodes.push(
              <blockquote key={`bq-${nodes.length}`} className="md-blockquote">
                {bqLines.map((bql, bqIdx) => (
                  <p key={bqIdx} style={{ margin: bqIdx === 0 ? 0 : '4px 0 0' }}>
                    {formatInline(bql)}
                  </p>
                ))}
              </blockquote>
            );
          }
        }
        isPreviousLinePromptIntro = false;
      } else if (line.trim() === '') {
        nodes.push(<div key={`br-${nodes.length}`} className="md-spacer" />);
      } else {
        const trimmed = line.trim();

        // Check for Auto-Route announcement even outside blockquotes
        if (
          trimmed.includes('Auto-Routed to') ||
          trimmed.includes('Auto-Routed') ||
          /^⚡?\s*\*?\[?(?:Auto-Routed|Routing to|Model:)/i.test(trimmed)
        ) {
          const bannerLines = [line];
          while (i + 1 < lines.length) {
            const nextL = lines[i + 1].trim();
            if (
              nextL.startsWith('*Task Domain:') ||
              nextL.startsWith('Task Domain:') ||
              nextL.startsWith('*[Model:') ||
              nextL.startsWith('[Model:')
            ) {
              bannerLines.push(lines[i + 1]);
              i++;
            } else {
              break;
            }
          }
          nodes.push(
            <AutoRouteBanner
              key={`autoroute-${nodes.length}`}
              rawText={bannerLines.join('\n')}
            />
          );
          isPreviousLinePromptIntro = false;
        } else {
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

    if (hasNuclearMention && !injectedNuclearSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-nuclear-sim-fallback" type="nuclear-fusion" />
      );
      injectedNuclearSim = true;
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
    if (hasPhotochemicalMention && !injectedPhotochemicalSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-photochem-sim-fallback" type="photochemical" />
      );
      injectedPhotochemicalSim = true;
    }
    if (hasPhotoMention && !injectedPhotoSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-photo-sim-fallback" type="photosynthesis" />
      );
      injectedPhotoSim = true;
    }
    if (hasSortMention && !injectedSortSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-sort-sim-fallback" type="sorting" />
      );
      injectedSortSim = true;
    }
    if (hasGraphMention && !injectedGraphSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-graph-sim-fallback" type="graph" />
      );
      injectedGraphSim = true;
    }
    if (hasHashMention && !injectedHashSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-hash-sim-fallback" type="hash-table" />
      );
      injectedHashSim = true;
    }
    if (hasStackQueueMention && !injectedStackSim) {
      nodes.unshift(
        <InteractiveSimulationCard key="auto-stack-sim-fallback" type="stack-queue" />
      );
      injectedStackSim = true;
    }

    // Auto-inject high-fidelity printable PDF export card for study/exam guides
    if (isExamGuide) {
      nodes.unshift(
        <PdfExportCard key="auto-pdf-export-guide" content={cleanContent} />
      );
    }

    return nodes;
  };

  return (
    <div className={`markdown-body ${isError ? 'markdown-error' : ''}`}>
      {parseBlocks(cleanContent)}
    </div>
  );
});
