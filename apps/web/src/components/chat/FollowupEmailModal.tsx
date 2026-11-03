import React, { useState } from 'react';
import { sendFollowupEmail, getStoredUser } from '../../lib/api';
import './FollowupEmailModal.css';

interface FollowupEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  conversationTitle?: string;
}

export const FollowupEmailModal: React.FC<FollowupEmailModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  conversationTitle = 'Unified AI Conversation',
}) => {
  const currentUser = getStoredUser();
  const [recipient, setRecipient] = useState<string>(currentUser?.email || '');
  const [subject, setSubject] = useState<string>(`Follow-up: ${conversationTitle} — Unified AI`);
  const [notes, setNotes] = useState<string>('');
  const [includeTranscript, setIncludeTranscript] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversationId) {
      setErrorMsg('No active conversation to summarize.');
      return;
    }
    if (!recipient || !recipient.includes('@')) {
      setErrorMsg('Please enter a valid recipient email.');
      return;
    }

    setSending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await sendFollowupEmail(conversationId, {
        recipient_email: recipient.trim(),
        subject: subject.trim() || undefined,
        custom_notes: notes.trim() || undefined,
        include_transcript: includeTranscript,
      });

      setSuccessMsg(res.message || `Follow-up email successfully sent to ${recipient}!`);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 2400);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to dispatch email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="email-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="email-modal" onClick={(e) => e.stopPropagation()}>
        <div className="email-modal__header">
          <div className="email-modal__title-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <h3 className="email-modal__title">Send Follow-up Email</h3>
          </div>
          <button type="button" className="email-modal__close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSend} className="email-modal__body">
          <p className="email-modal__desc">
            Dispatch an executive summary with key takeaways, action items, and generated file links directly to your inbox.
          </p>

          {errorMsg && <div className="email-modal__error">{errorMsg}</div>}
          {successMsg && (
            <div className="email-modal__success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}

          <div className="email-modal__field">
            <label className="email-modal__label">Recipient Email</label>
            <input
              type="email"
              className="email-modal__input"
              placeholder="e.g. your-name@gmail.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
            />
          </div>

          <div className="email-modal__field">
            <label className="email-modal__label">Subject Line</label>
            <input
              type="text"
              className="email-modal__input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="email-modal__field">
            <label className="email-modal__label">Additional Notes (Optional)</label>
            <textarea
              className="email-modal__textarea"
              placeholder="Add any personal remarks or context for the recipient..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <label className="email-modal__checkbox-label">
            <input
              type="checkbox"
              checked={includeTranscript}
              onChange={(e) => setIncludeTranscript(e.target.checked)}
            />
            <span>Include key conversation excerpts & action items</span>
          </label>

          <div className="email-modal__actions">
            <button type="button" className="email-modal__cancel-btn" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="email-modal__submit-btn" disabled={sending || Boolean(successMsg)}>
              {sending ? (
                <>
                  <span className="email-modal__spinner" />
                  Sending Email…
                </>
              ) : (
                'Dispatch Email'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
