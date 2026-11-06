import { useState, useEffect, lazy, Suspense } from 'react';
import type { NavigationSection, UnifiedProviderStatusResponse } from './types';
import { useConversations } from './hooks/useConversations';
import { useHealthCheck } from './hooks/useHealthCheck';
import { fetchProviderStatus } from './lib/api';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { SectionPlaceholder } from './components/placeholders/SectionPlaceholder';
import { StatusIndicator } from './components/status/StatusIndicator';
import { ModelBrandLogo } from './components/brand/ModelBrandLogo';
import { ModelSelectorDropdown } from './components/chat/ModelSelectorDropdown';
import { CouncilSetupModal } from './components/chat/CouncilSetupModal';
import './App.css';

// Code-split heavy views to reduce initial bundle payload
const BrowserAgentView = lazy(() =>
  import('./components/browser/BrowserAgentView').then((m) => ({ default: m.BrowserAgentView }))
);
const CalendarTasksView = lazy(() =>
  import('./components/calendar/CalendarTasksView').then((m) => ({ default: m.CalendarTasksView }))
);
const FilesKnowledgeView = lazy(() =>
  import('./components/files/FilesKnowledgeView').then((m) => ({ default: m.FilesKnowledgeView }))
);
const WifiSensingView = lazy(() =>
  import('./components/sensing/WifiSensingView').then((m) => ({ default: m.WifiSensingView }))
);
const OrchestrationView = lazy(() =>
  import('./components/orchestration/OrchestrationView').then((m) => ({ default: m.OrchestrationView }))
);
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const SearchView = lazy(() =>
  import('./components/search/SearchView').then((m) => ({ default: m.SearchView }))
);
const ProjectsView = lazy(() =>
  import('./components/projects/ProjectsView').then((m) => ({ default: m.ProjectsView }))
);

