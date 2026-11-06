import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../../types';
import './LiveVoiceSpace.css';

export interface LiveVoiceSpaceProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onCancelGeneration: () => void;
  isStreaming: boolean;
  messages: ChatMessage[];
  currentModelName?: string;
}

type LiveVoiceState = 'listening' | 'thinking' | 'speaking';

function deduplicateSpeech(text: string): string {
  if (!text) return '';
  return text
    // Deduplicate repeating identical words ("hello hello" -> "hello")
    .replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1')
    // Deduplicate repeated 2-word phrases ("how to how to" -> "how to")
    .replace(/\b(\w+\s+\w+)(?:\s+\1\b)+/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanChunkForTTS(text: string): string {
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
}

export const LiveVoiceSpace: React.FC<LiveVoiceSpaceProps> = ({
  isOpen,
  onClose,
  onSendMessage,
  onCancelGeneration,
  isStreaming,
  messages,
  currentModelName = 'Unified AI Cognitive Engine',
}) => {
  const [voiceState, setVoiceState] = useState<LiveVoiceState>('listening');
  const [transcript, setTranscript] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const spokenOffsetRef = useRef<number>(0);
  const sentenceQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const currentLiveMessageIdRef = useRef<string | null>(null);
  const prevStreamingRef = useRef(isStreaming);

  // Load natural English system voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
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

  // Sentence-pipelined audio playback
  const playNextSentence = useCallback(() => {
    if (sentenceQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      if (!isStreaming) {
        setVoiceState('listening');
      }
      return;
    }

    const nextSentence = sentenceQueueRef.current.shift();
    if (!nextSentence || !nextSentence.trim()) {
      playNextSentence();
      return;
    }

    isSpeakingRef.current = true;
    setVoiceState('speaking');

    const utter = new SpeechSynthesisUtterance(nextSentence.trim());
    utter.rate = 1.05;
    utter.pitch = 1.0;

    if (selectedVoice && 'speechSynthesis' in window) {
      const match = availableVoices.find((v) => v.name === selectedVoice);
      if (match) utter.voice = match;
    }

    utter.onend = () => {
      playNextSentence();
    };

    utter.onerror = () => {
      playNextSentence();
    };

    if ('speechSynthesis' in window) {
      window.speechSynthesis.speak(utter);
    }
  }, [isStreaming, selectedVoice, availableVoices]);

  // Voice Barge-In: Interrupt assistant immediately
  const handleInterruptVoice = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    sentenceQueueRef.current = [];
    isSpeakingRef.current = false;
    if (isStreaming) {
      onCancelGeneration();
    }
    setVoiceState('listening');
  }, [isStreaming, onCancelGeneration]);

  // Start continuous recognition with full duplex voice interruption
  const startLiveRecognition = useCallback(() => {
    if (isMuted) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setVoiceState('listening');
      setTranscript('');
      finalTranscriptRef.current = '';
      setErrorMessage(null);
    };

    rec.onresult = (event: any) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscriptRef.current += item[0].transcript + ' ';
        } else {
          interim += item[0].transcript;
        }
      }

      const rawCombined = (finalTranscriptRef.current + interim).trim();
      const cleanCombined = deduplicateSpeech(rawCombined);

      if (cleanCombined) {
        // VOICE BARGE-IN INTERRUPTION: If AI is speaking or model is generating, shut it up instantly!
        if (isSpeakingRef.current || (window.speechSynthesis && window.speechSynthesis.speaking) || isStreaming) {
          handleInterruptVoice();
        }

        setTranscript(cleanCombined);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // Fast 650ms silence detection sends prompt
        silenceTimerRef.current = setTimeout(() => {
          const userMsg = cleanCombined;
          if (userMsg.length > 0) {
            setCurrentPrompt(userMsg);
            setTranscript('');
            finalTranscriptRef.current = '';
            setVoiceState('thinking');
            spokenOffsetRef.current = 0;
            sentenceQueueRef.current = [];
            currentLiveMessageIdRef.current = null;
            onSendMessage(userMsg);
          }
        }, 650);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        setErrorMessage('Microphone access was denied. Please allow microphone permissions.');
        setVoiceState('listening');
      }
    };

    rec.onend = () => {
      if (isOpen && !isMuted) {
        try {
          rec.start();
        } catch {
          // Ignore
        }
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.warn('Live recognition start error:', err);
    }
  }, [isOpen, isMuted, isStreaming, handleInterruptVoice, onSendMessage]);

  // Lifecycle when Live Voice opens/closes
  useEffect(() => {
    if (isOpen) {
      spokenOffsetRef.current = 0;
      sentenceQueueRef.current = [];
      isSpeakingRef.current = false;
      startLiveRecognition();
    } else {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      sentenceQueueRef.current = [];
      isSpeakingRef.current = false;
      setTranscript('');
      finalTranscriptRef.current = '';
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen, startLiveRecognition]);

  // Sentence-pipelined streaming TTS: Speaks incoming chunks in real-time (< 500ms latency)
  useEffect(() => {
    if (!isOpen) return;

    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    if (assistantMsgs.length === 0) return;

    const latest = assistantMsgs[assistantMsgs.length - 1];

    if (latest.id !== currentLiveMessageIdRef.current) {
      currentLiveMessageIdRef.current = latest.id;
      spokenOffsetRef.current = 0;
      sentenceQueueRef.current = [];
    }

    const unread = latest.content.slice(spokenOffsetRef.current);
    if (!unread) return;

    const sentenceRegex = /[^.?!]+[.?!]+(?:\s+|$)|[^\n]+\n+/g;
    let match;
    let lastIndex = 0;

    while ((match = sentenceRegex.exec(unread)) !== null) {
      const sentenceText = match[0];
      const clean = cleanChunkForTTS(sentenceText);
      if (clean) {
        sentenceQueueRef.current.push(clean);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex > 0) {
      spokenOffsetRef.current += lastIndex;
      if (!isSpeakingRef.current) {
        playNextSentence();
      }
    }

    if (prevStreamingRef.current && !isStreaming) {
      const remainder = latest.content.slice(spokenOffsetRef.current).trim();
      if (remainder) {
        const clean = cleanChunkForTTS(remainder);
        if (clean) {
          sentenceQueueRef.current.push(clean);
        }
        spokenOffsetRef.current = latest.content.length;
        if (!isSpeakingRef.current) {
          playNextSentence();
        }
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isOpen, messages, isStreaming, playNextSentence]);

  if (!isOpen) return null;

  // Get current live response text from active assistant message
  const assistantMsgs = messages.filter((m) => m.role === 'assistant');
  const latestAssistantMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
  const liveResponseText = latestAssistantMsg ? latestAssistantMsg.content : '';

  return (
    <div className="live-voice-space-overlay" role="dialog" aria-modal="true" aria-label="Unified AI Live Voice">
      {/* 1. Blurred lively moving transparent layer with standard premium colors */}
      <div className="live-voice-aurora-bg" />

      {/* 2. Top Navigation Bar */}
      <div className="live-voice-topbar">
        <div className="live-voice-branding">
          <span className="live-voice-status-badge">LIVE TALK</span>
          <span className="live-voice-model-pill">{currentModelName}</span>
        </div>

        <div className="live-voice-top-actions">
          {availableVoices.length > 0 && (
            <select
              className="live-voice-voice-select"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              title="Change Voice"
            >
              {availableVoices
                .filter((v) => v.lang.startsWith('en'))
                .slice(0, 8)
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.replace(/Microsoft |Google |Apple /g, '').slice(0, 16)}
                  </option>
                ))}
            </select>
          )}

          <button
            type="button"
            className="live-voice-close-icon-btn"
            onClick={onClose}
            aria-label="Exit live voice mode"
            title="Exit live voice (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 3. Center Live Interactive Morphing Bubble Orb & Transcript */}
      <div className="live-voice-center-stage">
        {/* The Live Interactive Moving Bubble (as depicted in PDF Page 2) */}
        <div className="live-bubble-stage">
          <div className={`live-bubble-orb live-bubble-orb--${voiceState}`}>
            {/* Morphing Organic Fluid Rings */}
            <div className="live-bubble-fluid-ring live-bubble-fluid-ring--1" />
            <div className="live-bubble-fluid-ring live-bubble-fluid-ring--2" />
            <div className="live-bubble-fluid-ring live-bubble-fluid-ring--3" />
            <div className="live-bubble-fluid-ring live-bubble-fluid-ring--4" />

            {/* Central Interactive Core Button */}
            <button
              type="button"
              className="live-bubble-core"
              onClick={() => {
                if (voiceState === 'speaking') {
                  handleInterruptVoice();
                } else if (voiceState === 'listening' && transcript.trim()) {
                  setCurrentPrompt(transcript.trim());
                  onSendMessage(transcript.trim());
                  setTranscript('');
                }
              }}
              title={
                voiceState === 'speaking'
                  ? 'Tap to interrupt'
                  : voiceState === 'listening'
                  ? 'Tap when done speaking'
                  : 'Live Audio Active'
              }
            >
              {voiceState === 'listening' && (
                <div className="live-bubble-soundbars">
                  <span className="live-soundbar bar-1" />
                  <span className="live-soundbar bar-2" />
                  <span className="live-soundbar bar-3" />
                  <span className="live-soundbar bar-4" />
                  <span className="live-soundbar bar-5" />
                </div>
              )}

              {voiceState === 'thinking' && (
                <div className="live-bubble-thinking-spinner">
                  <div className="spinner-orbit" />
                </div>
              )}

              {voiceState === 'speaking' && (
                <div className="live-bubble-speaking-waves">
                  <span className="speak-bar sbar-1" />
                  <span className="speak-bar sbar-2" />
                  <span className="speak-bar sbar-3" />
                  <span className="speak-bar sbar-4" />
                </div>
              )}
            </button>
          </div>

          {/* Real-time State Label */}
          <div className="live-bubble-status-text">
            {voiceState === 'listening' && (
              <span className="live-status-pill live-status-pill--listening">
                <span className="pulse-dot pulse-dot--cyan" />
                {transcript ? 'Listening…' : 'Listening… speak anytime'}
              </span>
            )}
            {voiceState === 'thinking' && (
              <span className="live-status-pill live-status-pill--thinking">
                <span className="pulse-dot pulse-dot--indigo" />
                Processing response…
              </span>
            )}
            {voiceState === 'speaking' && (
              <span className="live-status-pill live-status-pill--speaking">
                <span className="pulse-dot pulse-dot--orange" />
                Speaking · Speak anytime to interrupt
              </span>
            )}
          </div>
        </div>

        {/* 4. Live Transcript / Response Box (as depicted in PDF Page 3) */}
        <div className="live-transcript-container">
          {/* User Prompt Subtitle */}
          {(transcript || currentPrompt) && (
            <div className="live-user-speech-bubble">
              <span className="live-user-label">You:</span>
              <p className="live-user-text">
                “{transcript || currentPrompt}”
              </p>
            </div>
          )}

          {/* Live Assistant Response Streaming View */}
          <div className="live-ai-response-card">
            {liveResponseText ? (
              <div className="live-ai-stream-text">
                {liveResponseText}
              </div>
            ) : voiceState === 'thinking' ? (
              <div className="live-ai-placeholder live-ai-placeholder--thinking">
                Formulating intelligent answer…
              </div>
            ) : (
              <div className="live-ai-placeholder">
                How can I assist you today? Speak naturally—your conversation is stored in your active chat.
              </div>
            )}
          </div>

          {errorMessage && <div className="live-voice-error">{errorMessage}</div>}
        </div>
      </div>

      {/* 5. Bottom Action Controls & Persistence Note */}
      <div className="live-voice-footer">
        <div className="live-voice-controls-row">
          <button
            type="button"
            className={`live-ctrl-btn ${isMuted ? 'live-ctrl-btn--muted' : ''}`}
            onClick={() => {
              if (isMuted) {
                setIsMuted(false);
                startLiveRecognition();
              } else {
                setIsMuted(true);
                if (recognitionRef.current) {
                  try {
                    recognitionRef.current.abort();
                  } catch {
                    // Ignore
                  }
                }
              }
            }}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                <path d="M5 10v2a7 7 0 0 0 12 5" />
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              className="live-ctrl-btn live-ctrl-btn--interrupt"
              onClick={handleInterruptVoice}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
              </svg>
              <span>Interrupt Voice</span>
            </button>
          ) : (
            <button
              type="button"
              className="live-ctrl-btn live-ctrl-btn--exit"
              onClick={onClose}
            >
              <span>Stop & Continue Chat</span>
            </button>
          )}
        </div>

        <p className="live-voice-storage-hint">
          All audio exchanges are saved directly to your chat history. Closing Live Talk preserves the entire discussion.
        </p>
      </div>
    </div>
  );
};
