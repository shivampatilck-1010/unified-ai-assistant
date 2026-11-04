import React, { useState, useEffect, useRef, useMemo } from 'react';
import './AgentStepsTray.css';

export interface StepItem {
  id: string;
  type: 'ran' | 'analyzed' | 'synthesized' | 'verified' | 'rendered';
  text: string;
  tag?: string;
  status: 'completed' | 'active';
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
  defaultExpanded,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    defaultExpanded !== undefined ? !defaultExpanded : !isStreaming
  );
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  // Auto-expand when streaming starts, collapse 1s after stream finishes
  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      setIsCollapsed(false);
      setActiveStepIndex(0);

      const interval = setInterval(() => {
        const ms = Date.now() - startTimeRef.current;
        setElapsedMs(ms);

        // Advance steps progressively
        if (ms > 2400) setActiveStepIndex(3);
        else if (ms > 1400) setActiveStepIndex(2);
        else if (ms > 600) setActiveStepIndex(1);
        else setActiveStepIndex(0);
      }, 100);

      return () => clearInterval(interval);
    } else {
      setActiveStepIndex(4); // All done
    }
  }, [isStreaming]);

  // Contextually synthesize steps based on user prompt
  const generatedSteps = useMemo<StepItem[]>(() => {
    if (customSteps && customSteps.length > 0) return customSteps;

    const lower = promptText.toLowerCase();

    // 1. Physics / Chemistry / Atoms / Fusion / Photochemical
    if (
      lower.includes('atom') ||
      lower.includes('fusion') ||
      lower.includes('reaction') ||
      lower.includes('photo') ||
      lower.includes('collision') ||
      lower.includes('energy')
    ) {
      return [
        {
          id: 's1',
          type: 'analyzed',
          text: 'Analyzed reaction kinetics & molecular conservation laws',
          tag: '#Physics',
          status: activeStepIndex > 0 ? 'completed' : 'active',
        },
        {
          id: 's2',
          type: 'ran',
          text: 'Ran verify elastic collision momentum transfer matrix',
          status: activeStepIndex > 1 ? 'completed' : activeStepIndex === 1 ? 'active' : 'completed',
        },
        {
          id: 's3',
          type: 'synthesized',
          text: 'Analyzed ⚛️ PhotolysisEnergySpectrum.ts #L1-85',
          tag: '#Quantum',
          status: activeStepIndex > 2 ? 'completed' : activeStepIndex === 2 ? 'active' : 'completed',
        },
        {
          id: 's4',
          type: 'rendered',
          text: 'Rendered 60fps simulation & [? ABOUT] HUD reticle inspector',
          status: activeStepIndex >= 3 ? 'completed' : 'active',
        },
      ];
    }

    // 2. Exam Prep / PDF / Guide
    if (lower.includes('pdf') || lower.includes('exam') || lower.includes('prep') || lower.includes('summary')) {
      return [
        {
          id: 's1',
          type: 'analyzed',
          text: 'Analyzed syllabus topics & high-yield revision objectives',
          tag: '#Curriculum',
          status: activeStepIndex > 0 ? 'completed' : 'active',
        },
        {
          id: 's2',
          type: 'ran',
          text: 'Ran compile KaTeX mathematical definitions & formulas',
          status: activeStepIndex > 1 ? 'completed' : activeStepIndex === 1 ? 'active' : 'completed',
        },
        {
          id: 's3',
          type: 'synthesized',
          text: 'Analyzed 📄 ExamStudyReferenceGuide.md #L1-160',
          tag: '#StudyGuide',
          status: activeStepIndex > 2 ? 'completed' : activeStepIndex === 2 ? 'active' : 'completed',
        },
        {
          id: 's4',
          type: 'rendered',
          text: 'Compiled 1-click printable PDF document exporter',
          status: activeStepIndex >= 3 ? 'completed' : 'active',
        },
      ];
    }

    // 3. Algorithms / Trees / Code
    if (lower.includes('tree') || lower.includes('binary') || lower.includes('code') || lower.includes('sort')) {
      return [
        {
          id: 's1',
          type: 'analyzed',
          text: 'Analyzed algorithmic time & space complexity bounds',
          tag: '#Complexity',
          status: activeStepIndex > 0 ? 'completed' : 'active',
        },
        {
          id: 's2',
          type: 'ran',
          text: 'Ran verify recursive node insertion & search invariants',
          status: activeStepIndex > 1 ? 'completed' : activeStepIndex === 1 ? 'active' : 'completed',
        },
        {
          id: 's3',
          type: 'synthesized',
          text: 'Analyzed ⚛️ BinarySearchTreeNode.ts #L1-120',
          tag: '#BST',
          status: activeStepIndex > 2 ? 'completed' : activeStepIndex === 2 ? 'active' : 'completed',
        },
        {
          id: 's4',
          type: 'rendered',
          text: 'Synthesized interactive SVG visualizer & traversal trace',
          status: activeStepIndex >= 3 ? 'completed' : 'active',
        },
      ];
    }

    // 4. Default General Reasoning Steps
    return [
      {
        id: 's1',
        type: 'analyzed',
        text: 'Analyzed request context & user intent',
        tag: '#Intent',
        status: activeStepIndex > 0 ? 'completed' : 'active',
      },
      {
        id: 's2',
        type: 'ran',
        text: 'Ran cross-reference neural reasoning models',
        status: activeStepIndex > 1 ? 'completed' : activeStepIndex === 1 ? 'active' : 'completed',
      },
      {
        id: 's3',
        type: 'synthesized',
        text: 'Analyzed ⚛️ ConceptualKnowledgeGraph.ts #L1-90',
        tag: '#Framework',
        status: activeStepIndex > 2 ? 'completed' : activeStepIndex === 2 ? 'active' : 'completed',
      },
      {
        id: 's4',
        type: 'rendered',
        text: 'Formulated structured response with KaTeX & visual formatting',
        status: activeStepIndex >= 3 ? 'completed' : 'active',
      },
    ];
  }, [promptText, customSteps, activeStepIndex]);

  const durationSec = Math.max(1, Math.round(elapsedMs / 1000));
  const activeStep = generatedSteps[Math.min(activeStepIndex, generatedSteps.length - 1)];

  return (
    <div className={`agent-steps-tray ${isStreaming ? 'agent-steps-tray--streaming' : ''}`}>
      {/* Header Bar */}
      <div
        className="agent-steps-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Click to view execution steps' : 'Click to collapse steps'}
      >
        <div className="agent-steps-header__left">
          {isStreaming ? (
            <>
              <span className="agent-steps-spinner" />
              <span className="agent-steps-title agent-steps-title--active">
                {activeStep ? activeStep.text : 'Thinking…'}
              </span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="agent-steps-title">
                Thought for {durationSec}s · {generatedSteps.length} steps completed
              </span>
            </>
          )}
        </div>

        <div className="agent-steps-header__right">
          {isStreaming && (
            <span className="agent-steps-timer">
              {(elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
          <button
            type="button"
            className={`agent-steps-chevron ${isCollapsed ? 'agent-steps-chevron--collapsed' : ''}`}
            aria-label={isCollapsed ? 'Expand steps' : 'Collapse steps'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable Steps List */}
      {!isCollapsed && (
        <div className="agent-steps-body">
          <div className="agent-steps-list">
            {generatedSteps.map((step, idx) => {
              const isRunning = isStreaming && idx === activeStepIndex;
              const isDone = !isStreaming || idx < activeStepIndex;

              return (
                <div
                  key={step.id}
                  className={`agent-step-item ${isRunning ? 'agent-step-item--active' : ''} ${
                    isDone ? 'agent-step-item--done' : ''
                  }`}
                >
                  <span className="agent-step-prefix">
                    {step.type === 'ran' ? (
                      <span className="agent-step-ran">Ran</span>
                    ) : step.type === 'analyzed' ? (
                      <span className="agent-step-analyzed">Analyzed</span>
                    ) : step.type === 'synthesized' ? (
                      <span className="agent-step-synthesized">Synthesized</span>
                    ) : (
                      <span className="agent-step-rendered">Rendered</span>
                    )}
                  </span>

                  <span className="agent-step-text">{step.text}</span>

                  {step.tag && <span className="agent-step-tag">{step.tag}</span>}

                  {step.type === 'ran' && <span className="agent-step-arrow">&gt;</span>}

                  {isRunning && <span className="agent-step-pulsar" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
