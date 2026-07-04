import type { CSSProperties, SVGProps } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle,
  ChevronUp,
  Container,
  File,
  Folder,
  Globe,
  LayoutGrid,
  Maximize,
  Menu,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const logoDefaults = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  style: { display: "block", flexShrink: 0 } as CSSProperties,
});

export const Icons = {
  Plus,
  Minus,
  Trash: Trash2,
  Refresh: RefreshCw,
  CheckCircle,
  FitView: Maximize,
  Grid: LayoutGrid,
  X,
  Menu,
  Scan: Search,
  Check,
  Server,
  ArrowRight,
  Docker: Container,
  Terminal,
  Stop: Square,
  Play,
  Globe,
  Folder,
  File,
  ChevronUp,
  // The logo is the app's own brand mark — kept as a custom SVG.
  Logo: ({ size = 24, ...props }: IconProps) => (
    <svg {...logoDefaults(size)} {...props}>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <path d="M8 3v18" />
      <path d="M16 8h2" />
      <path d="M16 12h2" />
      <path d="M16 16h2" />
    </svg>
  ),
};
