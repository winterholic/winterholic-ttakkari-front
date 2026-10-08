import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Ban, Bell, Check, CircleCheck, CircleX, Clock, Copy,
  Download, Ellipsis, EllipsisVertical, ExternalLink, Eye, FileArchive, FileCode, FileSpreadsheet, FileText, Folder,
  FolderOpen, FolderSearch, Globe, Hand, HardDrive, History, Image, Info, KeyRound, Lightbulb, Lock, Mail, Maximize,
  Menu, MessageSquare, Moon, MoveHorizontal, OctagonAlert, PanelRight, Paperclip, Pin, Presentation, RefreshCw,
  Search, Send, ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Square, SquarePen, Sun, Terminal, Trash2,
  TriangleAlert, WifiOff, WrapText, X, ZoomIn, ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// 디자인 시스템 docs/13 §2 의미 고정 매핑. 왼쪽 키는 예제 스프라이트 이름과 같아서 예제 마크업을 그대로 옮길 수 있다.
const ICONS = {
  chat: MessageSquare, workspace: PanelRight, library: Archive, "folder-search": FolderSearch, settings: SlidersHorizontal,
  "new-chat": SquarePen, send: ArrowUp, stop: Square, paperclip: Paperclip,
  copy: Copy, check: Check, download: Download, share: Send, mail: Mail, "external-link": ExternalLink,
  retry: RefreshCw, pin: Pin, trash: Trash2,
  search: Search, filter: SlidersHorizontal, sort: ArrowUpDown,
  "zoom-in": ZoomIn, "zoom-out": ZoomOut, fit: MoveHorizontal, expand: Maximize, wrap: WrapText, follow: ArrowDown,
  clock: Clock, hand: Hand, "circle-check": CircleCheck, "circle-x": CircleX, ban: Ban,
  shield: ShieldCheck, "shield-alert": ShieldAlert, lock: Lock, key: KeyRound, smartphone: Smartphone,
  "file-text": FileText, "file-pdf": FileText, presentation: Presentation, sheet: FileSpreadsheet, image: Image,
  "file-code": FileCode, globe: Globe, "file-archive": FileArchive,
  folder: Folder, "folder-open": FolderOpen, "hard-drive": HardDrive, terminal: Terminal,
  "wifi-off": WifiOff, history: History, eye: Eye,
  info: Info, tip: Lightbulb, important: Bell, warning: TriangleAlert, caution: OctagonAlert,
  moon: Moon, sun: Sun, menu: Menu, x: X, back: ArrowLeft, more: Ellipsis, "more-vertical": EllipsisVertical,
  "arrow-down": ArrowDown,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C className={className ? `tk-icon ${className}` : "tk-icon"} strokeWidth={1.75} aria-hidden />;
}

/** Artifact kind → 디자인 시스템 glyph data-type 과 아이콘. */
export const KIND_GLYPH: Record<string, { type: string; icon: IconName; ext?: string }> = {
  markdown: { type: "doc", icon: "file-text" },
  pdf: { type: "pdf", icon: "file-pdf" },
  docx: { type: "doc", icon: "file-text" },
  pptx: { type: "slide", icon: "presentation" },
  sheet: { type: "sheet", icon: "sheet" },
  image: { type: "image", icon: "image" },
  code: { type: "code", icon: "file-code" },
  html: { type: "code", icon: "globe" },
  other: { type: "doc", icon: "file-archive" },
};
