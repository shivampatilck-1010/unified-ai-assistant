import React, { useCallback, useEffect, useState } from 'react';
import {
  approveWorkflowPlan,
  cancelWorkflow,
  confirmWorkflowStep,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  submitWorkflowClarification,
} from '../../lib/api';
import type { Workflow, WorkflowStep } from '../../types';
import './OrchestrationView.css';

export const OrchestrationView: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New Workflow Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [promptInput, setPromptInput] = useState<string>('');

  // Clarification form
  const [clarificationInput, setClarificationInput] = useState<string>('');

  // Load workflows list
  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listWorkflows();
      const items = Array.isArray(res?.items) ? res.items : Array.isArray((res as any)?.workflows) ? (res as any).workflows : [];
      setWorkflows(items);
      if (items.length > 0 && !selectedWorkflowId) {
        setSelectedWorkflowId(items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows.');
    } finally {
      setLoading(false);
    }
  }, [selectedWorkflowId]);

  // Load single workflow details
  const loadActiveWorkflow = useCallback(async (id: string) => {
    try {
      const wf = await getWorkflow(id);
      setActiveWorkflow(wf);
    } catch (err) {
      console.error('Failed to load workflow details:', err);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  useEffect(() => {
    if (selectedWorkflowId) {
      void loadActiveWorkflow(selectedWorkflowId);
    } else {
      setActiveWorkflow(null);
    }
  }, [selectedWorkflowId, loadActiveWorkflow]);

  // Polling for live execution updates when running or awaiting input/confirmation
  useEffect(() => {
    if (!activeWorkflow) return;
    const activeStates = ['running', 'planning', 'awaiting_approval', 'waiting_for_confirmation', 'waiting_for_input'];
    if (!activeStates.includes(activeWorkflow.status)) return;

    const interval = setInterval(() => {
      if (selectedWorkflowId) {
        void loadActiveWorkflow(selectedWorkflowId);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeWorkflow, selectedWorkflowId, loadActiveWorkflow]);

  // Actions
  const handleCreateWorkflow = async () => {
    if (!promptInput.trim()) return;
    try {
      setActionLoading(true);
      const created = await createWorkflow({ prompt: promptInput.trim() });
      setShowCreateModal(false);
      setPromptInput('');
      setWorkflows((prev) => [created, ...prev]);
      setSelectedWorkflowId(created.id);
      setActiveWorkflow(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create workflow.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovePlan = async (approved: boolean) => {
    if (!activeWorkflow) return;
    try {
      setActionLoading(true);
      const updated = await approveWorkflowPlan(activeWorkflow.id, {
        approved,
        plan_version: activeWorkflow.plan_version,
      });
      setActiveWorkflow(updated);
      setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve plan.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitClarification = async () => {
    if (!activeWorkflow || !clarificationInput.trim()) return;
    try {
      setActionLoading(true);
      const updated = await submitWorkflowClarification(activeWorkflow.id, {
        clarification_response: clarificationInput.trim(),
      });
      setClarificationInput('');
      setActiveWorkflow(updated);
      setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit clarification.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmStep = async (stepNumber: number, approved: boolean) => {
    if (!activeWorkflow) return;
    try {
      setActionLoading(true);
      const updated = await confirmWorkflowStep(activeWorkflow.id, {
        step_number: stepNumber,
        approved,
      });
      setActiveWorkflow(updated);
      setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to confirm step.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeWorkflow) return;
    if (!confirm('Are you sure you want to cancel this workflow?')) return;
    try {
      setActionLoading(true);
      const updated = await cancelWorkflow(activeWorkflow.id, { reason: 'User cancelled via dashboard' });
      setActiveWorkflow(updated);
      setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel workflow.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadgeClass = (st: string) => {
    switch (st) {
      case 'running':
        return 'orch-status-running';
      case 'awaiting_approval':
      case 'waiting_for_confirmation':
        return 'orch-status-awaiting_approval';
      case 'waiting_for_input':
        return 'orch-status-waiting_for_input';
      case 'completed':
        return 'orch-status-completed';
      case 'failed':
        return 'orch-status-failed';
      default:
        return 'orch-status-cancelled';
    }
  };

  return (
    <div className="orchestration-workspace">
      {/* Header */}
      <div className="orch-header">
        <div className="orch-title-row">
          <div>
            <h1 className="orch-title">Unified AI Orchestration Engine</h1>
            <p className="orch-subtitle">
              Autonomous multi-capability coordination with strict dependency DAGs and human confirmation gates.
            </p>
          </div>
          <div className="orch-actions-bar">
            <button
              className="orch-btn orch-btn-primary"
              onClick={() => setShowCreateModal(true)}
              disabled={actionLoading}
            >
              <span>+ New Orchestrated Goal</span>
            </button>
            <button
              className="orch-btn orch-btn-secondary"
              onClick={() => void loadWorkflows()}
              disabled={loading}
            >
              <span>↻ Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', borderRadius: '6px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Main Split Layout */}
      <div className="orch-layout">
        {/* Left: Workflow List */}
        <div className="orch-sidebar">
          <div className="orch-sidebar-header">
            <h3 className="orch-sidebar-title">Workflows ({workflows.length})</h3>
          </div>
          <ul className="orch-workflow-list">
            {workflows.map((wf) => (
              <li
                key={wf.id}
                className={`orch-workflow-item ${selectedWorkflowId === wf.id ? 'active' : ''}`}
                onClick={() => setSelectedWorkflowId(wf.id)}
              >
                <div className="orch-workflow-item-title">{wf.title}</div>
                <div className="orch-workflow-item-meta">
                  <span className={`orch-status-badge ${getStatusBadgeClass(wf.status)}`}>
                    {wf.status.replace(/_/g, ' ')}
                  </span>
                  <span>{new Date(wf.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </li>
            ))}
            {workflows.length === 0 && !loading && (
              <li style={{ padding: '24px', textAlign: 'center', color: '#737373', fontSize: '13px' }}>
                No orchestrated workflows yet. Click "+ New Orchestrated Goal" to begin.
              </li>
            )}
          </ul>
        </div>

        {/* Right: Active Workflow Details */}
        <div className="orch-detail-pane">
          {activeWorkflow ? (
            <>
              {/* Header */}
              <div className="orch-detail-header">
                <div className="orch-detail-title-group">
                  <h2>{activeWorkflow.title}</h2>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span className={`orch-status-badge ${getStatusBadgeClass(activeWorkflow.status)}`}>
                      {activeWorkflow.status.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '12px', color: '#737373' }}>
                      ID: {activeWorkflow.id.slice(0, 8)} • Plan v{activeWorkflow.plan_version}
                    </span>
                  </div>
                </div>
                {['running', 'planning', 'awaiting_approval', 'waiting_for_confirmation', 'waiting_for_input'].includes(
                  activeWorkflow.status
                ) && (
                  <button className="orch-btn orch-btn-danger" onClick={() => void handleCancel()} disabled={actionLoading}>
                    Cancel Workflow
                  </button>
                )}
              </div>

              {/* Request Prompt */}
              <div className="orch-detail-prompt">
                <strong>Goal:</strong> {activeWorkflow.request_prompt}
              </div>

              {/* Clarification Box if waiting for input */}
              {activeWorkflow.status === 'waiting_for_input' && (
                <div className="orch-clarification-box">
                  <div className="orch-clarification-header">Clarification Required</div>
                  <div>{activeWorkflow.clarification_question}</div>
                  <div className="orch-clarification-form">
                    <input
                      type="text"
                      className="orch-input"
                      placeholder="Type your clarification here..."
                      value={clarificationInput}
                      onChange={(e) => setClarificationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSubmitClarification();
                      }}
                    />
                    <button
                      className="orch-btn orch-btn-primary"
                      onClick={() => void handleSubmitClarification()}
                      disabled={actionLoading || !clarificationInput.trim()}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}

              {/* Consequential Confirmation Box if waiting for confirmation */}
              {activeWorkflow.status === 'waiting_for_confirmation' && activeWorkflow.pending_confirmation && (
                <div className="orch-confirmation-box">
                  <div className="orch-confirmation-header">
                    <span>Consequential Action Confirmation Required</span>
                  </div>
                  <div className="orch-confirmation-body">
                    <strong>Step {activeWorkflow.pending_confirmation.step_number}: {activeWorkflow.pending_confirmation.title}</strong>
                    <p style={{ margin: '6px 0', color: '#fef08a' }}>
                      Reason: {activeWorkflow.pending_confirmation.consequential_reason || 'This action mutates external user state.'}
                    </p>
                    <pre style={{ margin: '6px 0', padding: '8px', background: '#171717', borderRadius: '4px', fontSize: '11px', overflowX: 'auto' }}>
                      {JSON.stringify(activeWorkflow.pending_confirmation.parameters, null, 2)}
                    </pre>
                  </div>
                  <div className="orch-confirmation-actions">
                    <button
                      className="orch-btn orch-btn-primary"
                      onClick={() => void handleConfirmStep(activeWorkflow.pending_confirmation!.step_number, true)}
                      disabled={actionLoading}
                    >
                      Confirm and Execute
                    </button>
                    <button
                      className="orch-btn orch-btn-danger"
                      onClick={() => void handleConfirmStep(activeWorkflow.pending_confirmation!.step_number, false)}
                      disabled={actionLoading}
                    >
                      Reject Step
                    </button>
                  </div>
                </div>
              )}

              {/* Plan Review Box if awaiting approval */}
              {activeWorkflow.status === 'awaiting_approval' && activeWorkflow.plan && (
                <div className="orch-plan-card">
                  <div className="orch-plan-card-header">
                    <div className="orch-plan-card-title">Proposed Orchestrated Plan</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="orch-btn orch-btn-primary"
                        onClick={() => void handleApprovePlan(true)}
                        disabled={actionLoading}
                      >
                        Approve Plan
                      </button>
                      <button
                        className="orch-btn orch-btn-danger"
                        onClick={() => void handleApprovePlan(false)}
                        disabled={actionLoading}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '13px', color: '#d4d4d4', margin: '0 0 12px 0' }}>
                    {activeWorkflow.plan.summary}
                  </p>
                </div>
              )}

              {/* Step Sequence / Execution DAG */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: '#d4d4d4' }}>
                  Execution Plan & Steps ({activeWorkflow.steps?.length || 0})
                </h3>
                <div className="orch-steps-container">
                  {(activeWorkflow.steps || []).map((step: WorkflowStep) => (
                    <div key={step.id} className="orch-step-card">
                      <div className="orch-step-header">
                        <div className="orch-step-left">
                          <div className="orch-step-number">{step.step_number}</div>
                          <span className="orch-step-title">{step.title}</span>
                          <span className="orch-step-capability-tag">{step.capability}</span>
                          {step.is_consequential && (
                            <span className="orch-step-consequential-tag">Consequential</span>
                          )}
                        </div>
                        <span className={`orch-status-badge ${getStatusBadgeClass(step.status)}`}>
                          {step.status}
                        </span>
                      </div>

                      {step.output_data && (
                        <div className="orch-step-summary">
                          {typeof step.output_data === 'object' && 'summary' in step.output_data
                            ? String(step.output_data.summary)
                            : JSON.stringify(step.output_data)}
                        </div>
                      )}

                      {step.error_message && (
                        <div style={{ color: '#fca5a5', fontSize: '12px', paddingLeft: '32px' }}>
                          Error: {step.error_message}
                        </div>
                      )}

                      {step.citations && step.citations.length > 0 && (
                        <div className="orch-step-citations">
                          {step.citations.map((c, idx) => (
                            <span
                              key={idx}
                              className={`orch-citation-pill ${c.is_simulated ? 'sensing' : ''}`}
                              title={c.disclaimer || c.title || ''}
                            >
                              {c.citation_key}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Final Synthesis / Report */}
              {activeWorkflow.result_summary && (
                <div style={{ background: '#242424', padding: '16px', borderRadius: '8px', border: '1px solid #383838' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: '#86efac' }}>
                    Outcome & Synthesis
                  </h3>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#e5e5e5' }}>
                    {activeWorkflow.result_summary}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#737373' }}>
              Select a workflow from the left sidebar or create a new goal.
            </div>
          )}
        </div>
      </div>

      {/* New Workflow Modal */}
      {showCreateModal && (
        <div className="orch-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="orch-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="orch-modal-title">New Orchestrated Goal</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#a3a3a3' }}>
              Enter any multi-step goal. The orchestration engine will analyze requirements across tools (files, research, calendar, browser, tasks, Wi-Fi sensing) and propose a plan.
            </p>
            <textarea
              className="orch-modal-textarea"
              placeholder="e.g. Research recent advancements in post-quantum cryptography, cross-reference my uploaded compliance document, and schedule a 30-minute review meeting tomorrow at 2 PM."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
            />
            <div className="orch-modal-actions">
              <button
                className="orch-btn orch-btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="orch-btn orch-btn-primary"
                onClick={() => void handleCreateWorkflow()}
                disabled={actionLoading || !promptInput.trim()}
              >
                Plan & Orchestrate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
