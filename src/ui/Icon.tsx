import {
  BookOpen, Briefcase, CalendarDays, Camera, ChevronDown, ChevronLeft, NotebookPen, Tag, GripVertical, Gauge, ChevronRight, ChevronUp, Plus, Archive, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Ban, Bell, Check, CircleCheck, CircleX, Clock, Copy,
  Download, Ellipsis, EllipsisVertical, ExternalLink, Eye, FileArchive, FileCode, FileSpreadsheet, FileText, Folder,
  FolderOpen, FolderSearch, Globe, Hand, HardDrive, History, Image, Info, KeyRound, Lightbulb, LibraryBig, Lock, LogOut, Mail, Maximize,
  Menu, MessageSquare, Mic, Moon, MoveHorizontal, OctagonAlert, Palette, PanelRight, Paperclip, Pause, Pin, Play, Volume2, Presentation, RefreshCw,
  Search, Send, Server, ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Square, SquarePen, Sun, Terminal, Trash2,
  TriangleAlert, WifiOff, WrapText, X, ZoomIn, ZoomOut, Keyboard, Gamepad2, MousePointer2, Pointer, Film, LayoutTemplate, Music, PenTool, Ruler, Sparkles, ChartGantt, ChartCandlestick, Building2, CircleDot, Code, FileDiff, GitBranch, GitFork, GitMerge, GitPullRequest, GitPullRequestDraft, Star, User, CornerDownRight, Flag, IndentDecrease, IndentIncrease, ListTree, SquareKanban, Users, Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// 디자인 시스템 docs/13 §2 의미 고정 매핑. 왼쪽 키는 예제 스프라이트 이름과 같아서 예제 마크업을 그대로 옮길 수 있다.
const ICONS = {
  chat: MessageSquare, workspace: PanelRight, library: Archive, "context-library": LibraryBig, "folder-search": FolderSearch, settings: SlidersHorizontal,
  "new-chat": SquarePen, send: ArrowUp, stop: Square, paperclip: Paperclip,
  copy: Copy, check: Check, download: Download, share: Send, mail: Mail, "external-link": ExternalLink,
  retry: RefreshCw, pin: Pin, trash: Trash2,
  search: Search, filter: SlidersHorizontal, sort: ArrowUpDown,
  "zoom-in": ZoomIn, "zoom-out": ZoomOut, fit: MoveHorizontal, expand: Maximize, wrap: WrapText, follow: ArrowDown,
  clock: Clock, hand: Hand, "circle-check": CircleCheck, "circle-x": CircleX, ban: Ban,
  shield: ShieldCheck, "shield-alert": ShieldAlert, lock: Lock, key: KeyRound, smartphone: Smartphone, camera: Camera,
  "file-text": FileText, "file-pdf": FileText, presentation: Presentation, sheet: FileSpreadsheet, image: Image,
  "file-code": FileCode, globe: Globe, "file-archive": FileArchive,
  folder: Folder, "folder-open": FolderOpen, "hard-drive": HardDrive, terminal: Terminal,
  "wifi-off": WifiOff, history: History, eye: Eye,
  info: Info, tip: Lightbulb, important: Bell, warning: TriangleAlert, caution: OctagonAlert,
  moon: Moon, sun: Sun, menu: Menu, x: X, back: ArrowLeft, more: Ellipsis, "more-vertical": EllipsisVertical,
  "arrow-down": ArrowDown,
  "chevron-up": ChevronUp, "chevron-down": ChevronDown, "chevron-right": ChevronRight, "chevron-left": ChevronLeft,
  calendar: CalendarDays, mic: Mic, memo: NotebookPen, tag: Tag, briefcase: Briefcase, grip: GripVertical, gauge: Gauge, server: Server, plus: Plus, logout: LogOut,
  child: CornerDownRight, kanban: SquareKanban, wbs: ListTree, gantt: ChartGantt, chart: ChartCandlestick, flag: Flag, indent: IndentIncrease, outdent: IndentDecrease, users: Users,
  // 따까리에게 맡긴 일의 트리(작업 화면)
  tasks: Workflow,
  // GitHub 탐색: lucide 1.x 에는 브랜드 아이콘이 없어 일반 아이콘으로 대신한다
  "git-branch": GitBranch, "git-pull-request": GitPullRequest, "git-merge": GitMerge, "git-pr-draft": GitPullRequestDraft, "git-fork": GitFork,
  issue: CircleDot, star: Star, code: Code, diff: FileDiff, user: User, org: Building2,
  // NotebookLM 플랫폼
  notebook: BookOpen,
  // ArtCraft 관제
  palette: Palette, play: Play, pause: Pause, volume: Volume2,
  // 원격 데스크톱 조작 도구
  keyboard: Keyboard, gamepad: Gamepad2, "mouse-pointer": MousePointer2, pointer: Pointer,
  // ArtCraft 작업 범주
  film: Film, layout: LayoutTemplate, music: Music, "pen-tool": PenTool, ruler: Ruler, sparkles: Sparkles,
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
  video: { type: "image", icon: "film" },
  audio: { type: "slide", icon: "music" },
  code: { type: "code", icon: "file-code" },
  html: { type: "code", icon: "globe" },
  other: { type: "doc", icon: "file-archive" },
};
