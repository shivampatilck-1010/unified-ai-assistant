import React from 'react';

export interface ModelBrandLogoProps {
  modelId?: string;
  provider?: string;
  size?: number;
  className?: string;
}

export const ModelBrandLogo: React.FC<ModelBrandLogoProps> = ({
  modelId = '',
  provider = '',
  size = 18,
  className = '',
}) => {
  const m = modelId.toLowerCase();
  const p = provider.toLowerCase();

  // 1. Unified Team Sub-Modes
  if (m.includes('dual-expert')) {
    // Intersecting dual-node dialectic vector
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Dual-Expert Debate"
      >
        <circle cx="8" cy="12" r="5" stroke="#d97757" strokeWidth="2" fill="rgba(217, 119, 87, 0.2)" />
        <circle cx="16" cy="12" r="5" stroke="#38bdf8" strokeWidth="2" fill="rgba(56, 189, 248, 0.2)" />
        <path d="M11 9.5a5 5 0 0 1 2 5" stroke="#faf9f5" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (m.includes('frontier-council') || m.includes('roundtable')) {
    // 5-node interconnected council matrix
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Full Frontier Council"
      >
        <polygon points="12 3 20 8.5 17 18 7 18 4 8.5" stroke="#d97757" strokeWidth="1.8" fill="rgba(217, 119, 87, 0.15)" />
        <circle cx="12" cy="3" r="2" fill="#38bdf8" />
        <circle cx="20" cy="8.5" r="2" fill="#76b900" />
        <circle cx="17" cy="18" r="2" fill="#8b5cf6" />
        <circle cx="7" cy="18" r="2" fill="#10b981" />
        <circle cx="4" cy="8.5" r="2" fill="#f97316" />
        <circle cx="12" cy="12" r="2.5" fill="#faf9f5" />
      </svg>
    );
  }

  if (m.includes('code-pair') || m.includes('engineering')) {
    // Code brackets pair vector
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Elite Engineering Pair"
      >
        <rect x="2" y="4" width="20" height="16" rx="4" stroke="#a855f7" strokeWidth="1.8" fill="rgba(168, 85, 247, 0.15)" />
        <path d="M8 10L6 12L8 14" stroke="#faf9f5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 10L18 12L16 14" stroke="#faf9f5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 9L11 15" stroke="#d97757" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (m.includes('scientific') || m.includes('symposium')) {
    // Quantum Bohr orbit & scientific atom vector
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Scientific Symposium"
      >
        <ellipse cx="12" cy="12" rx="9" ry="3.8" stroke="#38bdf8" strokeWidth="1.6" transform="rotate(30 12 12)" />
        <ellipse cx="12" cy="12" rx="9" ry="3.8" stroke="#6366f1" strokeWidth="1.6" transform="rotate(-30 12 12)" />
        <circle cx="12" cy="12" r="2.8" fill="#d97757" />
      </svg>
    );
  }

  if (m === 'unified-team' || p.includes('unified') || p.includes('council')) {
    // Unified Team Insignia
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Unified Team"
      >
        <circle cx="12" cy="12" r="9.5" stroke="url(#unifiedGrad)" strokeWidth="1.8" />
        <circle cx="12" cy="6" r="2" fill="#38bdf8" />
        <circle cx="18" cy="15" r="2" fill="#d97757" />
        <circle cx="6" cy="15" r="2" fill="#76b900" />
        <path d="M12 6L18 15M12 6L6 15M6 15H18" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="2.5" fill="#faf9f5" />
        <defs>
          <linearGradient id="unifiedGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d97757" />
            <stop offset="0.5" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // 2. Google Gemini
  if (p.includes('google') || m.includes('gemini')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Google Gemini"
      >
        <path
          d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"
          fill="url(#geminiLogoGrad)"
        />
        <defs>
          <linearGradient id="geminiLogoGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4285F4" />
            <stop offset="0.45" stopColor="#9B72CB" />
            <stop offset="0.9" stopColor="#D96570" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // 3. Anthropic Claude
  if (p.includes('anthropic') || m.includes('claude')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Anthropic Claude"
      >
        <path
          d="M14.5 4L9.5 20M4 14.5L20 9.5M4 9.5L20 14.5M9.5 4L14.5 20"
          stroke="#d97757"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 4. OpenAI
  if (p.includes('openai') || m.includes('gpt') || m.includes('o1') || m.includes('o3')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#10a37f"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="OpenAI"
      >
        <path d="M12 2a4.5 4.5 0 0 0-4.4 3.6A4.5 4.5 0 0 0 4 9.8a4.5 4.5 0 0 0 .5 4.4 4.5 4.5 0 0 0 3.1 3.7 4.5 4.5 0 0 0 4.4 3.6 4.5 4.5 0 0 0 4.4-3.6 4.5 4.5 0 0 0 3.6-4.2 4.5 4.5 0 0 0-.5-4.4 4.5 4.5 0 0 0-3.1-3.7A4.5 4.5 0 0 0 12 2z" />
        <path d="M12 7v5l4 2.5" />
      </svg>
    );
  }

  // 5. NVIDIA
  if (p.includes('nvidia') || m.includes('nemotron')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="NVIDIA"
      >
        <path
          d="M4.5 15.5C4.5 10 9 7.5 12.5 7.5C17.5 7.5 19.5 12 19.5 12C19.5 12 17.5 16.5 12.5 16.5C10 16.5 8 15 8 13.5C8 12 9.5 11 11.5 11C13 11 14 12 14 12C14 12 13 13.5 11.5 13.5"
          stroke="#76b900"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="9" stroke="#76b900" strokeWidth="1.8" />
      </svg>
    );
  }

  // 6. DeepSeek
  if (p.includes('deepseek') || m.includes('deepseek') || m.includes('r1')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="DeepSeek"
      >
        {/* DeepSeek whale / dorsal fin vector */}
        <path
          d="M3 13C5 8 10 5 15 5C17 5 19 6 21 8C19 12 15 17 9 18C6 18.5 4 16 3 13Z"
          fill="#1e40af"
          stroke="#3b82f6"
          strokeWidth="1.5"
        />
        <path
          d="M12 5C14 8 16 11 21 12"
          stroke="#60a5fa"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="17.5" cy="8.5" r="1.2" fill="#faf9f5" />
      </svg>
    );
  }

  // 7. Alibaba Qwen
  if (p.includes('qwen') || m.includes('qwen')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Alibaba Qwen"
      >
        <polygon
          points="12 2 19 6 19 14 12 18 5 14 5 6"
          stroke="#8b5cf6"
          strokeWidth="1.8"
          fill="rgba(139, 92, 246, 0.2)"
        />
        <polygon
          points="12 6 16 8.5 16 13.5 12 16 8 13.5 8 8.5"
          fill="#8b5cf6"
        />
        <circle cx="12" cy="11" r="1.5" fill="#faf9f5" />
      </svg>
    );
  }

  // 8. Meta / Llama
  if (p.includes('meta') || m.includes('llama')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Meta Llama"
      >
        <path
          d="M6.5 16C4 16 2.5 14 2.5 12C2.5 10 4 8 6.5 8C9.5 8 12 13 14 15C15.5 16.5 18 16.5 19.5 15C21 13.5 21 10.5 19.5 9C18 7.5 15.5 7.5 14 9C12 11 9.5 16 6.5 16Z"
          stroke="url(#metaGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="metaGrad" x1="2" y1="8" x2="22" y2="16" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0081fb" />
            <stop offset="1" stopColor="#00c6ff" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // 9. Groq
  if (p.includes('groq')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Groq"
      >
        <path
          d="M12 3C7 3 3 7 3 12C3 17 7 21 12 21C16 21 19.5 18.5 20.5 15H12V11H21C21 6.5 17 3 12 3Z"
          fill="#f55036"
        />
      </svg>
    );
  }

  // 10. Ollama / Local
  if (p.includes('local') || p.includes('ollama')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        style={{ flexShrink: 0 }}
        aria-label="Ollama Local"
      >
        <circle cx="12" cy="12" r="9.5" fill="#252421" stroke="#eab308" strokeWidth="1.8" />
        <circle cx="9.5" cy="10" r="1.3" fill="#faf9f5" />
        <circle cx="14.5" cy="10" r="1.3" fill="#faf9f5" />
        <ellipse cx="12" cy="14" rx="2.5" ry="1.5" stroke="#eab308" strokeWidth="1.2" />
        <path d="M10 5L9 2M14 5L15 2" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // Fallback AI Star Vector
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ flexShrink: 0 }}
      aria-label="AI Model"
    >
      <circle cx="12" cy="12" r="8.5" stroke="#d97757" strokeWidth="1.8" fill="rgba(217, 119, 87, 0.15)" />
      <polygon points="12 6 13.5 10.5 18 12 13.5 13.5 12 18 10.5 13.5 6 12 10.5 10.5" fill="#faf9f5" />
    </svg>
  );
};
