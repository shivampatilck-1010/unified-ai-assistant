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

        if (ms > 3000) setActiveStepIndex(3);
        else if (ms > 1800) setActiveStepIndex(2);
        else if (ms > 700) setActiveStepIndex(1);
        else setActiveStepIndex(0);
      }, 100);

      return () => clearInterval(interval);
    } else {
      setActiveStepIndex(4);
    }
  }, [isStreaming]);

  // Contextually synthesize steps matching user prompt
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
          text: 'Analyzed PhotolysisReactionGraph.ts #L1-88',
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
    if (
      lower.includes('tree') ||
      lower.includes('bst') ||
      lower.includes('sort') ||
      lower.includes('code') ||
      lower.includes('algo')
    ) {
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
          text: 'Analyzed BinarySearchTreeNode.ts #L1-120',
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
    if (
      lower.includes('design') ||
      lower.includes('card') ||
      lower.includes('ui') ||
      lower.includes('css') ||
      lower.includes('ref')
    ) {
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
          text: 'Analyzed InteractiveChoiceCard.tsx #L280-340',
          tag: '#UI',
        },
        {
          id: 'step-4',
          action: 'Rendered',
          text: 'Formulated structured response with KaTeX & visual formatting',
        },
      ];
    }

    // 4. Default Signature Steps
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
        text: 'Analyzed ConceptualKnowledgeGraph.ts #L1-90',
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

  // --- STREAMING VIEW (Variant 1: Slim Obsidian Bar - Background #070709 - Single Line In-Place Transition) ---
  if (isStreaming) {
    const currentStep = steps[Math.min(activeStepIndex, steps.length - 1)];

    return (
      <div className="ghost-single-bar" role="status" aria-live="polite">
        <div className="ghost-single-bar__left">
          <span className="ghost-badge">
            {currentStep.action.toUpperCase()}
          </span>
          <div className="ghost-text-viewport">
            <span key={currentStep.id} className="ghost-text-sliding">
              {currentStep.text}
            </span>
          </div>
        </div>
        <div className="ghost-counter">
          <span className="ghost-pulse-ring" />
          <span>Thinking for {elapsedSec}s</span>
        </div>
      </div>
    );
  }

  // --- COMPLETED COLLAPSIBLE VIEW (Matching Slim Obsidian Bar #070709) ---
  return (
    <div className="antigravity-thought-tray">
      {/* Clickable Header Bar */}
      <button
        type="button"
        className="ghost-single-bar ghost-single-bar--completed"
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Collapse thought steps' : 'Expand thought steps'}
      >
        <div className="ghost-single-bar__left">
          <svg className="ghost-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="ghost-completed-text">
            Thought for {elapsedSec}s · {steps.length} steps completed
          </span>
        </div>

        <div className="ghost-chevron">
          <svg
            className={`ghost-chevron-icon ${isOpen ? 'ghost-chevron-icon--open' : ''}`}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#71717a"
            strokeWidth="2.2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded Step Rows (Only when user explicitly clicks to expand) */}
      {isOpen && (
        <div className="ghost-steps-dropdown">
          {steps.map((step) => (
            <div key={step.id} className="ghost-step-row">
              <span className="ghost-badge ghost-badge--row">{step.action.toUpperCase()}</span>
              <span className="ghost-row-desc">{step.text}</span>
              <div className="ghost-row-meta">
                {step.tag && <span className="ghost-meta-tag">{step.tag}</span>}
                {step.hasArrow && <span className="ghost-row-arrow">&gt;</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
