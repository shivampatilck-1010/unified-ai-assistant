import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { ModelInfo } from '../../types';
import './ModelSelectorDropdown.css';

export interface ModelSelectorDropdownProps {
  availableModels: ModelInfo[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  onOpenTeamModal?: () => void;
}

function getProviderColor(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p.includes('unified') || p.includes('council')) return '#d97757'; // Terracotta
  if (p.includes('google') || p.includes('gemini')) return '#38bdf8'; // Sky Blue
  if (p.includes('anthropic') || p.includes('claude')) return '#f97316'; // Claude Orange
  if (p.includes('openai')) return '#10b981'; // Emerald Green
  if (p.includes('nvidia')) return '#84cc16'; // NVIDIA Lime
  if (p.includes('deepseek')) return '#6366f1'; // Indigo
  if (p.includes('qwen')) return '#a855f7'; // Purple
  if (p.includes('groq') || p.includes('meta')) return '#ec4899'; // Pink/Magenta
  if (p.includes('local') || p.includes('ollama')) return '#eab308'; // Amber
  return '#94a3b8';
}

function formatContextWindow(tokens?: number | null): string {
  if (!tokens) return '';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M ctx`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k ctx`;
  return `${tokens} ctx`;
}

export const ModelSelectorDropdown: React.FC<ModelSelectorDropdownProps> = ({
  availableModels,
  selectedModelId,
  onSelectModel,
  onOpenTeamModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen]);

  const activeModel = useMemo(() => {
    return availableModels.find((m) => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);

  // Extract unique provider categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    availableModels.forEach((m) => {
      if (m.provider) set.add(m.provider);
    });
    return ['all', ...Array.from(set)];
  }, [availableModels]);

  // Filtered models based on search and category
  const filteredModels = useMemo(() => {
    return availableModels.filter((m) => {
      const matchesCategory =
        selectedCategory === 'all' || m.provider.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.provider.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [availableModels, selectedCategory, searchQuery]);

  // Group filtered models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {};
    filteredModels.forEach((m) => {
      const key = m.provider || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    return groups;
  }, [filteredModels]);

  const isUnifiedTeam = Boolean(
    activeModel?.id === 'unified-team' ||
      activeModel?.id.startsWith('unified-team:') ||
      activeModel?.id.startsWith('council/')
  );

  return (
    <div className="model-dropdown" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className={`model-dropdown__trigger ${isOpen ? 'model-dropdown__trigger--open' : ''} ${
          isUnifiedTeam ? 'model-dropdown__trigger--team' : ''
        }`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className="model-dropdown__trigger-dot"
          style={{ backgroundColor: getProviderColor(activeModel?.provider || '') }}
          aria-hidden="true"
        />

        <div className="model-dropdown__trigger-text">
          <span className="model-dropdown__trigger-name">
            {activeModel?.name.split('(')[0].trim() || 'Select Model'}
          </span>
          {activeModel?.provider && (
            <span className="model-dropdown__trigger-provider">{activeModel.provider}</span>
          )}
        </div>

        {activeModel?.context_window && (
          <span className="model-dropdown__trigger-badge">
            {formatContextWindow(activeModel.context_window)}
          </span>
        )}

        <svg
          className={`model-dropdown__trigger-chevron ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown Popup Menu */}
      {isOpen && (
        <div className="model-dropdown__menu" role="listbox">
          {/* Search Header */}
          <div className="model-dropdown__search-bar">
            <svg
              className="model-dropdown__search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="model-dropdown__search-input"
              placeholder="Search 26+ AI models (Nemotron, Claude, R1, 405B, Qwen...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="model-dropdown__search-clear"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Unified Team Banner Shortcut */}
          <div className="model-dropdown__team-banner">
            <div className="model-dropdown__team-info">
              <span className="model-dropdown__team-badge">COLLABORATIVE INTELLIGENCE</span>
              <strong className="model-dropdown__team-title">Unified Team Meeting Room</strong>
              <p className="model-dropdown__team-desc">
                Deploy DeepSeek R1, Claude 3.7, Nemotron 70B, Qwen Coder, and Gemini together as a coordinated team.
              </p>
            </div>
            <button
              type="button"
              className="model-dropdown__team-btn"
              onClick={() => {
                setIsOpen(false);
                onOpenTeamModal?.();
              }}
            >
              Configure Team ⚙
            </button>
          </div>

          {/* Category Filter Chips */}
          <div className="model-dropdown__categories">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`model-dropdown__cat-chip ${
                  selectedCategory.toLowerCase() === cat.toLowerCase()
                    ? 'model-dropdown__cat-chip--active'
                    : ''
                }`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'all' ? 'All Models' : cat}
              </button>
            ))}
          </div>

          {/* Models List */}
          <div className="model-dropdown__list">
            {Object.keys(groupedModels).length === 0 ? (
              <div className="model-dropdown__empty">
                No models found matching "{searchQuery}"
              </div>
            ) : (
              Object.entries(groupedModels).map(([providerName, models]) => (
                <div key={providerName} className="model-dropdown__group">
                  <div className="model-dropdown__group-header">
                    <span
                      className="model-dropdown__group-dot"
                      style={{ backgroundColor: getProviderColor(providerName) }}
                    />
                    <span>{providerName}</span>
                    <span className="model-dropdown__group-count">({models.length})</span>
                  </div>

                  <div className="model-dropdown__group-items">
                    {models.map((m) => {
                      const isSelected = selectedModelId === m.id;
                      const hasSubtext = m.name.includes('(');
                      const primaryName = hasSubtext ? m.name.split('(')[0].trim() : m.name;
                      const detailText = hasSubtext
                        ? m.name.slice(m.name.indexOf('(') + 1, m.name.lastIndexOf(')'))
                        : '';

                      return (
                        <div
                          key={m.id}
                          className={`model-dropdown__item ${
                            isSelected ? 'model-dropdown__item--selected' : ''
                          }`}
                          onClick={() => {
                            onSelectModel(m.id);
                            setIsOpen(false);
                          }}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="model-dropdown__item-main">
                            <div className="model-dropdown__item-title-row">
                              <span className="model-dropdown__item-name">{primaryName}</span>
                              {m.context_window && (
                                <span className="model-dropdown__item-ctx">
                                  {formatContextWindow(m.context_window)}
                                </span>
                              )}
                            </div>
                            {detailText && (
                              <div className="model-dropdown__item-sub">{detailText}</div>
                            )}
                          </div>

                          {isSelected && (
                            <span className="model-dropdown__item-check" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
