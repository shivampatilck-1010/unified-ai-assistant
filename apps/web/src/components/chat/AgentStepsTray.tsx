import React, { useState, useEffect, useRef, useMemo } from 'react';
import './AgentStepsTray.css';

export interface StepItem {
  id: string;
  action: 'Analyzed' | 'Ran' | 'Synthesized' | 'Rendered' | 'Edited';
  text: string;
  tag?: string;
  hasArrow?: boolean;
}

interface AgentStepsTrayProps {
  isStreaming: boolean;
  promptText?: string;
  customSteps?: StepItem[];
  defaultExpanded?: boolean;
}

export const AgentStepsTray: React.FC<AgentStepsTrayProps> = ({
  isStreaming,
  promptText = '',
  customSteps,
  defaultExpanded = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultExpanded);
  const [elapsedMs, setElapsedMs] = useState<number>(1200);
  const startTimeRef = useRef<number>(Date.now());
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      setActiveStepIndex(0);

      const interval = setInterval(() => {
        const ms = Date.now() - startTimeRef.current;
        setElapsedMs(ms);

        if (ms > 2800) setActiveStepIndex(3);
        else if (ms > 1600) setActiveStepIndex(2);
        else if (ms > 700) setActiveStepIndex(1);
        else setActiveStepIndex(0);
      }, 100);

      return () => clearInterval(interval);
    } else {
      setActiveStepIndex(4);
    }
  }, [isStreaming]);

  // Contextually synthesize steps matching Antigravity's signature output
  const steps = useMemo<StepItem[]>(() => {
    if (customSteps && customSteps.length > 0) return customSteps;

    const lower = promptText.toLowerCase();

    // 1. Science / Reactions / Fusion / Photosynthesis
    if (
      lower.includes('atom') ||
      lower.includes('fusion') ||
      lower.includes('reaction') ||
      lower.includes('photo') ||
      lower.includes('calvin') ||
      lower.includes('collision')
    ) {
      return [
        {
          id: 'step-1',
          action: 'Analyzed',
          text: 'Analyzed photochemical kinetics & reaction equilibrium',
          tag: '#Kinetics',
        },
        {
          id: 'step-2',
          action: 'Ran',
          text: 'Ran verify quantum tunneling & Coulomb barrier models',
          hasArrow: true,
        },
        {
          id: 'step-3',
          action: 'Synthesized',
          text: 'Analyzed ⚛️ PhotolysisReactionGraph.ts #L1-88',
          tag: '#Biophysics',
        },
        {
          id: 'step-4',
          action: 'Rendered',
          text: 'Formulated structured response with KaTeX & visual formatting',
        },
      ];
    }

    // 2. Code / Algorithms / Trees / Sorting
    if (lower.includes('tree') || lower.includes('bst') || lower.includes('sort') || lower.includes('code') || lower.includes('algo')) {
      return [
        {
          id: 'step-1',
          action: 'Analyzed',
          text: 'Analyzed algorithmic invariants & recursion tree depth',
          tag: '#Complexity',
        },
        {
          id: 'step-2',
          action: 'Ran',
          text: 'Ran verify binary partition invariant & in-order sorting',
          hasArrow: true,
        },
        {
          id: 'step-3',
          action: 'Synthesized',
          text: 'Analyzed ⚛️ BinarySearchTreeNode.ts #L1-120',
          tag: '#Algorithms',
        },
        {
          id: 'step-4',
          action: 'Rendered',
          text: 'Formulated structured response with KaTeX & visual formatting',
        },
      ];
    }

    // 3. UI / Components / CSS / Design
    if (lower.includes('design') || lower.includes('card') || lower.includes('ui') || lower.includes('css') || lower.includes('ref')) {
      return [
        {
          id: 'step-1',
          action: 'Analyzed',
          text: 'Analyzed InteractiveChoiceCard.tsx #L180-280',
          tag: '#Architecture',
        },
        {
          id: 'step-2',
          action: 'Ran',
          text: 'Ran cross-reference neural reasoning models',
          hasArrow: true,
        },
        {
          id: 'step-3',
          action: 'Synthesized',
          text: 'Analyzed ⚛️ InteractiveChoiceCard.tsx #L280-340',
          tag: '#UI',
        },
        {
          id: 'step-4',
          action: 'Rendered',
          text: 'Formulated structured response with KaTeX & visual formatting',
        },
      ];
    }

    // 4. Default Antigravity Signature Steps (Exact Match to Image 2)
    return [
      {
        id: 'step-1',
        action: 'Analyzed',
        text: 'Analyzed request context & user intent',
        tag: '#Intent',
      },
      {
        id: 'step-2',
        action: 'Ran',
        text: 'Ran cross-reference neural reasoning models',
        hasArrow: true,
      },
      {
        id: 'step-3',
        action: 'Synthesized',
        text: 'Analyzed ⚛️ ConceptualKnowledgeGraph.ts #L1-90',
        tag: '#Framework',
      },
      {
        id: 'step-4',
        action: 'Rendered',
        text: 'Formulated structured response with KaTeX & visual formatting',
      },
    ];
  }, [promptText, customSteps]);

  const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));

  // --- STREAMING VIEW (Matching Image 1) ---
  if (isStreaming) {
    const visibleSteps = steps.slice(0, Math.min(activeStepIndex + 1, steps.length));

    return (
      <div className="antigravity-thinking-stream">
        {visibleSteps.map((step) => (
          <div key={step.id} className="antigravity-stream-step">
            <span className={`antigravity-action antigravity-action--${step.action.toLowerCase()}`}>
              {step.action}
            </span>
            <span className="antigravity-stream-desc">{step.text}</span>
            {step.tag && <span className="antigravity-tag">{step.tag}</span>}
            {step.hasArrow && <span className="antigravity-arrow">&gt;</span>}
          </div>
        ))}
        <div className="antigravity-thinking-counter">
          Thinking for {elapsedSec}s
        </div>
      </div>
    );
  }

  // --- COMPLETED COLLAPSIBLE VIEW (Matching Image 2) ---
  return (
    <div className="antigravity-thought-tray">
      {/* Clickable Header Bar */}
      <button
        type="button"
        className="antigravity-thought-header"
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Collapse thought steps' : 'Expand thought steps'}
      >
        <div className="antigravity-thought-header__left">
          <svg className="antigravity-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="antigravity-thought-summary">
            Thought for {elapsedSec}s · {steps.length} steps completed
          </span>
        </div>

        <div className="antigravity-thought-header__right">
          <span className={`antigravity-chevron ${isOpen ? 'antigravity-chevron--open' : ''}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </button>

      {/* Expanded Step Rows (Matching Image 2) */}
      {isOpen && (
        <div className="antigravity-steps-dropdown">
          {steps.map((step) => (
            <div key={step.id} className="antigravity-step-row">
              <span className={`antigravity-action antigravity-action--${step.action.toLowerCase()}`}>
                {step.action}
              </span>
              <span className="antigravity-step-desc">{step.text}</span>
              <div className="antigravity-step-meta">
                {step.tag && <span className="antigravity-tag">{step.tag}</span>}
                {step.hasArrow && <span className="antigravity-arrow">&gt;</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
