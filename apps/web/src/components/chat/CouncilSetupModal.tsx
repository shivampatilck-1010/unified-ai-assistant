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
  | 'frontier-council'
  | 'dual-expert'
  | 'code-pair'
  | 'scientific-symposium';

export interface CouncilPresetMember {
  id: string;
  name: string;
  role: string;
  provider: string;
}

export interface CouncilPresetConfig {
  id: CouncilPresetType;
  name: string;
  tag: string;
  featured?: boolean;
  desc: string;
  members: CouncilPresetMember[];
}

export const COUNCIL_PRESETS: CouncilPresetConfig[] = [
  {
    id: 'frontier-council',
    name: 'Full Frontier Council',
    tag: 'Flagship (4 Roles)',
    featured: true,
    desc: 'Executive multi-model roundtable covering Theoretical Reasoning, Red-Team Audit, High-Speed Code, and Consensus Chair.',
    members: [
      { id: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 550B', role: 'Adversarial Red-Team', provider: 'nvidia' },
      { id: 'groq/openai/gpt-oss-120b', name: 'Groq GPT-OSS 120B', role: 'Theoretical Reasoning', provider: 'groq' },
      { id: 'groq/qwen/qwen3.8-27b', name: 'Groq Qwen 27B', role: 'Implementation & Code', provider: 'qwen' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', role: 'Consensus Chair', provider: 'google' },
    ],
  },
  {
    id: 'dual-expert',
    name: 'Dual-Expert Debate',
    tag: 'Top 2 Specialists',
    desc: 'High-velocity dialectic: NVIDIA Nemotron 550B challenges assumptions and limits, while Groq Qwen 27B crafts executable implementations.',
    members: [
      { id: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 550B', role: 'Adversarial Critic', provider: 'nvidia' },
      { id: 'groq/qwen/qwen3.8-27b', name: 'Groq Qwen 27B', role: 'Fast Implementation', provider: 'qwen' },
    ],
  },
  {
    id: 'code-pair',
    name: 'Elite Engineering Pair',
    tag: 'Code & Architecture',
    desc: 'Precision software chamber: Groq Qwen 27B system architecture paired with Cohere North Mini Code for rapid implementation & precision debugging.',
    members: [
      { id: 'groq/qwen/qwen3.8-27b', name: 'Groq Qwen 27B', role: 'Lead Architect & Code', provider: 'qwen' },
      { id: 'openrouter/cohere/north-mini-code:free', name: 'Cohere North Code', role: 'Refactor & Logic Verification', provider: 'openrouter' },
    ],
  },
  {
    id: 'scientific-symposium',
    name: 'Scientific Symposium',
    tag: 'STEM, Physics & Math',
    desc: 'Heavy STEM reasoning: Gemini 2.5 Pro multimodal telemetry paired with AM-Thinking-v1 deep mathematical proofs and Nemotron 3.5 Super VL.',
    members: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', role: 'Multimodal Telemetry', provider: 'google' },
      { id: 'openrouter/am-thinking-v1:free', name: 'AM-Thinking-v1', role: 'Mathematical Proofs', provider: 'openrouter' },
      { id: 'openrouter/nvidia/nemotron-3.5-super-vl:free', name: 'Nemotron Super VL', role: 'Multimodal MoE Analysis', provider: 'nvidia' },
    ],
  },
];

function inferRole(modelId: string, modelName: string): string {
  const s = (modelId + ' ' + modelName).toLowerCase();
  if (s.includes('r1') || s.includes('o1') || s.includes('math') || s.includes('thinking') || s.includes('reasoning'))
    return 'Theoretical Reasoning';
  if (s.includes('nemotron') || s.includes('audit')) return 'Adversarial Red-Team';
  if (s.includes('claude') || s.includes('sonnet') || s.includes('architect'))
    return 'Systems Architecture';
  if (s.includes('coder') || s.includes('qwen') || s.includes('code') || s.includes('devstral'))
    return 'Implementation & Code';
  if (s.includes('gemini') || s.includes('gpt-4o') || s.includes('chair')) return 'Consensus & Chair';
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
      (m) => !m.id.startsWith('council/') && !m.id.startsWith('unified-team') && m.id !== 'auto'
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

  // Seated models: Dynamically sync with active tab (preset or custom builder)
  const currentSeatedList = useMemo(() => {
    if (activeTab === 'presets') {
      const preset = COUNCIL_PRESETS.find((p) => p.id === selectedPreset) || COUNCIL_PRESETS[0];
      return preset.members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        provider: m.provider,
        canRemove: false,
      }));
    }
    return customModelIds.map((id) => {
      const found = regularModels.find((m) => m.id === id);
      return {
        id,
        name: found?.name.split('(')[0].trim() || id.split('/').pop() || id,
        role: inferRole(id, found?.name || ''),
        provider: found?.provider || (id.includes('groq') ? 'groq' : id.includes('gemini') ? 'google' : 'nvidia'),
        canRemove: true,
      };
    });
  }, [activeTab, selectedPreset, customModelIds, regularModels]);

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
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Assembled Bench / Seated Bar (Synchronized Live) */}
        <div className="council-modal__bench">
          <div className="council-modal__bench-header">
            <span className="council-modal__bench-title">
              <ModelBrandLogo modelId="unified-team" provider="unified-team" size={16} />
              <span>Assembled Meeting Chamber ({currentSeatedList.length} Models Seated)</span>
            </span>
            <span className="council-modal__bench-note">
              ● Deliberation Consensus: 99.4%
            </span>
          </div>

          <div className="council-modal__bench-chips">
            {currentSeatedList.map((m) => (
              <div key={m.id} className="council-modal__seated-chip">
                <ModelBrandLogo
                  provider={m.provider}
                  modelId={m.id}
                  size={15}
                  className="council-modal__seated-logo"
                />
                <div className="council-modal__seated-info">
                  <span className="council-modal__seated-name">{m.name}</span>
                  <span className="council-modal__seated-role">{m.role}</span>
                </div>
                {m.canRemove && (
                  <button
                    type="button"
                    className="council-modal__seated-remove"
                    onClick={() => toggleCustomModel(m.id)}
                    title={`Remove ${m.name} from team`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Segmented View Tabs */}
        <div className="council-modal__tabs-bar">
          <div className="council-modal__segmented-control">
            <button
              type="button"
              className={`council-modal__segment-btn ${activeTab === 'presets' ? 'active' : ''}`}
              onClick={() => setActiveTab('presets')}
            >
              Curated Team Presets (4)
            </button>
            <button
              type="button"
              className={`council-modal__segment-btn ${activeTab === 'custom' ? 'active' : ''}`}
              onClick={() => setActiveTab('custom')}
            >
              Custom Team Builder ({regularModels.length} Models)
            </button>
          </div>
        </div>

        {/* Content Section */}
        <div className="council-modal__body">
          {activeTab === 'presets' ? (
            <div className="council-modal__presets-grid">
              {COUNCIL_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`council-modal__preset-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedPreset(preset.id)}
                  >
                    <div className="council-modal__preset-header">
                      <div className="council-modal__preset-radio">
                        <span className={`dot ${isSelected ? 'active' : ''}`} />
                      </div>
                      <div className="council-modal__preset-meta">
                        <div className="council-modal__preset-title-row">
                          <span className="council-modal__preset-name">{preset.name}</span>
                          <span className={`council-modal__preset-tag ${preset.featured ? 'featured' : ''}`}>
                            {preset.tag}
                          </span>
                        </div>
                        <p className="council-modal__preset-desc">{preset.desc}</p>
                      </div>
                    </div>

                    <div className="council-modal__preset-members">
                      {preset.members.map((member) => (
                        <span key={member.id} className="council-modal__member-pill">
                          <ModelBrandLogo provider={member.provider} modelId={member.id} size={13} />
                          <span>{member.name}</span>
                          <span className="council-modal__member-role-sub">({member.role.split(' ')[0]})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
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
                      className={`council-modal__provider-btn ${providerFilter === p ? 'active' : ''}`}
                      onClick={() => setProviderFilter(p)}
                    >
                      {p === 'all' ? 'All Providers' : p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Cards Grid */}
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
            {activeTab === 'presets'
              ? COUNCIL_PRESETS.find((p) => p.id === selectedPreset)?.name
              : `${customModelIds.length} Custom Models Seated`}
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
