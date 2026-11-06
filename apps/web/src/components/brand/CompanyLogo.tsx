import React from 'react';

export interface CompanyLogoProps {
  provider?: string | null;
  modelId?: string | null;
  size?: number;
  className?: string;
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({
  provider = '',
  modelId = '',
  size = 16,
  className = '',
}) => {
  const p = (provider || '').toLowerCase();
  const m = (modelId || '').toLowerCase();

  // 1. Unified Team / Council
  if (p.includes('unified') || p.includes('council') || m.includes('unified-team') || m.includes('council/')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className={className}
        aria-label="Unified Team Logo"
      >
        <polygon
          points="12 2 21 7 21 17 12 22 3 17 3 7"
          stroke="#d97757"
          strokeWidth="1.8"
          fill="rgba(217, 119, 87, 0.2)"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" fill="#d97757" />
        <line x1="12" y1="2" x2="12" y2="8.8" stroke="#d97757" strokeWidth="1.5" />
        <line x1="21" y1="17" x2="14.8" y2="13.4" stroke="#d97757" strokeWidth="1.5" />
        <line x1="3" y1="17" x2="9.2" y2="13.4" stroke="#d97757" strokeWidth="1.5" />
      </svg>
    );
  }

  // 2. NVIDIA (Nemotron)
  if (p.includes('nvidia') || m.includes('nvidia') || m.includes('nemotron')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#76b900"
        className={className}
        aria-label="NVIDIA Logo"
      >
        <path d="M9.605 16.505c-1.34 0-2.905-.625-4.225-1.92-1.91-1.89-2.73-4.22-2.73-6.565 0-3.69 2.1-6.735 5.565-8.02 0 0-.585 1.14-.585 2.295 0 2.22 1.455 3.99 3.495 4.87-1.12.37-2.12.98-2.88 1.77-1.31 1.34-1.77 2.87-1.77 4.14 0 2.375 1.63 3.43 3.13 3.43zm2.59-1.995c-1.4 0-2.34-1.07-2.34-2.48 0-1.46.99-2.535 2.34-2.535 1.355 0 2.345 1.075 2.345 2.535 0 1.41-.94 2.48-2.345 2.48zm5.72-2.48c0-3.235-2.56-5.835-5.72-5.835-1.43 0-2.74.52-3.76 1.395-.06-.11-.1-.23-.1-.36 0-1.995 1.74-3.615 3.86-3.615 1.735 0 3.2 1.115 3.69 2.665.34-.135.7-.22 1.08-.22.915 0 1.73.495 2.16 1.25.75 1.33.79 2.97.79 4.72zm-5.72 8.47c-5.69 0-10.295-4.54-10.295-10.145 0-2.155.67-4.17 1.83-5.845-.59.73-.95 1.66-.95 2.67 0 2.925 1.64 5.485 4.1 6.845-.47.64-.75 1.42-.75 2.27 0 2.16 1.72 3.91 3.84 3.91h2.225c5.69 0 10.3-4.54 10.3-10.15 0-.46-.03-.91-.1-1.35.39.88.61 1.85.61 2.88 0 5.6-4.605 10.145-10.3 10.145z"/>
      </svg>
    );
  }

  // 3. Anthropic (Claude)
  if (p.includes('anthropic') || p.includes('claude') || m.includes('claude') || m.includes('anthropic')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#d97757"
        className={className}
        aria-label="Anthropic Claude Logo"
      >
        <path d="M13.827 2.5h-3.654L3 21.5h3.768l1.88-5.06h6.704l1.88 5.06h3.768L13.827 2.5zm-3.923 11.02l2.096-5.64 2.096 5.64H9.904z" />
      </svg>
    );
  }

  // 4. OpenAI (ChatGPT / GPT-4o / o3-mini)
  if (p.includes('openai') || m.includes('openai') || m.includes('gpt') || m.includes('o3-mini')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#10b981"
        className={className}
        aria-label="OpenAI Logo"
      >
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3428 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3427 7.8956zm16.0993 3.8558L12.5907 8.3829l2.02-1.1635a.0804.0804 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.3934-.6863zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0567V6.0748a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4598a.7948.7948 0 0 0-.3927.6813l-.0048 6.7219zm1.0974-2.3655l2.6025-1.4998 2.6025 1.4998v2.9997l-2.6025 1.4998-2.6025-1.4998z"/>
      </svg>
    );
  }

  // 5. Groq LPU
  if (p.includes('groq') || m.startsWith('groq/')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className={className}
        aria-label="Groq Logo"
      >
        <rect width="24" height="24" rx="5" fill="#f55036" />
        <path
          d="M16 11.5h-4.5v2.2h2.2c-.3 1.2-1.2 1.8-2.2 1.8-1.5 0-2.6-1.2-2.6-2.7s1.1-2.7 2.6-2.7c.8 0 1.5.3 2 .9l1.6-1.6c-1-1-2.3-1.5-3.6-1.5-2.8 0-5 2.2-5 5s2.2 5 5 5c2.7 0 4.7-1.9 4.7-4.7 0-.6-.1-1.1-.2-1.7H16z"
          fill="#ffffff"
        />
      </svg>
    );
  }

  // 6. Qwen / Alibaba Cloud
  if (p.includes('qwen') || m.includes('qwen')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className={className}
        aria-label="Qwen Logo"
      >
        <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="#615ced" />
        <path d="M12 6L17.196 9V15L12 18L6.804 15V9L12 6Z" fill="#ffffff" opacity="0.35" />
        <circle cx="12" cy="12" r="3.2" fill="#ffffff" />
      </svg>
    );
  }

  // 7. Google / Gemini
  if (p.includes('google') || p.includes('gemini') || m.includes('gemini') || m.includes('gemma')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className={className}
        aria-label="Google Gemini Logo"
      >
        <path
          d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4771 12 22C12 16.4771 16.4771 12 22 12C16.4771 12 12 7.52285 12 2Z"
          fill="url(#gemini-sparkle-grad)"
        />
        <defs>
          <linearGradient id="gemini-sparkle-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="0.5" stopColor="#818cf8" />
            <stop offset="1" stopColor="#c084fc" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // 8. Meta (Llama)
  if (p.includes('meta') || m.includes('llama')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#0081fb"
        className={className}
        aria-label="Meta Logo"
      >
        <path d="M12 15.65c-1.39 1.47-3.08 2.35-4.8 2.35-3.66 0-6.2-2.9-6.2-6 0-3.1 2.54-6 6.2-6 1.72 0 3.41.88 4.8 2.35 1.39-1.47 3.08-2.35 4.8-2.35 3.66 0 6.2 2.9 6.2 6 0 3.1-2.54 6-6.2 6-1.72 0-3.41-.88-4.8-2.35zm0-2.43c1.47-1.84 3.07-3.22 4.8-3.22 2.1 0 3.6 1.62 3.6 3.6 0 1.98-1.5 3.6-3.6 3.6-1.73 0-3.33-1.38-4.8-3.22zm-7.2.38c0-1.98 1.5-3.6 3.6-3.6 1.73 0 3.33 1.38 4.8 3.22-1.47 1.84-3.07 3.22-4.8 3.22-2.1 0-3.6-1.62-3.6-3.6z"/>
      </svg>
    );
  }

  // 9. Cohere
  if (p.includes('cohere') || m.includes('cohere') || m.includes('north')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className={className}
        aria-label="Cohere Logo"
      >
        <circle cx="8" cy="8" r="5" fill="#39594d" />
        <circle cx="16" cy="16" r="5" fill="#d77457" />
        <circle cx="16" cy="8" r="3.5" fill="#f6c257" />
      </svg>
    );
  }

  // 10. DeepSeek
  if (p.includes('deepseek') || m.includes('deepseek')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className={className}
        aria-label="DeepSeek Logo"
      >
        <rect width="24" height="24" rx="5" fill="#4d6bfe" />
        <path
          d="M7 16.5c2.5-3 5-3.5 7.5-1.5 1 .8 2 1 2.5.5s.5-1.5-.5-2.5c-1.5-1.5-3.5-1-5.5.5-1.5 1.1-3 1.5-4 1.5z"
          fill="#ffffff"
        />
        <circle cx="15.5" cy="8.5" r="1.5" fill="#ffffff" />
      </svg>
    );
  }

  // 11. Mistral AI
  if (p.includes('mistral') || m.includes('mistral') || m.includes('codestral') || m.includes('mixtral')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#f97316"
        className={className}
        aria-label="Mistral AI Logo"
      >
        <path d="M4 4h3.2v3.2H4zm12.8 0H20v3.2h-3.2zM4 10.4h9.6v3.2H4zm10.4 0H20v3.2h-5.6zM4 16.8h16V20H4z"/>
      </svg>
    );
  }

  // 12. OpenRouter
  if (p.includes('openrouter') || m.startsWith('openrouter/')) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-label="OpenRouter Logo"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2" fill="rgba(59, 130, 246, 0.25)" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    );
  }

  // Default fallback circle
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" fill="#a8a29e" />
    </svg>
  );
};
