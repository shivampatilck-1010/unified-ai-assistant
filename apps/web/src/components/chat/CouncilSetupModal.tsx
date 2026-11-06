import React, { useState, useMemo } from 'react';
import type { ModelInfo } from '../../types';
import { ModelBrandLogo } from '../brand/ModelBrandLogo';
import './CouncilSetupModal.css';

export interface CouncilSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: ModelInfo[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
}

export type CouncilPresetType =
  | 'dual-expert'
  | 'frontier-council'
  | 'code-pair'
  | 'scientific-symposium'
  | 'custom';

function inferRole(modelId: string, modelName: string): string {
  const s = (modelId + ' ' + modelName).toLowerCase();
  if (s.includes('r1') || s.includes('o1') || s.includes('math') || s.includes('reasoning'))
    return 'Theoretical Reasoning';
  if (s.includes('nemotron') || s.includes('audit')) return 'Adversarial Red-Team';
  if (s.includes('claude') || s.includes('sonnet') || s.includes('architect'))
    return 'Systems Architecture';
  if (s.includes('coder') || s.includes('qwen') || s.includes('code'))
    return 'Implementation & Code';
  if (s.includes('gemini') || s.includes('gpt-4o')) return 'Consensus & Chairperson';
  return 'Domain Specialist';
}

