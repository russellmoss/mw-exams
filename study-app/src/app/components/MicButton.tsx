"use client";

interface MicButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onClick: () => void;
}

export function MicButton({ isListening, isSupported, onClick }: MicButtonProps) {
  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
        isListening
          ? "bg-fail/20 text-fail border border-fail/40 animate-pulse"
          : "bg-card hover:bg-card-hover text-muted hover:text-foreground border border-border"
      }`}
      title={isListening ? "Stop recording" : "Start voice input"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isListening ? (
          <>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </>
        ) : (
          <>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </>
        )}
      </svg>
    </button>
  );
}
