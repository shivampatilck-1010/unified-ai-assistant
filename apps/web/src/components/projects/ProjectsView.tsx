import React, { useState, useEffect, useCallback } from 'react';
import type {
  ProjectSummary,
  ProjectDetail,
  ProjectCreateInput,
  ProjectUpdateInput,
  FileMetadata,
} from '../../types';
import {
  fetchProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
  createProjectConversation,
  pinFileToProject,
  unpinFileFromProject,
  fetchFiles,
} from '../../lib/api';
import './ProjectsView.css';

interface ProjectsViewProps {
  onSelectConversation: (id: string) => void;
  onOpenChatInProject?: (projectId: string, conversationId: string) => void;
  onBackToChat: () => void;
}

const COLOR_OPTIONS = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Teal', value: '#14b8a6' },
];

const GUIDANCE_PRESETS = [
  {
    title: 'Senior Software Architect',
    prompt: `You are an expert full-stack engineer and cloud architect.
Always formulate answers with clean, idiomatic TypeScript / Python code.
Prioritize modular design, defensive error handling, and test-driven architecture.
Never invent library features or mock data without explicitly noting assumptions.`,
  },
  {
    title: 'Scientific Research Specialist',
    prompt: `You are a scientific research assistant specializing in computational biology and physics.
Ground your responses strictly in peer-reviewed scientific literature and empirical data.
Explain biological pathways, molecular structures, and mathematical proofs rigorously.`,
  },
  {
    title: 'Product & Technical Writer',
    prompt: `You are a principal technical product manager and clear communicator.
Explain complex architectures concisely using structured executive summaries, user journeys, and risk matrices.
Maintain a polished, professional tone.`,
  },
];

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  onSelectConversation,
  onOpenChatInProject,
  onBackToChat,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected workspace state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversations' | 'guidance' | 'files'>('conversations');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formColor, setFormColor] = useState('#6366f1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guidance editor state
  const [guidanceDraft, setGuidanceDraft] = useState('');
  const [guidanceSaving, setGuidanceSaving] = useState(false);
  const [guidanceSuccess, setGuidanceSuccess] = useState<string | null>(null);

  // Available files for pinning
  const [availableFiles, setAvailableFiles] = useState<FileMetadata[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Fetch list of projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchProjects();
      setProjects(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // Load project detail when workspace selected
  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const detail = await fetchProject(id);
      setProjectDetail(detail);
      setGuidanceDraft(detail.system_prompt || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleOpenWorkspace = (id: string) => {
    setSelectedProjectId(id);
    setActiveTab('conversations');
    void loadDetail(id);
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
    setProjectDetail(null);
    void loadProjects();
  };

  // Open Create Modal
  const openCreateModal = () => {
    setFormName('');
    setFormDesc('');
    setFormPrompt('');
    setFormColor('#6366f1');
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = () => {
    if (!projectDetail) return;
    setFormName(projectDetail.name);
    setFormDesc(projectDetail.description || '');
    setFormPrompt(projectDetail.system_prompt || '');
    setFormColor(projectDetail.color || '#6366f1');
    setIsEditModalOpen(true);
  };

  // Handle Create Project
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      setIsSubmitting(true);
      const payload: ProjectCreateInput = {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        system_prompt: formPrompt.trim() || undefined,
        color: formColor,
      };
      const created = await createProject(payload);
      setIsCreateModalOpen(false);
      await loadProjects();
      handleOpenWorkspace(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Project
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !formName.trim()) return;

    try {
      setIsSubmitting(true);
      const payload: ProjectUpdateInput = {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        system_prompt: formPrompt.trim() || undefined,
        color: formColor,
      };
      await updateProject(selectedProjectId, payload);
      setIsEditModalOpen(false);
      await loadDetail(selectedProjectId);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Project
  const handleDeleteProject = async (id: string, name: string) => {
    if (!window.confirm(`Delete workspace "${name}"? Conversations will remain safe in chat history.`)) {
      return;
    }
    try {
      await deleteProject(id);
      if (selectedProjectId === id) {
        handleBackToProjects();
      } else {
        await loadProjects();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  // Handle Save Guidance
  const handleSaveGuidance = async () => {
    if (!selectedProjectId) return;
    try {
      setGuidanceSaving(true);
      setGuidanceSuccess(null);
      await updateProject(selectedProjectId, {
        system_prompt: guidanceDraft.trim() || undefined,
      });
      await loadDetail(selectedProjectId);
      setGuidanceSuccess('Project guidance saved successfully.');
      setTimeout(() => setGuidanceSuccess(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guidance');
    } finally {
      setGuidanceSaving(false);
    }
  };

  // Handle Start Conversation in Project
  const handleStartProjectConversation = async () => {
    if (!selectedProjectId) return;
    try {
      const conv = await createProjectConversation(
        selectedProjectId,
        `Thread in ${projectDetail?.name || 'Workspace'}`
      );
      if (onOpenChatInProject) {
        onOpenChatInProject(selectedProjectId, conv.id);
      } else {
        onSelectConversation(conv.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  };

  // Load available files for pinning modal
  const openPinModal = async () => {
    setIsPinModalOpen(true);
    try {
      setFilesLoading(true);
      const res = await fetchFiles();
      setAvailableFiles(res.items || []);
    } catch (err) {
      console.error('Failed to load files for pinning:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  // Handle Pin File
  const handlePinFile = async (fileId: string) => {
    if (!selectedProjectId) return;
    try {
      const updated = await pinFileToProject(selectedProjectId, fileId);
      setProjectDetail(updated);
      setIsPinModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin file');
    }
  };

  // Handle Unpin File
  const handleUnpinFile = async (fileId: string) => {
    if (!selectedProjectId) return;
    try {
      const updated = await unpinFileFromProject(selectedProjectId, fileId);
      setProjectDetail(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpin file');
    }
  };

  // Filtered projects
  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
  });

  return (
    <div className="pv-container">
      {/* Top Banner / Error notice */}
      {error && (
        <div className="pv-alert pv-alert--error" role="alert">
          <span>{error}</span>
          <button className="pv-alert__close" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {selectedProjectId && projectDetail ? (
        /* Workspace Detail View */
        <div className="pv-workspace">
          <div className="pv-workspace__header">
            <div className="pv-workspace__nav">
              <button
                className="pv-btn pv-btn--ghost pv-workspace__back-btn"
                onClick={handleBackToProjects}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>All Projects</span>
              </button>
              <div className="pv-workspace__actions">
                <button
                  className="pv-btn pv-btn--secondary"
                  onClick={openEditModal}
                  title="Configure project name, description and theme"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Edit Settings</span>
                </button>
                <button
                  className="pv-btn pv-btn--danger-ghost"
                  onClick={() => handleDeleteProject(projectDetail.id, projectDetail.name)}
                  title="Delete project workspace"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M6 7.5v5M10 7.5v5M3.5 4.5l.8 9.2a1 1 0 001 .8h5.4a1 1 0 001-.8l.8-9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="pv-workspace__banner">
              <div
                className="pv-workspace__icon-badge"
                style={{ backgroundColor: `${projectDetail.color}25`, borderColor: projectDetail.color, color: projectDetail.color }}
              >
                <svg width="24" height="24" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M2 7h14" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="pv-workspace__title-group">
                <div className="pv-workspace__title-row">
                  <h1 className="pv-workspace__name">{projectDetail.name}</h1>
                  <span className="pv-badge" style={{ borderColor: `${projectDetail.color}50`, color: projectDetail.color }}>
                    Active Workspace
                  </span>
                </div>
                <p className="pv-workspace__desc">
                  {projectDetail.description || 'No description provided. Add instructions or pinned files below.'}
                </p>
              </div>
            </div>

            {/* Workspace Navigation Tabs */}
            <div className="pv-tabs">
              <button
                className={`pv-tab ${activeTab === 'conversations' ? 'pv-tab--active' : ''}`}
                onClick={() => setActiveTab('conversations')}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M15 9.5a5.5 5.5 0 11-11 0c0-1.2.4-2.4 1.1-3.3L3.5 2.5l3.7 1.6c.9-.4 1.9-.6 2.8-.6 3 0 5.5 2.7 5.5 6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                <span>Conversations</span>
                <span className="pv-tab__badge">{projectDetail.conversations.length}</span>
              </button>

              <button
                className={`pv-tab ${activeTab === 'guidance' ? 'pv-tab--active' : ''}`}
                onClick={() => setActiveTab('guidance')}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M3 3h12v12H3z" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M6 7h6M6 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>System Guidance & Rules</span>
                {projectDetail.system_prompt && <span className="pv-tab__dot" title="Custom guidance active" />}
              </button>

              <button
                className={`pv-tab ${activeTab === 'files' ? 'pv-tab--active' : ''}`}
                onClick={() => setActiveTab('files')}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4 2h6l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>Pinned Knowledge</span>
                <span className="pv-tab__badge">{projectDetail.pinned_files.length}</span>
              </button>
            </div>
          </div>

          {/* Workspace Tab Content */}
          <div className="pv-workspace__content">
            {detailLoading ? (
              <div className="pv-empty">
                <span className="pv-spinner" />
                <p>Loading project workspace...</p>
              </div>
            ) : activeTab === 'conversations' ? (
              /* Conversations Tab */
              <div className="pv-section">
                <div className="pv-section__header">
                  <div>
                    <h2 className="pv-section__title">Workspace Threads</h2>
                    <p className="pv-section__subtitle">
                      Conversations in this workspace inherit your project guidance and access pinned files automatically.
                    </p>
                  </div>
                  <button
                    className="pv-btn pv-btn--primary"
                    onClick={handleStartProjectConversation}
                  >
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>New Thread in Project</span>
                  </button>
                </div>

                {projectDetail.conversations.length === 0 ? (
                  <div className="pv-empty-card">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <h3>No conversations in this workspace yet</h3>
                    <p>Start your first scoped chat to brainstorm, write code, or analyze knowledge with project guidance.</p>
                    <button
                      className="pv-btn pv-btn--primary"
                      onClick={handleStartProjectConversation}
                    >
                      Start First Conversation
                    </button>
                  </div>
                ) : (
                  <div className="pv-list">
                    {projectDetail.conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className="pv-list-item"
                        onClick={() => {
                          if (onOpenChatInProject) {
                            onOpenChatInProject(projectDetail.id, conv.id);
                          } else {
                            onSelectConversation(conv.id);
                          }
                        }}
                      >
                        <div className="pv-list-item__icon">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path d="M15 9.5a5.5 5.5 0 11-11 0c0-1.2.4-2.4 1.1-3.3L3.5 2.5l3.7 1.6c.9-.4 1.9-.6 2.8-.6 3 0 5.5 2.7 5.5 6z" stroke="currentColor" strokeWidth="1.4" />
                          </svg>
                        </div>
                        <div className="pv-list-item__content">
                          <span className="pv-list-item__title">{conv.title}</span>
                          <span className="pv-list-item__meta">
                            {conv.message_count ?? 0} messages • Active {new Date(conv.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button className="pv-btn pv-btn--ghost pv-btn--sm" title="Resume chat">
                          Open →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'guidance' ? (
              /* Guidance & System Prompt Tab */
              <div className="pv-section">
                <div className="pv-section__header">
                  <div>
                    <h2 className="pv-section__title">Custom Project Instructions</h2>
                    <p className="pv-section__subtitle">
                      System instructions injected before every prompt in this project. Define domain constraints, coding rules, or agent personas.
                    </p>
                  </div>
                  <button
                    className="pv-btn pv-btn--primary"
                    onClick={handleSaveGuidance}
                    disabled={guidanceSaving}
                  >
                    {guidanceSaving ? 'Saving...' : 'Save Guidance'}
                  </button>
                </div>

                {guidanceSuccess && (
                  <div className="pv-alert pv-alert--success">
                    <span>{guidanceSuccess}</span>
                  </div>
                )}

                <div className="pv-guidance-editor">
                  <textarea
                    className="pv-textarea"
                    rows={12}
                    value={guidanceDraft}
                    onChange={(e) => setGuidanceDraft(e.target.value)}
                    placeholder="E.g.: You are a senior frontend engineer. All code must use React 18, Vite, TypeScript and Tailwind CSS. Never use external CDN links..."
                  />
                  <div className="pv-guidance-footer">
                    <span className="pv-char-count">{guidanceDraft.length} characters</span>
                  </div>
                </div>

                <div className="pv-presets">
                  <span className="pv-presets__title">Quick Presets:</span>
                  <div className="pv-presets__pills">
                    {GUIDANCE_PRESETS.map((preset) => (
                      <button
                        key={preset.title}
                        type="button"
                        className="pv-preset-pill"
                        onClick={() => setGuidanceDraft(preset.prompt)}
                      >
                        + {preset.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Pinned Files Tab */
              <div className="pv-section">
                <div className="pv-section__header">
                  <div>
                    <h2 className="pv-section__title">Pinned Reference Materials</h2>
                    <p className="pv-section__subtitle">
                      Files pinned here are automatically prioritized for semantic RAG search whenever you chat in this workspace.
                    </p>
                  </div>
                  <button
                    className="pv-btn pv-btn--primary"
                    onClick={openPinModal}
                  >
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>Pin Reference File</span>
                  </button>
                </div>

                {projectDetail.pinned_files.length === 0 ? (
                  <div className="pv-empty-card">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    <h3>No files pinned to this workspace yet</h3>
                    <p>Pin documentation, schema files, or reference guides to ground the assistant in your project's data.</p>
                    <button
                      className="pv-btn pv-btn--secondary"
                      onClick={openPinModal}
                    >
                      Pin Reference Material
                    </button>
                  </div>
                ) : (
                  <div className="pv-list">
                    {projectDetail.pinned_files.map((file) => (
                      <div key={file.id} className="pv-list-item">
                        <div className="pv-list-item__icon pv-list-item__icon--file">
                          <span>{file.file_type.toUpperCase()}</span>
                        </div>
                        <div className="pv-list-item__content">
                          <span className="pv-list-item__title">{file.filename}</span>
                          <span className="pv-list-item__meta">
                            {(file.file_size / 1024).toFixed(1)} KB • Added {new Date(file.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className="pv-btn pv-btn--ghost pv-btn--sm pv-text-danger"
                          onClick={() => handleUnpinFile(file.id)}
                          title="Unpin file from project"
                        >
                          Unpin
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Projects List / Grid View */
        <div className="pv-overview">
          {/* Header */}
          <div className="pv-header">
            <div className="pv-header__left">
              <h1 className="pv-header__title">Projects & Workspaces</h1>
              <p className="pv-header__subtitle">
                Isolated workspaces with scoped instructions, pinned reference materials, and dedicated conversation memory.
              </p>
            </div>
            <div className="pv-header__right">
              <button
                className="pv-btn pv-btn--ghost"
                onClick={onBackToChat}
                title="Return to primary chat workspace"
              >
                Return to Chat
              </button>
              <button
                className="pv-btn pv-btn--primary"
                onClick={openCreateModal}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>New Project</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="pv-search-bar">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="pv-search-input"
              placeholder="Search projects by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Grid of Projects */}
          {loading ? (
            <div className="pv-empty">
              <span className="pv-spinner" />
              <p>Loading workspaces...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="pv-empty-card">
              <div className="pv-empty-card__icon">
                <svg width="40" height="40" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2 7h14" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </div>
              <h3>No projects found</h3>
              <p>
                {searchQuery
                  ? `No workspaces match "${searchQuery}". Clear your search or create a new project.`
                  : 'Organize your work with dedicated project workspaces, custom instructions, and pinned knowledge.'}
              </p>
              <button
                className="pv-btn pv-btn--primary"
                onClick={openCreateModal}
              >
                Create First Project
              </button>
            </div>
          ) : (
            <div className="pv-grid">
              {filteredProjects.map((p) => (
                <div key={p.id} className="pv-card" onClick={() => handleOpenWorkspace(p.id)}>
                  <div className="pv-card__top">
                    <div
                      className="pv-card__icon"
                      style={{ backgroundColor: `${p.color}20`, borderColor: p.color, color: p.color }}
                    >
                      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M2 7h14" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                    <div className="pv-card__badges">
                      {p.system_prompt && (
                        <span className="pv-badge pv-badge--guidance" title="Custom guidance configured">
                          Custom Rules
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="pv-card__title">{p.name}</h3>
                  <p className="pv-card__desc">
                    {p.description || 'No description provided.'}
                  </p>

                  <div className="pv-card__stats">
                    <span className="pv-card__stat">
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M15 9.5a5.5 5.5 0 11-11 0c0-1.2.4-2.4 1.1-3.3L3.5 2.5l3.7 1.6c.9-.4 1.9-.6 2.8-.6 3 0 5.5 2.7 5.5 6z" stroke="currentColor" strokeWidth="1.4" />
                      </svg>
                      {p.conversation_count} {p.conversation_count === 1 ? 'thread' : 'threads'}
                    </span>
                    <span className="pv-card__stat">
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M4 2h6l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" />
                      </svg>
                      {p.pinned_file_count} pinned
                    </span>
                  </div>

                  <div className="pv-card__footer" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="pv-btn pv-btn--primary pv-btn--sm"
                      onClick={() => handleOpenWorkspace(p.id)}
                    >
                      Open Workspace →
                    </button>
                    <button
                      className="pv-btn pv-btn--ghost pv-btn--sm pv-text-danger"
                      onClick={() => handleDeleteProject(p.id, p.name)}
                      title="Delete project"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="pv-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pv-modal__header">
              <h2 className="pv-modal__title">Create New Project</h2>
              <button
                className="pv-modal__close"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="pv-form">
              <div className="pv-form-group">
                <label className="pv-label">Project Name *</label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  className="pv-input"
                  placeholder="E.g. E-Commerce Replatforming"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="pv-form-group">
                <label className="pv-label">Description</label>
                <input
                  type="text"
                  maxLength={2000}
                  className="pv-input"
                  placeholder="Brief summary of the goals and scope of this workspace"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="pv-form-group">
                <label className="pv-label">Color Theme</label>
                <div className="pv-color-picker">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`pv-color-dot ${formColor === c.value ? 'pv-color-dot--active' : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setFormColor(c.value)}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="pv-form-group">
                <label className="pv-label">Initial System Guidance (Optional)</label>
                <textarea
                  className="pv-textarea"
                  rows={4}
                  placeholder="Set custom domain instructions or persona rules for this project..."
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                />
              </div>

              <div className="pv-modal__footer">
                <button
                  type="button"
                  className="pv-btn pv-btn--ghost"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pv-btn pv-btn--primary"
                  disabled={isSubmitting || !formName.trim()}
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {isEditModalOpen && (
        <div className="pv-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pv-modal__header">
              <h2 className="pv-modal__title">Edit Workspace Settings</h2>
              <button
                className="pv-modal__close"
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="pv-form">
              <div className="pv-form-group">
                <label className="pv-label">Project Name *</label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  className="pv-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="pv-form-group">
                <label className="pv-label">Description</label>
                <input
                  type="text"
                  maxLength={2000}
                  className="pv-input"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="pv-form-group">
                <label className="pv-label">Color Theme</label>
                <div className="pv-color-picker">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`pv-color-dot ${formColor === c.value ? 'pv-color-dot--active' : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setFormColor(c.value)}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="pv-modal__footer">
                <button
                  type="button"
                  className="pv-btn pv-btn--ghost"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pv-btn pv-btn--primary"
                  disabled={isSubmitting || !formName.trim()}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pin File Modal */}
      {isPinModalOpen && (
        <div className="pv-modal-overlay" onClick={() => setIsPinModalOpen(false)}>
          <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pv-modal__header">
              <h2 className="pv-modal__title">Pin Reference Material</h2>
              <button
                className="pv-modal__close"
                onClick={() => setIsPinModalOpen(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            <div className="pv-modal__body">
              <p className="pv-modal__desc">
                Select a document from your uploaded Files & Knowledge Base to bind to this project:
              </p>
              {filesLoading ? (
                <div className="pv-empty">
                  <span className="pv-spinner" />
                  <p>Loading files...</p>
                </div>
              ) : availableFiles.length === 0 ? (
                <div className="pv-empty-card">
                  <p>No uploaded files available yet. Go to Files & Knowledge to upload documents.</p>
                </div>
              ) : (
                <div className="pv-pin-list">
                  {availableFiles.map((file) => {
                    const isAlreadyPinned = projectDetail?.pinned_files.some((f) => f.id === file.id);
                    return (
                      <div key={file.id} className="pv-pin-item">
                        <div className="pv-pin-item__info">
                          <span className="pv-pin-item__name">{file.filename}</span>
                          <span className="pv-pin-item__meta">{file.file_type.toUpperCase()} • {(file.file_size / 1024).toFixed(1)} KB</span>
                        </div>
                        {isAlreadyPinned ? (
                          <span className="pv-badge pv-badge--guidance">Pinned</span>
                        ) : (
                          <button
                            className="pv-btn pv-btn--secondary pv-btn--sm"
                            onClick={() => handlePinFile(file.id)}
                          >
                            + Pin File
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="pv-modal__footer">
              <button
                type="button"
                className="pv-btn pv-btn--ghost"
                onClick={() => setIsPinModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProjectsView;
