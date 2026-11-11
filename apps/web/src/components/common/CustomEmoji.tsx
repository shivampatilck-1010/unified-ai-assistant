import React from 'react';

export type EmojiName =
  | 'calendar'
  | 'calendar-alt'
  | 'apple'
  | 'fire'
  | 'flask'
  | 'lightning'
  | 'brain'
  | 'robot'
  | 'lightbulb'
  | 'sparkles'
  | 'pin'
  | 'warning'
  | 'check'
  | 'cross'
  | 'clock'
  | 'books'
  | 'grad-cap'
  | 'laptop'
  | 'rocket'
  | 'target'
  | 'chart'
  | 'search'
  | 'folder'
  | 'memo'
  | 'lock'
  | 'chat'
  | 'trophy'
  | 'star'
  | 'bell'
  | 'shield'
  | 'globe'
  | 'link'
  | 'gear'
  | 'speaker'
  | 'thumbs-up'
  | 'thumbs-down'
  | 'heart'
  | 'party'
  | 'key'
  | 'package'
  | 'tag'
  | 'gem'
  | 'atom'
  | 'microscope'
  | 'dna'
  | 'terminal'
  | 'clipboard';

interface CustomEmojiProps {
  name: EmojiName;
  size?: number;
  className?: string;
  title?: string;
}

