import React, { useState } from 'react';
import type { ModelInfo } from '../../types';
import './CouncilSetupModal.css';

export interface CouncilSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: ModelInfo[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
}

export type CouncilModeType = 'dual' | 'full' | 'custom';

export const CouncilSetupModal: React.FC<CouncilSetupModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  selectedModelId,
  onSelectModel,
}) => {
  const [councilMode, setCouncilMode] = useState<CouncilModeType>(() => {
    if (selectedModelId?.includes('dual')) return 'dual';
    if (selectedModelId?.includes('roundtable') || selectedModelId?.includes('full')) return 'full';
    return 'dual';
  });

  const [selectedCustomModels, setSelectedCustomModels] = useState<string[]>([
    'deepseek/deepseek-r1',
    'anthropic/claude-3-7-sonnet',
    'nvidia/llama-3.1-nemotron-70b-instruct',
  ]);

  if (!isOpen) return null;

  const handleApply = (mode: CouncilModeType) => {
    if (mode === 'dual') {
      onSelectModel('council/dual-expert-deliberation');
    } else if (mode === 'full') {
      onSelectModel('council/executive-roundtable');
    } else {
      onSelectModel('council/executive-roundtable');
    }
    onClose();
  };

  const toggleCustomModel = (id: string) => {
    setSelectedCustomModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  return (
    <div className="council-modal__backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="council-modal__container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="council-modal__header">
          <div className="council-modal__title-group">
            <span className="council-modal__badge">Multi-Model Collaboration</span>
            <h2 className="council-modal__title">AI Council Meeting Room</h2>
          </div>
          <button
            type="button"
            className="council-modal__close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <p className="council-modal__description">
          Rather than relying on a single AI model, Council Mode runs your task through an authentic
          multidisciplinary executive meeting. Specialized frontier models discuss, challenge edge cases,
          and synthesize their contributions into a unified breakthrough output.
        </p>

        {/* Mode Selector Cards */}
        <div className="council-modal__modes">
          {/* Mode 1: Dual Expert */}
          <div
            className={`council-modal__mode-card ${councilMode === 'dual' ? 'council-modal__mode-card--active' : ''}`}
            onClick={() => setCouncilMode('dual')}
          >
            <div className="council-modal__mode-header">
              <div className="council-modal__mode-radio">
                <span className={`council-modal__radio-dot ${councilMode === 'dual' ? 'active' : ''}`} />
              </div>
              <div className="council-modal__mode-meta">
                <div className="council-modal__mode-name">
                  <span>⚡ Dual-Expert Debate</span>
                  <span className="council-modal__mode-pill">Top 2 Specialists</span>
                </div>
                <div className="council-modal__mode-sub">
                  Pairs the domain’s top theoretical reasoner with a lead systems architect for peer-review.
                </div>
              </div>
            </div>

            <div className="council-modal__team-preview">
              <div className="council-modal__agent-chip">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#1d4ed8' }} />
                <span>DeepSeek R1 (Reasoning & Math Proofs)</span>
              </div>
              <div className="council-modal__agent-divider">⇄ interacts with ⇄</div>
              <div className="council-modal__agent-chip">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#d97757' }} />
                <span>Claude 3.7 Sonnet (Systems Architecture)</span>
              </div>
            </div>
          </div>

          {/* Mode 2: Full Frontier Council */}
          <div
            className={`council-modal__mode-card ${councilMode === 'full' ? 'council-modal__mode-card--active' : ''}`}
            onClick={() => setCouncilMode('full')}
          >
            <div className="council-modal__mode-header">
              <div className="council-modal__mode-radio">
                <span className={`council-modal__radio-dot ${councilMode === 'full' ? 'active' : ''}`} />
              </div>
              <div className="council-modal__mode-meta">
                <div className="council-modal__mode-name">
                  <span>🏛️ Full Frontier Council</span>
                  <span className="council-modal__mode-pill council-modal__mode-pill--featured">
                    Executive Meeting (All 5 Roles)
                  </span>
                </div>
                <div className="council-modal__mode-sub">
                  Complete team roundtable: Theorist, Architect, Engineer, Adversarial Critic, and Executive Chair.
                </div>
              </div>
            </div>

            <div className="council-modal__roster-preview">
              <div className="council-modal__roster-row">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#1d4ed8' }} />
                <strong>DeepSeek R1:</strong>
                <span>Lead Theoretical Reasoner & First-Principles Proofs</span>
              </div>
              <div className="council-modal__roster-row">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#d97757' }} />
                <strong>Claude 3.7 Sonnet:</strong>
                <span>Systems Architect & Structural Coherence</span>
              </div>
              <div className="council-modal__roster-row">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#76b900' }} />
                <strong>NVIDIA Nemotron 70B:</strong>
                <span>Adversarial Red-Team & Edge-Case Verification</span>
              </div>
              <div className="council-modal__roster-row">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#8b5cf6' }} />
                <strong>Qwen 2.5 Coder 32B:</strong>
                <span>Production Implementation & Concrete Syntax</span>
              </div>
              <div className="council-modal__roster-row">
                <span className="council-modal__agent-dot" style={{ backgroundColor: '#0284c7' }} />
                <strong>Gemini 2.5 Pro:</strong>
                <span>Executive Chairperson & Consensus Unification</span>
              </div>
            </div>
          </div>

          {/* Mode 3: Custom Team Selection */}
          <div
            className={`council-modal__mode-card ${councilMode === 'custom' ? 'council-modal__mode-card--active' : ''}`}
            onClick={() => setCouncilMode('custom')}
          >
            <div className="council-modal__mode-header">
              <div className="council-modal__mode-radio">
                <span className={`council-modal__radio-dot ${councilMode === 'custom' ? 'active' : ''}`} />
              </div>
              <div className="council-modal__mode-meta">
                <div className="council-modal__mode-name">
                  <span>🛠️ Custom Meeting Room</span>
                  <span className="council-modal__mode-pill">Select Any Models</span>
                </div>
                <div className="council-modal__mode-sub">
                  Pick specific models from Google, NVIDIA, DeepSeek, Meta, and Anthropic to join the session.
                </div>
              </div>
            </div>

            {councilMode === 'custom' && (
              <div className="council-modal__custom-grid">
                {availableModels
                  .filter((m) => !m.id.startsWith('council/'))
                  .slice(0, 10)
                  .map((m) => {
                    const isChecked = selectedCustomModels.includes(m.id);
                    return (
                      <label key={m.id} className="council-modal__custom-item">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCustomModel(m.id)}
                        />
                        <span className="council-modal__custom-label">
                          {m.name.split('(')[0].trim()} ({m.provider})
                        </span>
                      </label>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="council-modal__footer">
          <div className="council-modal__footer-note">
            Zero added latency: The edge gateway coordinates the meeting protocol in a single unified stream.
          </div>
          <div className="council-modal__footer-actions">
            <button type="button" className="council-modal__cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="council-modal__apply-btn"
              onClick={() => handleApply(councilMode)}
            >
              Activate Council Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
