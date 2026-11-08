import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../../types';
import { MarkdownContent } from '../chat/MarkdownContent';
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

/**
 * Natural English cleaner for speech synthesis:
 * Translates LaTeX math expressions, environments, and markdown syntax
 * into smooth, articulate, pronounceable English sentences.
 */
function cleanChunkForTTS(text: string): string {
  if (!text) return '';
  let t = text;

  // 1. Remove markdown images, links, HTML comments, code blocks
  t = t.replace(/!\[.*?\]\(.*?\)/g, '');
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/```[\s\S]*?```/g, 'Code block omitted.');
  t = t.replace(/`([^`]+)`/g, '$1');

  // 2. Clean LaTeX math environments and commands into natural speech
  t = t.replace(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, ' ');
  t = t.replace(/\\begin\{[^}]+\}/g, ' ');
  t = t.replace(/\\end\{[^}]+\}/g, ' ');
  t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');
  t = t.replace(/\\text\{([^}]+)\}/g, '$1');
  t = t.replace(/\\textbf\{([^}]+)\}/g, '$1');
  t = t.replace(/\\textit\{([^}]+)\}/g, '$1');
  t = t.replace(/\\Phi/g, 'Phi');
  t = t.replace(/\\alpha/g, 'alpha');
  t = t.replace(/\\beta/g, 'beta');
  t = t.replace(/\\gamma/g, 'gamma');
  t = t.replace(/\\delta/g, 'delta');
  t = t.replace(/\\theta/g, 'theta');
  t = t.replace(/\\lambda/g, 'lambda');
  t = t.replace(/\\nu/g, 'nu');
  t = t.replace(/\\pi/g, 'pi');
  t = t.replace(/\\sigma/g, 'sigma');
  t = t.replace(/\\omega/g, 'omega');
  t = t.replace(/\\gg/g, 'much greater than');
  t = t.replace(/\\ll/g, 'much less than');
  t = t.replace(/\\approx/g, 'approximately');
  t = t.replace(/\\xrightarrow\{([^}]*)\}/g, 'yields $1');
  t = t.replace(/\\xrightarrow/g, 'yields');
  t = t.replace(/\\rightarrow/g, 'yields');
  t = t.replace(/\\to/g, 'to');
  t = t.replace(/\\le|\\leq/g, 'less than or equal to');
  t = t.replace(/\\ge|\\geq/g, 'greater than or equal to');
  t = t.replace(/\\cdot/g, 'times');
  t = t.replace(/\\times/g, 'times');
  t = t.replace(/\\pm/g, 'plus or minus');
  t = t.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');
  t = t.replace(/\\sum/g, 'sum of');
  t = t.replace(/\\int/g, 'integral of');
  t = t.replace(/\$\$|\$/g, ' ');
  t = t.replace(/\\[a-zA-Z]+/g, ' ');
  t = t.replace(/[\{\}\^_\\]/g, ' ');

  // 3. Remove markdown syntax & emojis
  t = t.replace(/[#*~_>]/g, ' ');
  t = t.replace(/⚡|🧠|🤖|💡|✨|📌|⚠️|🔥|✅|❌/g, '');

  // 4. Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
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
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const spokenOffsetRef = useRef<number>(0);
  const sentenceQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechFallbackTimerRef = useRef<any>(null);
  const chromeKeepAliveRef = useRef<any>(null);
  const currentLiveMessageIdRef = useRef<string | null>(null);
  const prevStreamingRef = useRef(isStreaming);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioAnimationRef = useRef<number | null>(null);

  // Chrome TTS Anti-Freeze Watchdog (Prevents Chrome 15s pause bug)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    chromeKeepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 2500);

    return () => {
      if (chromeKeepAliveRef.current) {
        clearInterval(chromeKeepAliveRef.current);
        chromeKeepAliveRef.current = null;
      }
    };
  }, []);

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
              v.name.includes('Jenny') ||
              v.name.includes('David') ||
              v.name.includes('Zira'))
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
  }, [selectedVoice]);

  // Audio Playback Pipeline: Speaks queued sentences smoothly without tearing down audio session
  const playNextSentence = useCallback(() => {
    if (!('speechSynthesis' in window)) return;

    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }

    if (sentenceQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;
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

    // NOTE: NEVER call recognitionRef.current.abort() here!
    // In Windows Chromium, aborting recognition tears down the WASAPI audio session, killing speech synthesis!
    // Recognition remains active and safely ignores speaker audio in onresult via isSpeakingRef.current.

    try {
      window.speechSynthesis.resume();
    } catch {
      // Ignore
    }

    const utter = new SpeechSynthesisUtterance(nextSentence.trim());
    activeUtteranceRef.current = utter; // Retain reference in ref to prevent Chrome V8 GC bug
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    utter.lang = 'en-US';

    if (selectedVoice && availableVoices.length > 0) {
      const match = availableVoices.find((v) => v.name === selectedVoice);
      if (match) utter.voice = match;
    }

    utter.onend = () => {
      activeUtteranceRef.current = null;
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
      playNextSentence();
    };

    utter.onerror = (e) => {
      console.warn('SpeechSynthesis utterance error:', e);
      activeUtteranceRef.current = null;
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
      playNextSentence();
    };

    // Failsafe watchdog timer in case speech engine hangs on an utterance
    const durationEstimate = Math.max(1600, (nextSentence.length * 85) + 1600);
    speechFallbackTimerRef.current = setTimeout(() => {
      if (isSpeakingRef.current) {
        console.warn('Speech watchdog advanced to next sentence');
        playNextSentence();
      }
    }, durationEstimate);

    try {
      window.speechSynthesis.speak(utter);
      window.speechSynthesis.resume();
    } catch (err) {
      console.warn('window.speechSynthesis.speak failed:', err);
      playNextSentence();
    }
  }, [isStreaming, selectedVoice, availableVoices]);

  // Voice Barge-In: User interrupts speech (tapping orb, card, button, or speaking "stop")
  const handleInterruptVoice = useCallback(() => {
    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    activeUtteranceRef.current = null;
    sentenceQueueRef.current = [];
    isSpeakingRef.current = false;
    if (isStreaming) {
      onCancelGeneration();
    }
    setVoiceState('listening');
  }, [isStreaming, onCancelGeneration]);

  // Web Audio API Microphone Energy Analysis for Real-time Spiking & Barge-In
  useEffect(() => {
    if (!isOpen || isMuted) {
      if (audioAnimationRef.current) cancelAnimationFrame(audioAnimationRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setMicVolume(0);
      return;
    }

    let isCancelled = false;

    const initMicrophoneStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let spikeCounter = 0;

        const processAudio = () => {
          if (!analyserRef.current || isCancelled) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(1, avg / 85); // 0 to 1 range

          setMicVolume((prev) => Math.max(normalized, prev * 0.75));

          // Voice barge-in: If assistant is speaking and user starts talking (>0.32 volume)
          if (isSpeakingRef.current && normalized > 0.32) {
            spikeCounter++;
            if (spikeCounter > 6) { // ~100ms of sustained voice
              spikeCounter = 0;
              handleInterruptVoice();
            }
          } else {
            spikeCounter = 0;
          }

          audioAnimationRef.current = requestAnimationFrame(processAudio);
        };

        processAudio();
      } catch (err) {
        console.warn('Microphone audio stream error:', err);
      }
    };

    initMicrophoneStream();

    return () => {
      isCancelled = true;
      if (audioAnimationRef.current) cancelAnimationFrame(audioAnimationRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [isOpen, isMuted, handleInterruptVoice]);

  // Start continuous recognition
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
      // If AI is currently speaking:
      if (isSpeakingRef.current) {
        // Voice Barge-In: Check if user spoke an intentional voice interruption command!
        let bargeInText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          bargeInText += event.results[i][0].transcript + ' ';
        }
        const lower = bargeInText.toLowerCase().trim();
        if (
          lower.includes('stop') ||
          lower.includes('wait') ||
          lower.includes('hold on') ||
          lower.includes('shut up') ||
          lower.includes('pause') ||
          lower.includes('cancel') ||
          lower.includes('quiet')
        ) {
          handleInterruptVoice();
        }
        // Suppress laptop speaker acoustic echo loop
        return;
      }

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
        setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser.');
        setVoiceState('listening');
      }
    };

    rec.onend = () => {
      // Automatically keep recognition listening without interrupting audio
      if (isOpen && !isMuted) {
        try {
          rec.start();
        } catch {
          // Already running
        }
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.warn('Live recognition start error:', err);
    }
  }, [isOpen, isMuted, onSendMessage, handleInterruptVoice]);

  // Lifecycle when Live Voice opens/closes
  useEffect(() => {
    if (isOpen) {
      spokenOffsetRef.current = 0;
      sentenceQueueRef.current = [];
      isSpeakingRef.current = false;
      // Unlock audio with gesture
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume();
        } catch {
          // Ignore
        }
      }
      startLiveRecognition();
    } else {
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
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
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
      activeUtteranceRef.current = null;
      sentenceQueueRef.current = [];
      isSpeakingRef.current = false;
      setTranscript('');
      finalTranscriptRef.current = '';
    }

    return () => {
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [isOpen, startLiveRecognition]);

  // Sentence-pipelined streaming TTS: Speaks incoming chunks in real-time (< 400ms latency)
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

    // Matches completed sentences (. ? ! or double newlines)
    const sentenceRegex = /[^.?!]+[.?!]+(?:\s+|$)|[^\n]+\n+/g;
    let match;
    let lastIndex = 0;

    while ((match = sentenceRegex.exec(unread)) !== null) {
      const sentenceText = match[0];
      const clean = cleanChunkForTTS(sentenceText);
      if (clean) {
        // Break long sentences (> 150 chars) at punctuation pauses so Chrome never times out
        if (clean.length > 150) {
          const parts = clean.match(/[^,;]+[,;]+(?:\s+|$)|.+/g) || [clean];
          for (const p of parts) {
            const pTrim = p.trim();
            if (pTrim) sentenceQueueRef.current.push(pTrim);
          }
        } else {
          sentenceQueueRef.current.push(clean);
        }
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

  // Render floating ambient dock when user minimizes live voice
  if (isMinimized) {
    return (
      <aside className="live-voice-floating-bar" aria-label="Live Voice Floating Bar">
        <div className="live-floating-left">
          <div
            className="live-floating-orb-dot"
            style={{
              transform: `scale(${1 + (voiceState === 'listening' ? micVolume * 0.7 : 0.2)})`,
            }}
          />
          <div className="live-floating-text-wrap">
            <span className="live-floating-title">LIVE TALK</span>
            <span className="live-floating-state-label">
              {voiceState === 'listening'
                ? (transcript ? `“${transcript}”` : 'Listening… speak anytime')
                : voiceState === 'thinking'
                ? 'Formulating answer…'
                : 'Speaking…'}
            </span>
          </div>
        </div>

        <div className="live-floating-actions">
          {voiceState === 'speaking' && (
            <button
              type="button"
              className="live-floating-btn live-floating-btn--interrupt"
              onClick={handleInterruptVoice}
              title="Interrupt voice"
            >
              Stop Speaking
            </button>
          )}

          <button
            type="button"
            className="live-floating-btn live-floating-btn--expand"
            onClick={() => setIsMinimized(false)}
            title="Expand to Full Visualizer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
            <span>Expand</span>
          </button>

          <button
            type="button"
            className="live-floating-btn live-floating-btn--close"
            onClick={onClose}
            title="Exit Live Voice"
          >
            ✕
          </button>
        </div>
      </aside>
    );
  }

  // Get current live response text from active assistant message
  const assistantMsgs = messages.filter((m) => m.role === 'assistant');
  const latestAssistantMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
  const liveResponseText = latestAssistantMsg ? latestAssistantMsg.content : '';

  return (
    <div className="live-voice-space-overlay" role="dialog" aria-modal="true" aria-label="Unified AI Live Voice">
      {/* 1. Translucent animated chromatic aurora mesh (Cyan, Indigo, Coral, Magenta, Emerald) */}
      <div className="live-voice-aurora-bg" />

      {/* 2. Top Glassy Navigation Bar */}
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
                .slice(0, 10)
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.replace(/Microsoft |Google |Apple /g, '').slice(0, 18)}
                  </option>
                ))}
            </select>
          )}

          <button
            type="button"
            className="live-voice-minimize-icon-btn"
            onClick={() => setIsMinimized(true)}
            aria-label="Minimize live voice"
            title="Minimize to floating bar (view active chat)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
          </button>

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
          <div
            className={`live-bubble-orb live-bubble-orb--${voiceState}`}
            style={{
              transform: `scale(${1 + (voiceState === 'listening' ? micVolume * 0.45 : 0)})`,
              transition: 'transform 0.08s ease-out',
            }}
            onClick={() => {
              if (voiceState === 'speaking') {
                handleInterruptVoice();
              }
            }}
            title={voiceState === 'speaking' ? 'Click orb to interrupt' : 'Interactive Live Bubble'}
          >
            {/* Morphing Dynamic Fluid Concentric Light Rings */}
            <div
              className="live-bubble-fluid-ring live-bubble-fluid-ring--1"
              style={{
                transform: `scale(${1 + micVolume * 0.5})`,
                opacity: 0.35 + micVolume * 0.5,
              }}
            />
            <div
              className="live-bubble-fluid-ring live-bubble-fluid-ring--2"
              style={{
                transform: `scale(${1.2 + micVolume * 0.75})`,
                opacity: 0.25 + micVolume * 0.45,
              }}
            />
            <div
              className="live-bubble-fluid-ring live-bubble-fluid-ring--3"
              style={{
                transform: `scale(${1.4 + micVolume * 1.0})`,
                opacity: 0.15 + micVolume * 0.4,
              }}
            />
            <div
              className="live-bubble-fluid-ring live-bubble-fluid-ring--4"
              style={{
                transform: `scale(${1.6 + micVolume * 1.25})`,
                opacity: 0.1 + micVolume * 0.35,
              }}
            />

            {/* Central Interactive Core Button */}
            <button
              type="button"
              className="live-bubble-core"
              onClick={(e) => {
                e.stopPropagation();
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
                  ? 'Tap to interrupt speech'
                  : voiceState === 'listening'
                  ? 'Tap when done speaking'
                  : 'Live Audio Active'
              }
            >
              {voiceState === 'listening' && (
                <div className="live-bubble-soundbars">
                  <span className="live-soundbar bar-1" style={{ height: `${Math.max(6, 8 + micVolume * 34)}px` }} />
                  <span className="live-soundbar bar-2" style={{ height: `${Math.max(8, 12 + micVolume * 48)}px` }} />
                  <span className="live-soundbar bar-3" style={{ height: `${Math.max(10, 16 + micVolume * 58)}px` }} />
                  <span className="live-soundbar bar-4" style={{ height: `${Math.max(8, 12 + micVolume * 48)}px` }} />
                  <span className="live-soundbar bar-5" style={{ height: `${Math.max(6, 8 + micVolume * 34)}px` }} />
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
                Formulating answer…
              </span>
            )}
            {voiceState === 'speaking' && (
              <span
                className="live-status-pill live-status-pill--speaking"
                onClick={handleInterruptVoice}
                style={{ cursor: 'pointer' }}
                title="Click or say 'stop' to interrupt"
              >
                <span className="pulse-dot pulse-dot--coral" />
                Speaking · Say "stop" or tap orb to interrupt
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

          {/* Live Assistant Response Streaming View with Full Math & Typography */}
          <div className="live-ai-response-card">
            {liveResponseText ? (
              <div className="live-ai-stream-text">
                <MarkdownContent content={liveResponseText} />
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

      {/* 5. Bottom Glassy Action Controls & Persistence Note */}
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