export const CustomEmoji: React.FC<CustomEmojiProps> = ({
  name,
  size = 17,
  className = '',
  title,
}) => {
  const icon = (() => {
    switch (name) {
      case 'calendar':
      case 'calendar-alt':
        // Modern Calendar Icon (Google / Cal style)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="4" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.8" />
            <path d="M3 9h18" stroke="#38bdf8" strokeWidth="1.8" />
            <path d="M8 2v4M16 2v4" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <rect x="7" y="13" width="2.5" height="2.5" rx="0.5" fill="#38bdf8" />
            <rect x="11" y="13" width="2.5" height="2.5" rx="0.5" fill="#38bdf8" />
            <rect x="15" y="13" width="2.5" height="2.5" rx="0.5" fill="#38bdf8" />
          </svg>
        );

      case 'apple':
        // Crisp Official Apple Silhouette Logo
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" color="#f4f4f5">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.89c.62-.75 1.04-1.8 0.93-2.89-.9.04-1.99.6-2.63 1.35-.57.66-.99 1.72-.88 2.76 1 .08 2.03-.53 2.58-1.22z" />
          </svg>
        );

      case 'fire':
        // Clean Vibrant Flame
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="60%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <path
              d="M12 2c-.5 2.5-2 4.5-3.5 6-1.8 1.8-3 4-3 6.5a6.5 6.5 0 0 0 13 0c0-3.5-2.2-6.5-4.5-8.5-.7-.6-1.5-1.5-1.5-3-.2-.4-.4-.7-.5-1z"
              fill="url(#fireGrad)"
            />
            <path
              d="M12 14c-.6 0-1.2.3-1.6.8-.5.6-.7 1.3-.6 2.1a2.5 2.5 0 0 0 4.4.8c.4-.6.5-1.3.4-2-.1-.8-.6-1.4-1.4-1.7-.4-.1-.8 0-1.2 0z"
              fill="#fef08a"
            />
          </svg>
        );

      case 'flask':
        // Chemistry / Science Beaker
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path
              d="M9 3h6M10 3v5l-4.5 9A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 8V3"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7 16h10l-1.5-3.5a1 1 0 0 0-.9-.5H9.4a1 1 0 0 0-.9.5L7 16z"
              fill="rgba(6, 182, 212, 0.45)"
            />
          </svg>
        );

      case 'lightning':
        // Electric Lightning Bolt
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.2" />
          </svg>
        );

      case 'brain':
        // AI Neural Network / Brain
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04" />
          </svg>
        );

      case 'robot':
        // Modern AI Bot
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4M8 16h.01M16 16h.01" />
          </svg>
        );

      case 'lightbulb':
        // Idea / Insight Lightbulb
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
          </svg>
        );

      case 'sparkles':
        // 4-pointed AI Magic Sparkles
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2z" fill="#38bdf8" />
            <path d="M19 15l1.2 2.8L23 19l-2.8 1.2L19 23l-1.2-2.8L15 19l2.8-1.2L19 15z" fill="#818cf8" />
          </svg>
        );

      case 'pin':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-2l-2-3V5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v7l-2 3v2z" />
          </svg>
        );

      case 'warning':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="#1c1917" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1" fill="#1c1917" />
          </svg>
        );

      case 'check':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#10b981" />
            <polyline points="9 12 11 14 15 10" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );

      case 'cross':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#ef4444" />
            <line x1="15" y1="9" x2="9" y2="15" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <line x1="9" y1="9" x2="15" y2="15" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      case 'clock':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );

      case 'books':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        );

      case 'grad-cap':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        );

      case 'laptop':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <line x1="2" y1="20" x2="22" y2="20" />
          </svg>
        );

      case 'rocket':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
        );

      case 'target':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        );

      case 'chart':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        );

      case 'search':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        );

      case 'folder':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        );

      case 'memo':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        );

      case 'lock':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        );

      case 'trophy':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" fill="rgba(234, 179, 8, 0.2)" stroke="#eab308" strokeWidth="1.8" />
            <path d="M12 16v3M8 21h8" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        );

      case 'star':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );

      case 'bell':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="rgba(245, 158, 11, 0.15)" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        );

      case 'shield':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(16, 185, 129, 0.15)" />
          </svg>
        );

      case 'globe':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        );

      case 'link':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        );

      case 'gear':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        );

      case 'speaker':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="rgba(56, 189, 248, 0.2)" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        );

      case 'thumbs-up':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" fill="rgba(16, 185, 129, 0.15)" />
          </svg>
        );

      case 'thumbs-down':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" fill="rgba(239, 68, 68, 0.15)" />
          </svg>
        );

      case 'heart':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="#f43f5e" stroke="#e11d48" strokeWidth="1.2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        );

      case 'party':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M5.8 11.3L2 22l10.7-3.8L5.8 11.3z" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5" />
            <path d="M4 14l5 5" stroke="#ffffff" strokeWidth="1.5" />
            <circle cx="17" cy="5" r="1.5" fill="#ec4899" />
            <circle cx="21" cy="11" r="1.5" fill="#38bdf8" />
            <circle cx="13" cy="3" r="1.5" fill="#10b981" />
            <path d="M18 16l2 2M14 11l3-1M12 7l4 2" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

      case 'key':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-1.5 1.5L16 7l-2 2 1.5 1.5L14 12l-1.5-1.5L11 12m0 0a5.5 5.5 0 1 1-7.78-7.78A5.5 5.5 0 0 1 11 12z" />
          </svg>
        );

      case 'package':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        );

      case 'tag':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        );

      case 'gem':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="6 3 18 3 22 9 12 22 2 9" fill="rgba(56, 189, 248, 0.2)" />
            <line x1="2" y1="9" x2="22" y2="9" />
            <polyline points="10 3 6 9 12 22 18 9 14 3" />
          </svg>
        );

      case 'atom':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="2.5" fill="#38bdf8" />
            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#38bdf8" strokeWidth="1.5" transform="rotate(30 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#818cf8" strokeWidth="1.5" transform="rotate(-30 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#06b6d4" strokeWidth="1.5" transform="rotate(90 12 12)" />
          </svg>
        );

      case 'microscope':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18h8M10 22h8M14 18v4" />
            <circle cx="9" cy="9" r="3" fill="rgba(6, 182, 212, 0.2)" />
            <path d="M12 9a4 4 0 0 1-4 4H7" />
            <path d="M9 3l4 4-2 2-4-4 2-2z" fill="#06b6d4" fillOpacity="0.3" />
            <path d="M14 8l1.5-1.5" />
          </svg>
        );

      case 'dna':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 15c6.667-6 13.333 0 20-6" />
            <path d="M2 9c6.667 6 13.333 0 20 6" stroke="#38bdf8" />
            <path d="M7 11.5v1M12 10.5v3M17 11.5v1" stroke="#f472b6" strokeWidth="1.5" />
          </svg>
        );

      case 'terminal':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="3" fill="#181920" stroke="#38bdf8" strokeWidth="1.6" />
            <polyline points="6 9 10 12 6 15" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="13" y1="15" x2="18" y2="15" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      case 'clipboard':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" fill="#27272a" stroke="#38bdf8" strokeWidth="1.5" />
            <path d="M9 12l2 2 4-4" stroke="#10b981" strokeWidth="1.8" />
          </svg>
        );

      case 'chat':
      default:
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );
    }
  })();

  return (
    <span
      className={`custom-emoji-wrapper ${className}`}
      title={title || name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: '-0.16em',
        margin: '0 0.18em',
        lineHeight: 1,
      }}
    >
      {icon}
    </span>
  );
};