export default function App() {
  const [activeSection, setActiveSection] = useState<NavigationSection>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [providerStatus, setProviderStatus] = useState<UnifiedProviderStatusResponse | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showCouncilModal, setShowCouncilModal] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcut Ctrl+\ or Cmd+\ to collapse/expand sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  };

  const {
    conversations,
    activeConversation,
    activeId,
    isStreaming,
    startNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
    sendMessage,
    retryMessage,
    cancelStream,
    refreshList,
  } = useConversations();

  const { status: healthStatus, health, error: healthError, recheck } = useHealthCheck();

  // Check server-side provider status when health connects
  useEffect(() => {
    let active = true;
    if (healthStatus === 'connected') {
      void fetchProviderStatus()
        .then((res) => {
          if (active) {
            setProviderStatus(res);
            if (res.active_model && !selectedModelId) {
              setSelectedModelId(res.active_model);
            }
          }
        })
        .catch(() => {
          if (active) setProviderStatus(null);
        });
    }
    return () => {
      active = false;
    };
  }, [healthStatus, selectedModelId]);

  const effectiveProviderStatus = healthStatus === 'connected' ? providerStatus : null;

  const handleNewChat = () => {
    startNewChat();
    setActiveSection('chat');
  };

  const handleSelectConversation = (id: string) => {
    void selectConversation(id);
    setActiveSection('chat');
    setMobileSidebarOpen(false);
  };

  const getSectionTitle = (section: NavigationSection): string => {
    switch (section) {
      case 'chat':
        return activeConversation?.title || 'Chat Workspace';
      case 'search':
        return 'Search';
      case 'projects':
        return 'Projects';
      case 'browser-agent':
        return 'Browser Agent';
      case 'calendar':
        return 'Calendar & Tasks';
      case 'files':
        return 'Files & Knowledge';
      case 'wifi-sensing':
        return 'Wi-Fi Sensing';
      case 'orchestration':
        return 'AI Orchestration Engine';
      case 'settings':
        return 'Settings';
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeSection={activeSection}
        onNavigate={(sec) => setActiveSection(sec)}
        onNewChat={handleNewChat}
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={deleteConversation}
        onRenameConversation={renameConversation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <main className="app-main">
        {/* Top Header */}
        <header className="app-header">
          <div className="app-header__left">
            {/* Unified Sidebar Toggle Button (Desktop & Mobile) */}
            <button
              className="app-header__sidebar-toggle-btn"
              onClick={() => {
                if (window.innerWidth <= 768) {
                  setMobileSidebarOpen((m) => !m);
                } else {
                  setSidebarCollapsed((c) => !c);
                }
              }}
              title={sidebarCollapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
              aria-label="Toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>

            <div className="app-header__title">
              <span>Unified AI</span>
              <span>/</span>
              <span className="app-header__title-active">{getSectionTitle(activeSection)}</span>
            </div>
          </div>

          <div className="app-header__right">
            {activeSection === 'chat' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {(() => {
                  const isUnifiedTeamActive = Boolean(
                    selectedModelId &&
                      (selectedModelId === 'unified-team' ||
                        selectedModelId.startsWith('unified-team:') ||
                        selectedModelId.startsWith('council/'))
                  );
                  return (
                    <button
                      type="button"
                      className={`chat-view__council-btn ${isUnifiedTeamActive ? 'chat-view__council-btn--active' : ''}`}
                      onClick={() => setShowCouncilModal(true)}
                      title="Configure Unified Team (Dual-Expert Debate or Full Multi-Model Frontier Meeting)"
                    >
                      <ModelBrandLogo modelId="unified-team" provider="unified-team" size={16} />
                      <span>{isUnifiedTeamActive ? 'Unified Team Active' : 'Unified Team'}</span>
                    </button>
                  );
                })()}

                {effectiveProviderStatus?.available_models && effectiveProviderStatus.available_models.length > 0 ? (
                  <ModelSelectorDropdown
                    availableModels={effectiveProviderStatus.available_models}
                    selectedModelId={selectedModelId ?? effectiveProviderStatus.active_model ?? null}
                    onSelectModel={(id) => setSelectedModelId(id)}
                    onOpenTeamModal={() => setShowCouncilModal(true)}
                  />
                ) : (
                  <div className="chat-view__model-unconfigured">
                    <span>Connecting to AI gateway...</span>
                  </div>
                )}
              </div>
            ) : (
              effectiveProviderStatus && (
                <div
                  className={`app-header__provider-badge ${
                    effectiveProviderStatus.configured ? '' : 'app-header__provider-badge--unconfigured'
                  }`}
                  title={effectiveProviderStatus.message}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ModelBrandLogo
                    provider={
                      selectedModelId?.startsWith('unified-team') || selectedModelId?.startsWith('council/')
                        ? 'unified-team'
                        : (selectedModelId?.split('/')[0] || effectiveProviderStatus.active_provider || effectiveProviderStatus.provider || undefined)
                    }
                    modelId={selectedModelId || undefined}
                    size={14}
                  />
                  <span>
                    {effectiveProviderStatus.configured
                      ? selectedModelId
                        ? selectedModelId.startsWith('unified-team') || selectedModelId.startsWith('council/')
                          ? 'AI: Unified Team'
                          : `AI: ${selectedModelId.split('/')[selectedModelId.includes('/') ? 1 : 0].split(':')[0]}`
                        : `AI: ${effectiveProviderStatus.active_provider || effectiveProviderStatus.provider}`
                      : 'AI Provider Not Configured'}
                  </span>
                </div>
              )
            )}

            <button
              className="app-header__icon-btn"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F11)'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <StatusIndicator
              status={healthStatus}
              version={health?.version}
              error={healthError}
              onRetry={recheck}
            />
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="app-content">
          <Suspense
            fallback={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#888',
                  fontSize: '13px',
                }}
              >
                <span>Loading view...</span>
              </div>
            }
          >
            {activeSection === 'chat' ? (
              <ChatView
                messages={activeConversation?.messages ?? []}
                onSend={sendMessage}
                onRetry={retryMessage}
                isStreaming={isStreaming}
                onCancel={cancelStream}
                onNewChat={handleNewChat}
                availableModels={effectiveProviderStatus?.available_models ?? []}
                selectedModelId={selectedModelId ?? effectiveProviderStatus?.active_model ?? null}
                onSelectModel={setSelectedModelId}
                conversationId={activeConversation?.id ?? null}
                conversationTitle={activeConversation?.title ?? 'Conversation'}
              />
            ) : activeSection === 'browser-agent' ? (
              <BrowserAgentView />
            ) : activeSection === 'calendar' ? (
              <CalendarTasksView />
            ) : activeSection === 'files' ? (
              <FilesKnowledgeView />
            ) : activeSection === 'wifi-sensing' ? (
              <WifiSensingView />
            ) : activeSection === 'orchestration' ? (
              <OrchestrationView />
            ) : activeSection === 'settings' ? (
              <SettingsView
                providerStatus={effectiveProviderStatus}
                onRefreshConversations={() => void refreshList()}
              />
            ) : activeSection === 'search' ? (
              <SearchView
                conversations={conversations}
                onSelectConversation={(id) => {
                  handleSelectConversation(id);
                  setActiveSection('chat');
                }}
                onNewChat={handleNewChat}
              />
            ) : activeSection === 'projects' ? (
              <ProjectsView
                onSelectConversation={(id) => {
                  handleSelectConversation(id);
                  setActiveSection('chat');
                }}
                onOpenChatInProject={(_projId, convId) => {
                  handleSelectConversation(convId);
                  setActiveSection('chat');
                }}
                onBackToChat={() => setActiveSection('chat')}
              />
            ) : (
              <SectionPlaceholder
                section={activeSection}
                onBackToChat={() => setActiveSection('chat')}
                onSelectConversation={handleSelectConversation}
              />
            )}
          </Suspense>
        </div>
      </main>

      <CouncilSetupModal
        isOpen={showCouncilModal}
        onClose={() => setShowCouncilModal(false)}
        availableModels={effectiveProviderStatus?.available_models ?? []}
        selectedModelId={selectedModelId ?? effectiveProviderStatus?.active_model ?? null}
        onSelectModel={(id) => setSelectedModelId(id)}
      />
    </div>
  );
}
