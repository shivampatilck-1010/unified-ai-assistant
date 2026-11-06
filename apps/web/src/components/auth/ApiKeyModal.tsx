import React, { useState } from 'react';
import {
  getCustomApiKey,
  setCustomApiKey,
  validateGeminiApiKey,
  getCustomGroqKey,
  setCustomGroqKey,
  getCustomOpenRouterKey,
  setCustomOpenRouterKey,
  getCustomOpenAIKey,
  setCustomOpenAIKey,
  getCustomAnthropicKey,
  setCustomAnthropicKey,
} from '../../lib/api';
import { CompanyLogo } from '../brand/CompanyLogo';
import './ApiKeyModal.css';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyChange?: (hasCustomKey: boolean) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onKeyChange }) => {
  const [geminiKeyInput, setGeminiKeyInput] = useState(getCustomApiKey() || '');
  const [groqKeyInput, setGroqKeyInput] = useState(getCustomGroqKey() || '');
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState(getCustomOpenRouterKey() || '');
  const [openAIKeyInput, setOpenAIKeyInput] = useState(getCustomOpenAIKey() || '');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState(getCustomAnthropicKey() || '');

  const [showKeys, setShowKeys] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleTestGemini = async () => {
    if (!geminiKeyInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a Gemini API key first.' });
      return;
    }
    setTesting(true);
    setStatusMessage(null);
    try {
      const res = await validateGeminiApiKey(geminiKeyInput.trim());
      if (res.valid) {
        setStatusMessage({
          type: 'success',
          text: `✓ Gemini key verified! Accessible models: ${res.models?.join(', ') || 'gemini-2.5-pro, gemini-2.5-flash'}`,
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

  const handleSaveAll = () => {
    if (geminiKeyInput.trim()) setCustomApiKey(geminiKeyInput.trim());
    else setCustomApiKey(null);

    if (groqKeyInput.trim()) setCustomGroqKey(groqKeyInput.trim());
    else setCustomGroqKey(null);

    if (openRouterKeyInput.trim()) setCustomOpenRouterKey(openRouterKeyInput.trim());
    else setCustomOpenRouterKey(null);

    if (openAIKeyInput.trim()) setCustomOpenAIKey(openAIKeyInput.trim());
    else setCustomOpenAIKey(null);

    if (anthropicKeyInput.trim()) setCustomAnthropicKey(anthropicKeyInput.trim());
    else setCustomAnthropicKey(null);

    setStatusMessage({
      type: 'success',
      text: '✓ All API keys saved! Anthropic Claude, OpenAI, Groq, OpenRouter, and Gemini are live.',
    });
    if (onKeyChange) onKeyChange(true);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleResetDefaults = () => {
    setGeminiKeyInput('');
    setCustomApiKey(null);
    setGroqKeyInput(getCustomGroqKey() || '');
    setOpenRouterKeyInput(getCustomOpenRouterKey() || '');
    setOpenAIKeyInput(getCustomOpenAIKey() || '');
    setAnthropicKeyInput(getCustomAnthropicKey() || '');
    setStatusMessage({
      type: 'success',
      text: 'Reverted to verified cloud edge keys (Groq + OpenRouter + Gemini).',
    });
  };

  return (
    <div className="apikey-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="apikey-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="apikey-modal__header">
          <div className="apikey-modal__title-row">
            <span className="apikey-modal__icon">
              <CompanyLogo provider="unified-team" size={24} />
            </span>
            <div>
              <h3 className="apikey-modal__title">AI Provider API Keys (Live Multi-Gateway)</h3>
              <p className="apikey-modal__subtitle">
                Configure Anthropic Claude, OpenAI, Google Gemini, Groq, and OpenRouter
              </p>
            </div>
          </div>
          <button type="button" className="apikey-modal__close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="apikey-modal__body">
          {/* Provider status pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 12,
                background: 'rgba(217, 119, 87, 0.15)',
                border: '1px solid rgba(217, 119, 87, 0.3)',
                color: '#d97757',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CompanyLogo provider="anthropic" size={12} /> Anthropic: Claude 3.7 & 3.5 Sonnet
            </span>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CompanyLogo provider="openai" size={12} /> OpenAI: GPT-4o & o3-mini
            </span>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 12,
                background: 'rgba(236, 72, 153, 0.15)',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                color: '#f472b6',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CompanyLogo provider="groq" size={12} /> Groq: Active (Qwen 27B, GPT-OSS 120B)
            </span>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 12,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CompanyLogo provider="openrouter" size={12} /> OpenRouter: Active (Nemotron 550B, Gemma 4)
            </span>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 12,
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CompanyLogo provider="google" size={12} /> Gemini: Active (2.5 Pro, 2.5 Flash)
            </span>
          </div>

          {/* Groq API Key */}
          <div className="apikey-modal__input-group">
            <label className="apikey-modal__label" htmlFor="groq-key-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CompanyLogo provider="groq" size={15} /> Groq API Key (Hardware LPUs - Qwen 3.8 27B & GPT-OSS 120B):
            </label>
            <div className="apikey-modal__input-wrapper">
              <input
                id="groq-key-input"
                type={showKeys ? 'text' : 'password'}
                className="apikey-modal__input"
                placeholder="gsk_..."
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* OpenRouter API Key */}
          <div className="apikey-modal__input-group">
            <label className="apikey-modal__label" htmlFor="openrouter-key-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CompanyLogo provider="openrouter" size={15} /> OpenRouter API Key (NVIDIA Nemotron 550B & Gemma 4):
            </label>
            <div className="apikey-modal__input-wrapper">
              <input
                id="openrouter-key-input"
                type={showKeys ? 'text' : 'password'}
                className="apikey-modal__input"
                placeholder="sk-or-v1-..."
                value={openRouterKeyInput}
                onChange={(e) => setOpenRouterKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Anthropic API Key */}
          <div className="apikey-modal__input-group">
            <label className="apikey-modal__label" htmlFor="anthropic-key-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CompanyLogo provider="anthropic" size={15} /> Anthropic Claude API Key (Claude 3.7 Sonnet & 3.5 Sonnet):
            </label>
            <div className="apikey-modal__input-wrapper">
              <input
                id="anthropic-key-input"
                type={showKeys ? 'text' : 'password'}
                className="apikey-modal__input"
                placeholder="sk-ant-..."
                value={anthropicKeyInput}
                onChange={(e) => setAnthropicKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* OpenAI API Key */}
          <div className="apikey-modal__input-group">
            <label className="apikey-modal__label" htmlFor="openai-key-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CompanyLogo provider="openai" size={15} /> OpenAI API Key (GPT-4o, GPT-4o Mini, o3-mini):
            </label>
            <div className="apikey-modal__input-wrapper">
              <input
                id="openai-key-input"
                type={showKeys ? 'text' : 'password'}
                className="apikey-modal__input"
                placeholder="sk-proj-..."
                value={openAIKeyInput}
                onChange={(e) => setOpenAIKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Google Gemini API Key */}
          <div className="apikey-modal__input-group">
            <label className="apikey-modal__label" htmlFor="gemini-key-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CompanyLogo provider="google" size={15} /> Google Gemini API Key (Flagship 2.5 Pro & Multimodal):
            </label>
            <div className="apikey-modal__input-wrapper">
              <input
                id="gemini-key-input"
                type={showKeys ? 'text' : 'password'}
                className="apikey-modal__input"
                placeholder="AIzaSy... (optional if using default)"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="apikey-modal__help-row">
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: '#a3a3a3',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => setShowKeys((v) => !v)}
            >
              {showKeys ? '👁️ Hide Keys' : '👁️ Show Keys'}
            </button>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: '#38bdf8',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={handleResetDefaults}
            >
              Restore Default Verified Keys
            </button>
          </div>

          {statusMessage && (
            <div className={`apikey-modal__status apikey-modal__status--${statusMessage.type}`}>
              {statusMessage.text}
            </div>
          )}

          <div className="apikey-modal__actions">
            {geminiKeyInput.trim() && (
              <button
                type="button"
                className="apikey-modal__btn apikey-modal__btn--test"
                onClick={handleTestGemini}
                disabled={testing}
              >
                {testing ? 'Testing Gemini…' : 'Test Gemini'}
              </button>
            )}
            <button
              type="button"
              className="apikey-modal__btn apikey-modal__btn--save"
              onClick={handleSaveAll}
              disabled={testing}
            >
              Save & Apply All Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