// Unicode emoji to CustomEmoji mapping table
export const EMOJI_MAP: Record<string, EmojiName> = {
  // Calendar / Planning
  '🗓️': 'calendar',
  '🗓': 'calendar',
  '📅': 'calendar-alt',
  '📆': 'calendar-alt',

  // Tech / Brands / Devices
  '🍎': 'apple',
  '🍏': 'apple',
  '💻': 'laptop',
  '📱': 'laptop',
  '🖥️': 'terminal',
  '🖥': 'terminal',
  '⌨️': 'terminal',
  '🤖': 'robot',
  '🧠': 'brain',

  // Status & Actions
  '🔥': 'fire',
  '⚡': 'lightning',
  '⚡️': 'lightning',
  '✨': 'sparkles',
  '🌟': 'sparkles',
  '⭐': 'star',
  '💡': 'lightbulb',
  '🚀': 'rocket',
  '🎯': 'target',
  '💎': 'gem',
  '🏆': 'trophy',
  '🎉': 'party',
  '🎊': 'party',

  // Science / Education
  '🧪': 'flask',
  '⚗️': 'flask',
  '⚗': 'flask',
  '🔬': 'microscope',
  '⚛️': 'atom',
  '⚛': 'atom',
  '🧬': 'dna',
  '📚': 'books',
  '📖': 'books',
  '🎓': 'grad-cap',

  // Alerts & Checks
  '📌': 'pin',
  '📍': 'pin',
  '⚠️': 'warning',
  '✅': 'check',
  '✔️': 'check',
  '☑️': 'check',
  '❌': 'cross',
  '✖️': 'cross',

  // Time & Tracking
  '🕒': 'clock',
  '⏰': 'clock',
  '⏱️': 'clock',
  '⏱': 'clock',
  '⏳': 'clock',

  // Organization & Productivity
  '📊': 'chart',
  '📈': 'chart',
  '📉': 'chart',
  '🔍': 'search',
  '🔎': 'search',
  '📁': 'folder',
  '📂': 'folder',
  '📝': 'memo',
  '📄': 'memo',
  '📋': 'clipboard',
  '🔒': 'lock',
  '🔑': 'key',
  '📦': 'package',
  '🏷️': 'tag',
  '🏷': 'tag',

  // Communication & Social
  '💬': 'chat',
  '🗨️': 'chat',
  '🔔': 'bell',
  '🔕': 'bell',
  '🛡️': 'shield',
  '🛡': 'shield',
  '🌐': 'globe',
  '🔗': 'link',
  '⚙️': 'gear',
  '⚙': 'gear',
  '🔊': 'speaker',
  '🔈': 'speaker',
  '🔉': 'speaker',
  '👍': 'thumbs-up',
  '👎': 'thumbs-down',
  '❤️': 'heart',
  '💖': 'heart',
  '🤍': 'heart',
};

// Regex matching all mapped Unicode emojis, ordered by descending character length to avoid prefix collision
const ESCAPED_KEYS = Object.keys(EMOJI_MAP)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export const EMOJI_REGEX = new RegExp(`(${ESCAPED_KEYS.join('|')})`, 'g');

/**
 * Replaces recognized Unicode emojis in a text string with CustomEmoji SVG components.
 */
export function replaceEmojisWithCustom(text: string): React.ReactNode[] {
  if (!text) return [text];
  const parts = text.split(EMOJI_REGEX);
  if (parts.length <= 1) return [text];

  return parts.map((part, idx) => {
    const emojiName = EMOJI_MAP[part];
    if (emojiName) {
      return <CustomEmoji key={`emoji-${idx}`} name={emojiName} />;
    }
    return part;
  });
}
