import { useState, useEffect } from 'react';
import type { NavigationSection, UnifiedProviderStatusResponse } from './types';
import { useConversations } from './hooks/useConversations';
import { useHealthCheck } from './hooks/useHealthCheck';
import { fetchProviderStatus } from './lib/api';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { BrowserAgentView } from './components/browser/BrowserAgentView';
import { CalendarTasksView } from './components/calendar/CalendarTasksView';
import { FilesKnowledgeView } from './components/files/FilesKnowledgeView';
import { WifiSensingView } from './components/sensing/WifiSensingView';
import { SectionPlaceholder } from './components/placeholders/SectionPlaceholder';
import { StatusIndicator } from './components/status/StatusIndicator';
import './App.css';

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
    cancelStream,
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
          {activeSection === 'chat' ? (
            <ChatView
              messages={activeConversation?.messages ?? []}
              onSend={sendMessage}
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
          ) : (
            <SectionPlaceholder
              section={activeSection}
              onBackToChat={() => setActiveSection('chat')}
              onSelectConversation={handleSelectConversation}
            />
          )}
        </div>
      </main>
    </div>
  );
}
