import React, { useState } from 'react';
import { getCustomApiKey, setCustomApiKey, validateGeminiApiKey } from '../../lib/api';
import './ApiKeyModal.css';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyChange?: (hasCustomKey: boolean) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onKeyChange }) => {
  const currentKey = getCustomApiKey() || '';
  const [keyInput, setKeyInput] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!keyInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a Gemini API key first.' });
      return;
    }
    setTesting(true);
    setStatusMessage(null);
    try {
      const res = await validateGeminiApiKey(keyInput.trim());
      if (res.valid) {
        setStatusMessage({
          type: 'success',
          text: `✓ Key verified successfully! Accessible models: ${res.models?.join(', ') || 'gemini-3.5-flash-lite'}`,
        });
      } else {
        setStatusMessage({ type: 'error', text: `✗ ${res.message}` });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error validating key',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      setCustomApiKey(trimmed);
      setStatusMessage({ type: 'success', text: 'Personal Gemini API key saved! Requests will now use your key.' });
      if (onKeyChange) onKeyChange(true);
      setTimeout(() => {
        onClose();
      }, 900);
    } else {
      setCustomApiKey(null);
      setStatusMessage({ type: 'success', text: 'Reset to default Cloudflare edge key.' });
      if (onKeyChange) onKeyChange(false);
      setTimeout(() => {
        onClose();
      }, 900);
    }
  };

  const handleClear = () => {
    setKeyInput('');
    setCustomApiKey(null);
    setStatusMessage({ type: 'success', text: 'Key removed. Using default server credentials.' });
    if (onKeyChange) onKeyChange(false);
  };

  return (
    <div className="apikey-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="apikey-modal" onClick={(e) => e.stopPropagation()}>
        <div className="apikey-modal__header">
          <div className="apikey-modal__title-row">
            <span className="apikey-modal__icon">🔑</span>
            <div>
              <h3 className="apikey-modal__title">Connect Your Gemini API Key</h3>
              <p className="apikey-modal__subtitle">Use your personal quota with 100% data privacy</p>
            </div>
          </div>
          <button type="button" className="apikey-modal__close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="apikey-modal__body">
          <p className="apikey-modal__desc">
            Enter your Google Gemini API key to stream responses directly. Your key is stored securely in your browser's local storage and sent only to the edge worker.
          </p>

          <div className="apikey-modal__input-group">
            <label className="apikey-modal__label" htmlFor="gemini-key-input">
              Google Gemini API Key:
            </label>
            <div className="apikey-modal__input-wrapper">
              <input
                id="gemini-key-input"
                type={showKey ? 'text' : 'password'}
                className="apikey-modal__input"
                placeholder="AIzaSy... or AQ.Ab8..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="apikey-modal__toggle-visibility"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="apikey-modal__help-row">
            <span>Don't have a key?</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="apikey-modal__link"
            >
              Get a free API key at Google AI Studio ↗
            </a>
          </div>

          {statusMessage && (
            <div className={`apikey-modal__status apikey-modal__status--${statusMessage.type}`}>
              {statusMessage.text}
            </div>
          )}

          <div className="apikey-modal__actions">
            <button
              type="button"
              className="apikey-modal__btn apikey-modal__btn--test"
              onClick={handleTestKey}
              disabled={testing || !keyInput.trim()}
            >
              {testing ? 'Testing Key…' : 'Test Key'}
            </button>
            {getCustomApiKey() && (
              <button
                type="button"
                className="apikey-modal__btn apikey-modal__btn--clear"
                onClick={handleClear}
                disabled={testing}
              >
                Clear Key
              </button>
            )}
            <button
              type="button"
              className="apikey-modal__btn apikey-modal__btn--save"
              onClick={handleSave}
              disabled={testing}
            >
              Save Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};