import { useState, useEffect, lazy, Suspense } from 'react';
import type { NavigationSection, UnifiedProviderStatusResponse } from './types';
import { useConversations } from './hooks/useConversations';
import { useHealthCheck } from './hooks/useHealthCheck';
import { fetchProviderStatus } from './lib/api';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { SectionPlaceholder } from './components/placeholders/SectionPlaceholder';
import { StatusIndicator } from './components/status/StatusIndicator';
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
            <button
              className="app-header__menu-btn"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3 4.5h12M3 9h12M3 13.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <div className="app-header__title">
              <span>Unified AI</span>
              <span>/</span>
              <span className="app-header__title-active">{getSectionTitle(activeSection)}</span>
            </div>
          </div>

          <div className="app-header__right">
            {effectiveProviderStatus && (
              <div
                className={`app-header__provider-badge ${
                  effectiveProviderStatus.configured ? '' : 'app-header__provider-badge--unconfigured'
                }`}
                title={effectiveProviderStatus.message}
              >
                <span className="app-header__provider-dot" aria-hidden="true" />
                <span>
                  {effectiveProviderStatus.configured
                    ? `AI: ${effectiveProviderStatus.active_provider || effectiveProviderStatus.provider}`
                    : 'AI Provider Not Configured'}
                </span>
              </div>
            )}

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
    </div>
  );
}
