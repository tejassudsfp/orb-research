/** Icons from the prototype (design/screens/*.html), 24-unit viewBox, stroke = currentColor unless noted. */
import type { ReactNode } from 'react';

type IconProps = { size?: number; strokeWidth?: number };

function Svg({ size = 18, strokeWidth = 1.8, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** P6.1b: the Constellation mark lives in src/brand/ (re-exported here for the screens that import icons). */
export { OrbMark } from '../brand/OrbMark.js';

export const SelectIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3l7 18 2.5-7.5L21 11z" />
  </Svg>
);
export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h14v12l-6 6H5z" />
    <path d="M13 21v-6h6" />
  </Svg>
);
export const FrameIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
  </Svg>
);
export const ConnectIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="5" r="2" />
    <path d="M6.5 17.5C10 14 14 10 17.5 6.5" />
  </Svg>
);
export const AddCardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <path d="M17.5 14v7M14 17.5h7" />
  </Svg>
);
export const PublishIcon = (p: IconProps) => (
  <Svg size={16} strokeWidth={2} {...p}>
    <path d="M12 3v12M7 8l5-5 5 5M5 21h14" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const ComposeIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h5" />
  </Svg>
);
/** P6.1: attach a file to the message (the composer's paperclip). */
export const PaperclipIcon = (p: IconProps) => (
  <Svg size={17} {...p}>
    <path d="M20 11.5l-7.6 7.6a5 5 0 01-7.1-7.1l8.1-8.1a3.4 3.4 0 014.8 4.8l-8.1 8.1a1.7 1.7 0 01-2.4-2.4l7.4-7.4" />
  </Svg>
);
export const SendIcon = (p: IconProps) => (
  <Svg size={16} strokeWidth={2} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const StopIcon = (p: IconProps) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
  </svg>
);
export const ChatIcon = (p: IconProps) => (
  <Svg size={16} {...p}>
    <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
  </Svg>
);
export const SunIcon = (p: IconProps) => (
  <Svg strokeWidth={1.6} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const MoonIcon = (p: IconProps) => (
  <Svg strokeWidth={1.6} {...p}>
    <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
  </Svg>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Svg size={20} strokeWidth={2} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const BackIcon = (p: IconProps) => (
  <Svg size={16} strokeWidth={2} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg size={16} strokeWidth={2} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);
export const ChevronUpIcon = (p: IconProps) => (
  <Svg size={16} strokeWidth={2} {...p}>
    <path d="M6 15l6-6 6 6" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg size={16} strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const FitIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={2} {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Svg>
);
export const FocusIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={2} {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </Svg>
);
/** P3.6: the header menu (Pause all, Stop all). */
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Svg>
);
export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6v12M15 6v12" />
  </Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5l11 7-11 7z" />
  </Svg>
);
/** The prototype's thread button bubble. */
export const ThreadIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
  </Svg>
);

/** Four rounded squares (the Port page's way back to the board, design/screens/port.html). */
export const BoardIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </Svg>
);
