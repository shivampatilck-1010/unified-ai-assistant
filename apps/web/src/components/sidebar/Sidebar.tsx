import { type NavigationSection } from '../../types';
import './Sidebar.css';

interface SidebarNavItem {
  id: NavigationSection;
  label: string;
  icon: React.ReactNode;
}

const navItems: SidebarNavItem[] = [
  {
    id: 'chat',
    label: 'New Chat',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'search',
    label: 'Search',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 7h14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'browser-agent',
    label: 'Browser Agent',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 9h14M9 2a11 11 0 010 14M9 2a11 11 0 000 14" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar & Tasks',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 7h14M6 1v4M12 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'files',
    label: 'Files & Knowledge',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M4 2h6l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'wifi-sensing',
    label: 'Wi-Fi Sensing',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M2 7a10 10 0 0114 0M4.5 10a6.5 6.5 0 019 0M7 13a3 3 0 014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="15" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.05 3.05l1.41 1.41M13.54 13.54l1.41 1.41M3.05 14.95l1.41-1.41M13.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface SidebarProps {
  activeSection: NavigationSection;
  onNavigate: (section: NavigationSection) => void;
  onNewChat: () => void;
  conversations: { id: string; title: string; updated_at?: string; updatedAt?: number }[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onNavigate,
  onNewChat,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleNavClick = (id: NavigationSection) => {
    if (id === 'chat') {
      onNewChat();
    }
    onNavigate(id);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${
          mobileOpen ? 'sidebar--mobile-open' : ''
        }`}
        aria-label="Application navigation"
      >
        {/* Header */}
        <div className="sidebar__header">
          {!collapsed && (
            <div className="sidebar__brand">
              <span className="sidebar__brand-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="1" y="1" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M7 11h8M11 7v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span className="sidebar__brand-name">Unified AI</span>
            </div>
          )}
          <button
            className="sidebar__collapse-btn"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {collapsed ? (
                <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M11 3L6 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav" aria-label="Main navigation">
          <ul className="sidebar__nav-list" role="list">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  className={`sidebar__nav-item ${
                    activeSection === item.id ? 'sidebar__nav-item--active' : ''
                  }`}
                  onClick={() => handleNavClick(item.id)}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar__nav-icon">{item.icon}</span>
                  {!collapsed && (
                    <span className="sidebar__nav-label">{item.label}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Conversation History */}
        {!collapsed && activeSection === 'chat' && conversations.length > 0 && (
          <div className="sidebar__history">
            <div className="sidebar__history-label">Recent conversations</div>
            <ul className="sidebar__history-list" role="list">
              {conversations.slice(0, 20).map((conv) => (
                <li key={conv.id}>
                  <button
                    className={`sidebar__history-item ${
                      activeConversationId === conv.id
                        ? 'sidebar__history-item--active'
                        : ''
                    }`}
                    onClick={() => onSelectConversation(conv.id)}
                    title={conv.title}
                  >
                    <span className="sidebar__history-title">{conv.title}</span>
                    <div className="sidebar__history-actions">
                      <button
                        className="sidebar__history-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newTitle = window.prompt('Rename conversation:', conv.title);
                          if (newTitle && newTitle.trim()) {
                            onRenameConversation?.(conv.id, newTitle.trim());
                          }
                        }}
                        aria-label={`Rename conversation: ${conv.title}`}
                        title="Rename"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        className="sidebar__history-action sidebar__history-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                        aria-label={`Delete conversation: ${conv.title}`}
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Account area */}
        <div className="sidebar__footer">
          {!collapsed && (
            <div className="sidebar__account">
              <div className="sidebar__avatar" aria-hidden="true">U</div>
              <span className="sidebar__account-label">Local User</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
