import type { SVGProps, CSSProperties } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const defaults = (size: number, strokeWidth: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  style: { display: "block", flexShrink: 0 } as CSSProperties,
});

export const Icons = {
  Plus: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.5)} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Minus: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.5)} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.5)} {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  Refresh: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.2)} {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  CheckCircle: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.2)} {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  FitView: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.2)} {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  X: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.5)} {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Scan: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.8)} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Check: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.5)} {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Server: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 1.5)} {...props}>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <path d="M8 3v18" />
      <path d="M16 8h2" />
      <path d="M16 12h2" />
      <path d="M16 16h2" />
    </svg>
  ),
  ArrowRight: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.2)} {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  ),
  Docker: ({ size = 16, ...props }: IconProps) => (
    <svg {...defaults(size, 1.8)} {...props}>
      <path d="M12 3 L21 7.5 L12 12 L3 7.5 Z" />
      <path d="M3 7.5 L3 16.5 L12 21 L12 12 Z" />
      <path d="M21 7.5 L21 16.5 L12 21 L12 12 Z" />
    </svg>
  ),
  Terminal: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2)} {...props}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  Stop: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2)} fill="currentColor" stroke="none" {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  ),
  Play: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2)} fill="currentColor" stroke="none" {...props}>
      <polygon points="6,3 20,12 6,21" />
    </svg>
  ),
  Globe: ({ size = 16, ...props }: IconProps) => (
    <svg {...defaults(size, 1.8)} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  ),
  Folder: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2)} {...props}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  File: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  ChevronUp: ({ size = 14, ...props }: IconProps) => (
    <svg {...defaults(size, 2.5)} {...props}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  Logo: ({ size = 24, ...props }: IconProps) => (
    <svg {...defaults(size, 2)} {...props}>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <path d="M8 3v18" />
      <path d="M16 8h2" />
      <path d="M16 12h2" />
      <path d="M16 16h2" />
    </svg>
  ),
};
