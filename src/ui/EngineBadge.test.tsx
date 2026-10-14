import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountBadge, EngineBadge } from "./EngineBadge";

describe("engine and account badges", () => {
  it("labels Claude and Codex with distinct text and accessible icons", () => {
    const { rerender } = render(<EngineBadge engine="claude" />);
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByLabelText("Claude 엔진")).toBeTruthy();

    rerender(<EngineBadge engine="codex" />);
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByLabelText("Codex 엔진")).toBeTruthy();
  });

  it("uses a compact account label while keeping the full name in its title", () => {
    render(<AccountBadge account="Daddy codex account@example.com" />);
    const badge = screen.getByLabelText("계정 Daddy codex account@example.com");
    expect(badge.querySelector(".account-badge__name")?.textContent).toBe("Daddy codex");
    expect(badge.getAttribute("title")).toBe("Daddy codex account@example.com");
  });
});
