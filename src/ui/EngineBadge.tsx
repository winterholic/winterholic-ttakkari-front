import "./engineBadge.css";

export type EngineName = "claude" | "codex" | "auto" | string;

const LABELS: Record<string, string> = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", muse: "Muse Code", opencode: "OpenCode", auto: "자동" };

export function EngineBadge({ engine }: { engine: EngineName }) {
  const key = engine.toLowerCase();
  const label = LABELS[key] ?? engine;
  return (
    <span className="engine-badge" data-engine={key} aria-label={`${label} 엔진`}>
      <span className="engine-badge__mark" aria-hidden="true">{key === "claude" ? "✳" : key === "codex" ? "⌘" : key === "antigravity" ? "◈" : key === "muse" ? "M" : key === "opencode" ? "⎔" : "↗"}</span>
      <span>{label}</span>
    </span>
  );
}

function compactAccount(account: string): string {
  const name = account.trim();
  const words = name.split(/\s+/);
  return words.length > 2 ? words.slice(0, 2).join(" ") : name;
}

export function AccountBadge({ account }: { account: string }) {
  const name = account.trim();
  return (
    <span className="account-badge" title={name} aria-label={`계정 ${name}`}>
      <span className="account-badge__mark" aria-hidden="true">계정</span>
      <span className="account-badge__name">{compactAccount(name)}</span>
    </span>
  );
}
