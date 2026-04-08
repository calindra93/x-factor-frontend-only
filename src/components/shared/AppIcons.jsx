import React from "react";

export function SoundburstIcon({ className = "w-5 h-5", active = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Sound wave burst — three bars radiating from center with a spark */}
      <rect x="4" y="8" width="2.5" height="8" rx="1.25" fill={active ? "#60a5fa" : "currentColor"} opacity={active ? 1 : 0.5} />
      <rect x="8.5" y="5" width="2.5" height="14" rx="1.25" fill={active ? "#818cf8" : "currentColor"} opacity={active ? 1 : 0.6} />
      <rect x="13" y="3" width="2.5" height="18" rx="1.25" fill={active ? "#a78bfa" : "currentColor"} opacity={active ? 1 : 0.7} />
      <rect x="17.5" y="7" width="2.5" height="10" rx="1.25" fill={active ? "#c084fc" : "currentColor"} opacity={active ? 1 : 0.5} />
      {active && <circle cx="19" cy="5" r="1.5" fill="#f472b6" />}
    </svg>
  );
}

export function StreamifyIcon({ className = "w-5 h-5", active = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Flowing stream / infinity wave */}
      <path
        d="M3 12c2-3 4-5 6-5s4 4 6 4 4-4 6-4"
        stroke={active ? "#8b5cf6" : "currentColor"}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={active ? 1 : 0.5}
      />
      <path
        d="M3 16c2-3 4-5 6-5s4 4 6 4 4-4 6-4"
        stroke={active ? "#a78bfa" : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={active ? 0.6 : 0.3}
      />
      {active && <circle cx="12" cy="6" r="2" fill="#c084fc" opacity="0.8" />}
    </svg>
  );
}

export function AppleCoreIcon({ className = "w-5 h-5", active = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Stylized apple core / music note hybrid */}
      <path
        d="M12 3c-1.5 0-3 .5-3 2s1 2 3 2c1.5 0 2-.5 2-1.5"
        stroke={active ? "#fb7185" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={active ? 0.8 : 0.4}
      />
      <path
        d="M12 7c-4 0-7 3-7 7 0 3.5 2.5 7 7 7s7-3.5 7-7c0-4-3-7-7-7z"
        fill={active ? "#fb7185" : "currentColor"}
        opacity={active ? 0.15 : 0.08}
      />
      <path
        d="M12 7c-4 0-7 3-7 7 0 3.5 2.5 7 7 7s7-3.5 7-7c0-4-3-7-7-7z"
        stroke={active ? "#fb7185" : "currentColor"}
        strokeWidth="1.5"
        opacity={active ? 1 : 0.5}
      />
      {/* Core / seed */}
      <ellipse cx="12" cy="14" rx="2" ry="3" fill={active ? "#fb7185" : "currentColor"} opacity={active ? 0.6 : 0.3} />
      {active && <circle cx="12" cy="14" r="1" fill="#fda4af" />}
    </svg>
  );
}
