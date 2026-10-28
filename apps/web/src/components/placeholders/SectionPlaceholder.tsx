import { type NavigationSection } from '../../types';
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
    badge: 'Phase 2 Milestone',
    phase: 'Phase 2',
    description:
      'Full-text conversational search across historical chats, messages, citations, and attached documents.',
    plannedFeatures: [
      'Keyword and semantic search across all conversations',
      'Filters by date range, model provider, and project tags',
      'Snippet preview with instant deep-linking to message contexts',
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
  settings: {
    title: 'Settings & Model Configuration',
    badge: 'Phase 2 Milestone',
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
}

export function SectionPlaceholder({ section, onBackToChat }: SectionPlaceholderProps) {
  const config = sectionConfigs[section];

  return (
    <div className="section-placeholder">
      <div className="section-placeholder__card">
        <div className="section-placeholder__icon-wrap">{config.icon}</div>
        <div className="section-placeholder__badge">{config.badge}</div>
        <h2 className="section-placeholder__title">{config.title}</h2>
        <p className="section-placeholder__desc">{config.description}</p>

        <div className="section-placeholder__status-box">
          <div className="section-placeholder__status-label">Implementation Status</div>
          <div className="section-placeholder__status-value">
            <span className="section-placeholder__status-dot" />
            Not Implemented Yet — Scheduled for {config.phase}
          </div>
        </div>

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
