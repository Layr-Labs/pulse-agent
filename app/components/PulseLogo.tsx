"use client";

export default function PulseLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pulse wave pattern */}
      <g opacity="0.9">
        <path
          d="M4 16 L8 16 L10 8 L12 24 L14 4 L16 28 L18 6 L20 22 L22 10 L24 18 L28 16"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* Secondary wave - slightly offset */}
      <g opacity="0.4">
        <path
          d="M4 18 L6 18 L8 14 L10 22 L12 12 L14 20 L16 14 L18 18 L20 16 L22 20 L24 14 L26 18 L28 18"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* Central pulse dot */}
      <circle
        cx="16"
        cy="16"
        r="1.5"
        fill="white"
        opacity="1"
      />

      {/* Accent dots along the wave */}
      <g opacity="0.7">
        <circle cx="8" cy="16" r="0.8" fill="white" />
        <circle cx="24" cy="16" r="0.8" fill="white" />
      </g>

    </svg>
  );
}