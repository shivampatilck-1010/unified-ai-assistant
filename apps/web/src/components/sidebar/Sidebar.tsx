import { useState } from 'react';
import { type NavigationSection } from '../../types';
import { UnifiedLogo } from '../brand/UnifiedLogo';
import { GoogleLoginModal } from '../auth/GoogleLoginModal';
import { getStoredUser, logoutUser, type UserProfile } from '../../lib/api';
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
    id: 'orchestration',
    label: 'Orchestration',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3 4.5h4v4H3zM11 4.5h4v4h-4zM7 9.5h4v4H7z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8.5v3h2M13 8.5v3h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

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
          {!collapsed ? (
            <>
              <div
                className="sidebar__brand"
                onClick={onNewChat}
                style={{ cursor: 'pointer' }}
                title="New conversation"
              >
                <span className="sidebar__brand-icon" aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
                  <UnifiedLogo size={28} />
                </span>
                <span className="sidebar__brand-name">Unified AI</span>
              </div>
              <button
                className="sidebar__collapse-btn"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M11 3L6 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          ) : (
            <div className="sidebar__collapsed-header">
              <button
                className="sidebar__collapse-btn sidebar__collapse-btn--docked"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav" aria-label="Main navigation">
          <ul className="sidebar__nav-list" role="list">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
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
        {!collapsed && conversations.length > 0 && (
          <div className="sidebar__history">
            <div className="sidebar__history-label">Recent conversations</div>
            <ul className="sidebar__history-list" role="list">
              {conversations.slice(0, 30).map((conv) => (
                <li key={conv.id}>
                  <div
                    className={`sidebar__history-item ${
                      activeConversationId === conv.id
                        ? 'sidebar__history-item--active'
                        : ''
                    }`}
                    onClick={() => onSelectConversation(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectConversation(conv.id);
                      }
                    }}
                    title={conv.title}
                  >
                    <span className="sidebar__history-title">{conv.title}</span>
                    <div className="sidebar__history-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
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
                        type="button"
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
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Account area */}
        <div className="sidebar__footer">
          {!collapsed ? (
            user ? (
              <div
                className="sidebar__account"
                onClick={() => setShowAuthModal(true)}
                style={{ cursor: 'pointer' }}
                title="Manage Google Account"
              >
                <div className="sidebar__avatar" aria-hidden="true" style={{ overflow: 'hidden' }}>
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="sidebar__account-label" style={{ fontWeight: 600, color: '#f3f4f6' }}>{user.name}</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="sidebar__google-login-btn"
                onClick={() => setShowAuthModal(true)}
                title="Sign in with Google"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign in with Google</span>
              </button>
            )
          ) : (
            <button
              type="button"
              className="sidebar__account-collapsed-btn"
              onClick={() => setShowAuthModal(true)}
              title={user ? user.name : 'Sign in with Google'}
            >
              {user ? (
                <div className="sidebar__avatar" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </aside>

      <GoogleLoginModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={user}
        onLoginSuccess={(u) => setUser(u)}
        onLogout={() => {
          void logoutUser();
          setUser(null);
        }}
      />
    </>
  );
}
