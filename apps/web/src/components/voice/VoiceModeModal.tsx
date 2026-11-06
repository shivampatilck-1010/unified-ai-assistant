import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../../types';
import './VoiceModeModal.css';

export interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  messages: ChatMessage[];
  currentModelName?: string;
}

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export const VoiceModeModal: React.FC<VoiceModeModalProps> = ({
  isOpen,
  onClose,
  onSendMessage,
  isStreaming,
  messages,
  currentModelName = 'Unified AI Assistant',
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastUserSpeech, setLastUserSpeech] = useState('');
  const [lastAssistantSpeech, setLastAssistantSpeech] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prevStreamingRef = useRef(isStreaming);
  const lastSpokenMessageIdRef = useRef<string | null>(null);

  // Load available system synthesis voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        // Prefer natural English voices
        const naturalVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Neural') ||
              v.name.includes('Samantha') ||
              v.name.includes('Google') ||
              v.name.includes('Daniel') ||
              v.name.includes('Jenny'))
        );
        if (naturalVoice) {
          setSelectedVoice(naturalVoice.name);
        } else if (!selectedVoice) {
          setSelectedVoice(voices[0].name);
        }
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Clean markdown and citations before text-to-speech
  const cleanSpeechText = (text: string): string => {
    return text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[#*~_>]/g, '')
      .replace(/\$\$[\s\S]*?\$\$/g, 'Formula omitted.')
      .replace(/\$[^$]*?\$/g, '')
      .replace(/⚡|🧠|🤖|💡|✨|📌|⚠️/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Start speech recognition
  const startListening = () => {
    if (isMuted) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setVoiceState('listening');
        setTranscript('');
        setErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            currentInterim += item[0].transcript;
          }
        }

        const currentText = finalTranscript || currentInterim;
        if (currentText.trim()) {
          setTranscript(currentText);

          // Reset silence timer on new speech
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

          silenceTimerRef.current = setTimeout(() => {
            const trimmed = currentText.trim();
            if (trimmed.length > 1) {
              handleSendVoiceMessage(trimmed);
            }
          }, 1600); // 1.6s of silence triggers sending
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Normal timeout, resume if still open
          return;
        }
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access was denied. Please allow microphone permissions.');
          setVoiceState('idle');
        }
      };

      recognition.onend = () => {
        // If still in listening state and modal is open, restart
        if (isOpen && voiceState === 'listening' && !isMuted) {
          try {
            recognition.start();
          } catch {
            // Already active
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
    }
  };

  const stopListening = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
  };

  // Send voice query to AI
  const handleSendVoiceMessage = (text: string) => {
    stopListening();
    setLastUserSpeech(text);
    setTranscript('');
    setVoiceState('thinking');
    onSendMessage(text);
  };

  // Speak AI response aloud
  const speakResponse = (fullText: string) => {
    if (!('speechSynthesis' in window)) {
      setVoiceState('listening');
      startListening();
      return;
    }

    window.speechSynthesis.cancel();

    const clean = cleanSpeechText(fullText);
    if (!clean) {
      setVoiceState('listening');
      startListening();
      return;
    }

    setLastAssistantSpeech(clean);
    setVoiceState('speaking');

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    if (selectedVoice) {
      const match = availableVoices.find((v) => v.name === selectedVoice);
      if (match) utterance.voice = match;
    }

    utterance.onend = () => {
      setVoiceState('listening');
      startListening();
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      setVoiceState('listening');
      startListening();
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Stop assistant speaking (user interrupt)
  const interruptSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState('listening');
    startListening();
  };

  // Watch for incoming model completion
  useEffect(() => {
    if (isOpen) {
      if (prevStreamingRef.current && !isStreaming) {
        // Model just finished streaming response
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          const latest = assistantMsgs[assistantMsgs.length - 1];
          if (latest.id !== lastSpokenMessageIdRef.current) {
            lastSpokenMessageIdRef.current = latest.id;
            speakResponse(latest.content);
          }
        }
      } else if (isStreaming && voiceState !== 'thinking') {
        setVoiceState('thinking');
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, isOpen, messages]);

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (isOpen) {
      setVoiceState('listening');
      setTranscript('');
      setErrorMessage(null);
      setTimeout(() => {
        startListening();
      }, 300);
    } else {
      stopListening();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setVoiceState('idle');
    }

    return () => {
      stopListening();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="voice-modal-backdrop" role="dialog" aria-modal="true" aria-label="Live Voice Mode">
      <div className="voice-modal-container">
        {/* Top Header Bar */}
        <div className="voice-modal-header">
          <div className="voice-modal-branding">
            <span className="voice-modal-brand-badge">LIVE VOICE</span>
            <span className="voice-modal-model-name">{currentModelName}</span>
          </div>

          <div className="voice-modal-header-actions">
            {availableVoices.length > 0 && (
              <select
                className="voice-modal-select"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                title="Select Assistant Voice"
              >
                {availableVoices
                  .filter((v) => v.lang.startsWith('en'))
                  .slice(0, 8)
                  .map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name.replace(/Microsoft |Google |Apple /g, '').slice(0, 18)}
                    </option>
                  ))}
              </select>
            )}

            <button
              type="button"
              className="voice-modal-close-btn"
              onClick={onClose}
              aria-label="Exit voice mode"
              title="Close voice mode (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Center Interactive Audio Visualizer */}
        <div className="voice-modal-body">
          <div className="voice-orb-wrapper">
            {/* Concentric Breathing Wave Rings */}
            <div className={`voice-orb-ring voice-orb-ring--outer voice-orb-ring--${voiceState}`} />
            <div className={`voice-orb-ring voice-orb-ring--mid voice-orb-ring--${voiceState}`} />
            <div className={`voice-orb-ring voice-orb-ring--inner voice-orb-ring--${voiceState}`} />

            {/* Central Fluid Pulsing Orb */}
            <button
              type="button"
              className={`voice-orb-core voice-orb-core--${voiceState}`}
              onClick={() => {
                if (voiceState === 'speaking') {
                  interruptSpeaking();
                } else if (voiceState === 'listening') {
                  if (transcript.trim()) {
                    handleSendVoiceMessage(transcript.trim());
                  }
                }
              }}
              title={
                voiceState === 'speaking'
                  ? 'Tap to interrupt'
                  : voiceState === 'listening'
                  ? 'Tap when finished speaking'
                  : 'Voice Mode Active'
              }
            >
              {voiceState === 'listening' && (
                <div className="voice-wave-bars">
                  <span className="bar bar--1" />
                  <span className="bar bar--2" />
                  <span className="bar bar--3" />
                  <span className="bar bar--4" />
                  <span className="bar bar--5" />
                </div>
              )}

              {voiceState === 'thinking' && (
                <div className="voice-thinking-spinner">
                  <div className="thinking-orbit" />
                </div>
              )}

              {voiceState === 'speaking' && (
                <div className="voice-speaking-waves">
                  <span className="speak-wave wave--1" />
                  <span className="speak-wave wave--2" />
                  <span className="speak-wave wave--3" />
                  <span className="speak-wave wave--4" />
                </div>
              )}

              {voiceState === 'idle' && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              )}
            </button>
          </div>

          {/* Real-time State Label */}
          <div className="voice-status-label">
            {voiceState === 'listening' && (
              <span className="voice-label--listening">
                <span className="voice-dot voice-dot--pulse" />
                {transcript ? 'Listening...' : 'Listening to your voice...'}
              </span>
            )}
            {voiceState === 'thinking' && (
              <span className="voice-label--thinking">
                <span className="voice-dot voice-dot--spinner" />
                Processing response...
              </span>
            )}
            {voiceState === 'speaking' && (
              <span className="voice-label--speaking">
                <span className="voice-dot voice-dot--speaking" />
                Speaking · Tap orb to interrupt
              </span>
            )}
            {voiceState === 'idle' && <span>Tap microphone to start</span>}
          </div>

          {/* Live Subtitle Transcript Display */}
          <div className="voice-transcript-card">
            {transcript ? (
              <p className="voice-transcript-text voice-transcript-text--interim">
                “{transcript}”
              </p>
            ) : voiceState === 'speaking' && lastAssistantSpeech ? (
              <p className="voice-transcript-text voice-transcript-text--ai">
                {lastAssistantSpeech.slice(0, 180)}
                {lastAssistantSpeech.length > 180 ? '...' : ''}
              </p>
            ) : lastUserSpeech ? (
              <p className="voice-transcript-text voice-transcript-text--prev">
                You: “{lastUserSpeech}”
              </p>
            ) : (
              <p className="voice-transcript-placeholder">
                Speak naturally. The assistant will listen, understand, and talk back in real-time.
              </p>
            )}
          </div>

          {errorMessage && <div className="voice-error-banner">{errorMessage}</div>}
        </div>

        {/* Bottom Control Bar */}
        <div className="voice-modal-footer">
          <button
            type="button"
            className={`voice-action-btn ${isMuted ? 'voice-action-btn--muted' : ''}`}
            onClick={() => {
              if (isMuted) {
                setIsMuted(false);
                startListening();
              } else {
                setIsMuted(true);
                stopListening();
              }
            }}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                <path d="M5 10v2a7 7 0 0 0 12 5" />
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            )}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {voiceState === 'speaking' ? (
            <button
              type="button"
              className="voice-action-btn voice-action-btn--interrupt"
              onClick={interruptSpeaking}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
              </svg>
              <span>Interrupt</span>
            </button>
          ) : (
            <button
              type="button"
              className="voice-action-btn voice-action-btn--end"
              onClick={onClose}
            >
              <span>Exit Voice</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
