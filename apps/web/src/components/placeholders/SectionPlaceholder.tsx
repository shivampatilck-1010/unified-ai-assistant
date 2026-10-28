import { useState } from 'react';
import type { NavigationSection, SearchMatch } from '../../types';
import { searchConversations } from '../../lib/api';
import './SectionPlaceholder.css';

interface SectionConfig {
  title: string;
  badge: string;
  phase: string;
  description: string;
  plannedFeatures: string[];
  icon: React.ReactNode;
}

const sectionConfigs: Record<Exclude<NavigationSection, 'chat'>, SectionConfig> = {
  search: {
    title: 'Search & History',
    badge: 'Database Text Search (Active)',
    phase: 'Phase 2',
    description:
      'Database-backed text search across conversation titles and message content using PostgreSQL/SQLite text indexes.',
    plannedFeatures: [
      'Database-backed substring and title matching',
      'Scoped strictly to your identity boundary',
      'Snippet previews with deep-linking to conversations',
      'Semantic / vector search (deferred to later phase)',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  projects: {
    title: 'Projects & Workspaces',
    badge: 'Phase 2 Milestone',
    phase: 'Phase 2',
    description:
      'Isolated workspaces with scoped project instructions, pinned reference materials, and custom knowledge sets.',
    plannedFeatures: [
      'Custom system prompts and domain-specific guidance',
      'Context boundaries separating distinct client or codebase tasks',
      'Pinned reference files and persistent project memory',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 7h14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  'browser-agent': {
    title: 'Autonomous Browser Agent',
    badge: 'Phase 3 Milestone',
    phase: 'Phase 3',
    description:
      'Autonomous web execution worker supporting local Chrome via DevTools Protocol (CDP) and isolated cloud sandboxes.',
    plannedFeatures: [
      'Interactive visual execution preview with step-by-step progress',
      'Human-in-the-loop approvals for sensitive actions and form submissions',
      'DOM observation, element interaction, and secure credential handling',
      'Isolated containerized execution for untrusted web navigation',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 9h14M9 2a11 11 0 010 14M9 2a11 11 0 000 14" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  calendar: {
    title: 'Calendar & Tasks',
    badge: 'Phase 4 Milestone',
    phase: 'Phase 4',
    description:
      'Natural-language task creation, internal calendar agenda, reminders, and scheduled agent runs.',
    plannedFeatures: [
      'Conversational task scheduling ("remind me to check the deploy tomorrow at 9am")',
      'Interactive day/week calendar view with prioritized task cards',
      'Desktop notifications and recurring background triggers',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 7h14M6 1v4M12 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  files: {
    title: 'Files & Knowledge Base',
    badge: 'Phase 2 Milestone',
    phase: 'Phase 2',
    description:
      'Document uploads, structured knowledge indexing, citation graphs, and grounded retrieval.',
    plannedFeatures: [
      'Multi-format file upload (PDF, Markdown, Code, CSV)',
      'Server-side chunking and citation generation',
      'Direct in-chat referencing with verifiable quote highlights',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M4 2h6l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  'wifi-sensing': {
    title: 'Wi-Fi Presence Sensing',
    badge: 'Phase 5 Milestone',
    phase: 'Phase 5',
    description:
      'Isolated service analyzing Wi-Fi Channel State Information (CSI) for non-intrusive room presence and activity awareness.',
    plannedFeatures: [
      'CSI simulation daemon generating synthetic multipath perturbations',
      'Occupancy detection and breathing rate telemetry',
      'Assistant presence awareness ("User arrived at desk" status trigger)',
      'Strict local-only processing without external telemetry egress',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M2 7a10 10 0 0114 0M4.5 10a6.5 6.5 0 019 0M7 13a3 3 0 014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="15" r="1" fill="currentColor" />
      </svg>
    ),
  },
  orchestration: {
    title: 'Unified AI Orchestration Engine',
    badge: 'Phase 9 Milestone',
    phase: 'Phase 9',
    description:
      'Autonomous multi-capability coordination with strict dependency DAGs, human confirmation gates, and source provenance.',
    plannedFeatures: [
      'Ambiguity detection and clarification gates',
      'Cross-system tool coordination (files, research, browser, calendar, sensing)',
      'Concurrent execution of independent safe steps',
      'Strict human confirmation for consequential actions',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3 4.5h4v4H3zM11 4.5h4v4h-4zM7 9.5h4v4H7z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8.5v3h2M13 8.5v3h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  settings: {
    title: 'Settings & Model Configuration',
    badge: 'Server Credentials & Keys',
    phase: 'Phase 2',
    description:
      'Server-side model provider status, API key configuration instructions, and assistant preferences.',
    plannedFeatures: [
      'Hosted provider selection (OpenAI, Anthropic, Gemini)',
      'Server-side key verification status (keys kept strictly server-side)',
      'Theme customization and typography tuning',
      'Export and backup of local conversation history',
    ],
    icon: (
      <svg width="32" height="32" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.05 3.05l1.41 1.41M13.54 13.54l1.41 1.41M3.05 14.95l1.41-1.41M13.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
};

interface SectionPlaceholderProps {
  section: Exclude<NavigationSection, 'chat'>;
  onBackToChat: () => void;
  onSelectConversation?: (id: string) => void;
}

export function SectionPlaceholder({ section, onBackToChat, onSelectConversation }: SectionPlaceholderProps) {
  const config = sectionConfigs[section];
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);
      const res = await searchConversations(searchQuery.trim());
      setSearchResults(res.matches);
      setHasSearched(true);
    } catch {
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="section-placeholder">
      <div className="section-placeholder__card">
        <div className="section-placeholder__icon-wrap">{config.icon}</div>
        <div className="section-placeholder__badge">{config.badge}</div>
        <h2 className="section-placeholder__title">{config.title}</h2>
        <p className="section-placeholder__desc">{config.description}</p>

        {section === 'search' ? (
          <div className="section-placeholder__search-box">
            <form onSubmit={handleSearch} className="section-placeholder__search-form">
              <input
                type="text"
                className="section-placeholder__search-input"
                placeholder="Search conversation titles and messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="submit"
                className="section-placeholder__search-btn"
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </form>

            {hasSearched && (
              <div className="section-placeholder__results">
                {searchResults.length === 0 ? (
                  <p className="section-placeholder__no-results">
                    No matching conversations found for &ldquo;{searchQuery}&rdquo;.
                  </p>
                ) : (
                  <ul className="section-placeholder__results-list">
                    {searchResults.map((match, i) => (
                      <li key={i} className="section-placeholder__result-item">
                        <button
                          type="button"
                          className="section-placeholder__result-btn"
                          onClick={() => onSelectConversation?.(match.conversation_id)}
                        >
                          <div className="section-placeholder__result-title">
                            {match.conversation_title}
                          </div>
                          <div className="section-placeholder__result-snippet">
                            {match.snippet}
                          </div>
                          <span className="section-placeholder__result-tag">
                            {match.matched_type}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="section-placeholder__status-box">
            <div className="section-placeholder__status-label">Implementation Status</div>
            <div className="section-placeholder__status-value">
              <span className="section-placeholder__status-dot" />
              Not Implemented Yet — Scheduled for {config.phase}
            </div>
          </div>
        )}

        <div className="section-placeholder__features">
          <div className="section-placeholder__features-title">Planned Capabilities:</div>
          <ul className="section-placeholder__features-list">
            {config.plannedFeatures.map((feat, i) => (
              <li key={i}>{feat}</li>
            ))}
          </ul>
        </div>

        <button
          className="section-placeholder__back-btn"
          onClick={onBackToChat}
          type="button"
        >
          Return to Chat Workspace
        </button>
      </div>
    </div>
  );
}