export const CouncilSetupModal: React.FC<CouncilSetupModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  selectedModelId,
  onSelectModel,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [selectedPreset, setSelectedPreset] = useState<CouncilPresetType>(() => {
    if (selectedModelId?.includes('dual')) return 'dual-expert';
    if (selectedModelId?.includes('code-pair')) return 'code-pair';
    if (selectedModelId?.includes('scientific')) return 'scientific-symposium';
    return 'frontier-council';
  });

  const [customModelIds, setCustomModelIds] = useState<string[]>([
    'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
    'groq/openai/gpt-oss-120b',
    'groq/qwen/qwen3.8-27b',
    'gemini-2.5-pro',
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');

  const regularModels = useMemo(() => {
    return availableModels.filter(
      (m) => !m.id.startsWith('council/') && !m.id.startsWith('unified-team')
    );
  }, [availableModels]);

  const providerList = useMemo(() => {
    const set = new Set<string>();
    regularModels.forEach((m) => {
      if (m.provider) set.add(m.provider);
    });
    return ['all', ...Array.from(set)];
  }, [regularModels]);

  const filteredCustomList = useMemo(() => {
    return regularModels.filter((m) => {
      const matchProvider =
        providerFilter === 'all' || m.provider.toLowerCase() === providerFilter.toLowerCase();
      const matchSearch =
        !searchQuery.trim() ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.provider.toLowerCase().includes(searchQuery.toLowerCase());
      return matchProvider && matchSearch;
    });
  }, [regularModels, providerFilter, searchQuery]);

  if (!isOpen) return null;

  const toggleCustomModel = (id: string) => {
    setCustomModelIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleApply = () => {
    if (activeTab === 'presets') {
      if (selectedPreset === 'dual-expert') {
        onSelectModel('unified-team:dual-expert');
      } else if (selectedPreset === 'code-pair') {
        onSelectModel('unified-team:code-pair');
      } else if (selectedPreset === 'scientific-symposium') {
        onSelectModel('unified-team:scientific-symposium');
      } else {
        onSelectModel('unified-team:frontier-council');
      }
    } else {
      onSelectModel('unified-team');
    }
    onClose();
  };

  return (
    <div className="council-modal__backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="council-modal__container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="council-modal__header">
          <div className="council-modal__title-group">
            <span className="council-modal__badge">Multi-Model Collaborative Intelligence</span>
            <h2 className="council-modal__title">Unified Team: Executive Meeting Room</h2>
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

        {/* Assembled Bench / Table */}
        <div className="council-modal__bench">
          <div className="council-modal__bench-header">
            <span className="council-modal__bench-title">
              <ModelBrandLogo modelId="unified-team" provider="unified-team" size={16} /> Assembled Meeting Chamber ({customModelIds.length} Models Seated)
            </span>
            <span className="council-modal__bench-note">
              Estimated Deliberation Consensus: 99.4%
            </span>
          </div>

          <div className="council-modal__bench-chips">
            {customModelIds.map((id) => {
              const model = regularModels.find((m) => m.id === id);
              const name = model?.name.split('(')[0].trim() || id;
              const role = inferRole(id, model?.name || '');

              return (
                <div key={id} className="council-modal__seated-chip">
                  <ModelBrandLogo
                    provider={model?.provider}
                    modelId={id}
                    size={16}
                    className="council-modal__seated-logo"
                  />
                  <div className="council-modal__seated-info">
                    <span className="council-modal__seated-name">{name}</span>
                    <span className="council-modal__seated-role">{role}</span>
                  </div>
                  <button
                    type="button"
                    className="council-modal__seated-remove"
                    onClick={() => toggleCustomModel(id)}
                    title={`Remove ${name} from meeting`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* View Tabs */}
        <div className="council-modal__tabs">
          <button
            type="button"
            className={`council-modal__tab ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            Curated Team Presets
          </button>
          <button
            type="button"
            className={`council-modal__tab ${activeTab === 'custom' ? 'active' : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            Custom Team Builder ({regularModels.length} Models)
          </button>
        </div>

        {/* Content Section */}
        <div className="council-modal__body">
          {activeTab === 'presets' ? (
            <div className="council-modal__presets-grid">
              {/* Preset 1: Full Frontier Council */}
              <div
                className={`council-modal__preset-card ${
                  selectedPreset === 'frontier-council' ? 'selected' : ''
                }`}
                onClick={() => setSelectedPreset('frontier-council')}
              >
                <div className="council-modal__preset-header">
                  <div className="council-modal__preset-radio">
                    <span className={`dot ${selectedPreset === 'frontier-council' ? 'active' : ''}`} />
                  </div>
                  <div className="council-modal__preset-meta">
                    <div className="council-modal__preset-title-row">
                      <span className="council-modal__preset-name">Full Frontier Council</span>
                      <span className="council-modal__preset-tag featured">Flagship (4 Roles)</span>
                    </div>
                    <p className="council-modal__preset-desc">
                      A complete executive roundtable covering Theory, Red-Team Audit,
                      Architecture, Coding, and Consensus.
                    </p>
                  </div>
                </div>

                <div className="council-modal__preset-members">
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="nvidia" size={13} /> Nemotron 550B (Critic)
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="groq" size={13} /> Groq GPT-OSS 120B (Reasoning)
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="qwen" size={13} /> Groq Qwen 27B (Implementation)
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="google" size={13} /> Gemini 2.5 Pro (Chair)
                  </span>
                </div>
              </div>

              {/* Preset 2: Dual Expert Debate */}
              <div
                className={`council-modal__preset-card ${
                  selectedPreset === 'dual-expert' ? 'selected' : ''
                }`}
                onClick={() => setSelectedPreset('dual-expert')}
              >
                <div className="council-modal__preset-header">
                  <div className="council-modal__preset-radio">
                    <span className={`dot ${selectedPreset === 'dual-expert' ? 'active' : ''}`} />
                  </div>
                  <div className="council-modal__preset-meta">
                    <div className="council-modal__preset-title-row">
                      <span className="council-modal__preset-name">Dual-Expert Debate</span>
                      <span className="council-modal__preset-tag">Top 2 Specialists</span>
                    </div>
                    <p className="council-modal__preset-desc">
                      High-velocity debate: NVIDIA Nemotron 550B critiques assumptions and bounds, while Groq Qwen 27B solves the concrete implementation.
                    </p>
                  </div>
                </div>

                <div className="council-modal__preset-members">
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="nvidia" size={13} /> Nemotron 550B (Critic)
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="qwen" size={13} /> Groq Qwen 27B (LPU Code Lead)
                  </span>
                </div>
              </div>

              {/* Preset 3: Elite Engineering Pair */}
              <div
                className={`council-modal__preset-card ${
                  selectedPreset === 'code-pair' ? 'selected' : ''
                }`}
                onClick={() => setSelectedPreset('code-pair')}
              >
                <div className="council-modal__preset-header">
                  <div className="council-modal__preset-radio">
                    <span className={`dot ${selectedPreset === 'code-pair' ? 'active' : ''}`} />
                  </div>
                  <div className="council-modal__preset-meta">
                    <div className="council-modal__preset-title-row">
                      <span className="council-modal__preset-name">Elite Engineering Pair</span>
                      <span className="council-modal__preset-tag">Code & System Design</span>
                    </div>
                    <p className="council-modal__preset-desc">
                      Dedicated software chamber: Architecture design paired with precision
                      implementation by Qwen 2.5 Coder and edge-case security audit by Nemotron.
                    </p>
                  </div>
                </div>

                <div className="council-modal__preset-members">
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="qwen" size={13} /> Groq Qwen 27B
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="anthropic" size={13} /> Claude 3.5 Sonnet
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="nvidia" size={13} /> Nemotron 550B
                  </span>
                </div>
              </div>

              {/* Preset 4: Scientific Symposium */}
              <div
                className={`council-modal__preset-card ${
                  selectedPreset === 'scientific-symposium' ? 'selected' : ''
                }`}
                onClick={() => setSelectedPreset('scientific-symposium')}
              >
                <div className="council-modal__preset-header">
                  <div className="council-modal__preset-radio">
                    <span
                      className={`dot ${selectedPreset === 'scientific-symposium' ? 'active' : ''}`}
                    />
                  </div>
                  <div className="council-modal__preset-meta">
                    <div className="council-modal__preset-title-row">
                      <span className="council-modal__preset-name">Scientific Symposium</span>
                      <span className="council-modal__preset-tag">STEM, Physics & Math</span>
                    </div>
                    <p className="council-modal__preset-desc">
                      Heavy STEM reasoning: Gemini 2.5 Pro multimodal telemetry paired with DeepSeek R1
                      and OpenAI o3-mini theorem proving.
                    </p>
                  </div>
                </div>

                <div className="council-modal__preset-members">
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="google" size={13} /> Gemini 2.5 Pro
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="deepseek" size={13} /> DeepSeek R1
                  </span>
                  <span className="council-modal__member-pill">
                    <ModelBrandLogo provider="openai" size={13} /> OpenAI o3-mini
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="council-modal__custom-builder">
              {/* Search & Provider Filter Bar */}
              <div className="council-modal__custom-toolbar">
                <input
                  type="text"
                  className="council-modal__custom-search"
                  placeholder="Search models to invite to the team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="council-modal__custom-pills">
                  {providerList.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`council-modal__provider-btn ${
                        providerFilter === p ? 'active' : ''
                      }`}
                      onClick={() => setProviderFilter(p)}
                    >
                      {p === 'all' ? 'All Providers' : p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Grid */}
              <div className="council-modal__model-cards-grid">
                {filteredCustomList.map((m) => {
                  const isSeated = customModelIds.includes(m.id);
                  const role = inferRole(m.id, m.name);

                  return (
                    <div
                      key={m.id}
                      className={`council-modal__model-card ${isSeated ? 'seated' : ''}`}
                      onClick={() => toggleCustomModel(m.id)}
                    >
                      <div className="council-modal__model-card-top">
                        <ModelBrandLogo provider={m.provider} modelId={m.id} size={16} />
                        <span className="council-modal__model-card-provider">{m.provider}</span>
                        <button
                          type="button"
                          className={`council-modal__toggle-btn ${isSeated ? 'in-team' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCustomModel(m.id);
                          }}
                        >
                          {isSeated ? '✓ In Team' : '+ Invite'}
                        </button>
                      </div>

                      <div className="council-modal__model-card-name">
                        {m.name.split('(')[0].trim()}
                      </div>
                      <div className="council-modal__model-card-role">{role}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="council-modal__footer">
          <div className="council-modal__footer-status">
            Active Mode: <strong>Unified Team</strong> (
            {activeTab === 'presets' ? selectedPreset : `${customModelIds.length} Custom Models`}
            )
          </div>
          <div className="council-modal__footer-actions">
            <button type="button" className="council-modal__cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="council-modal__apply-btn" onClick={handleApply}>
              Launch Unified Team
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
