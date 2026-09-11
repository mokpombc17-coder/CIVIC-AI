import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PwaInstallGuideDialog } from "./pwa-install-guide-dialog";

describe("PwaInstallGuideDialog", () => {
  it("renders the complete iOS home-screen installation guide as a modal dialog", () => {
    const html = renderToStaticMarkup(<PwaInstallGuideDialog onClose={vi.fn()} open />);

    expect(html).toContain("<dialog");
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("iOS 앱 설치 방법");
    expect(html).toContain("<strong>공유</strong> 메뉴");
    expect(html).not.toContain("한 번만 설정하면");
    expect(html).toContain("홈 화면에 추가");
    expect(html).toContain("웹 앱으로 열기");
    expect(html).toContain(">닫기</button>");
    expect(html).not.toContain("Safari");
    expect(html).not.toContain("공유 아이콘");
  });

  it("stays unmounted while closed", () => {
    expect(renderToStaticMarkup(<PwaInstallGuideDialog onClose={vi.fn()} open={false} />)).toBe("");
  });

  it("uses a full-width bottom sheet on mobile viewports", () => {
    const cssPath = path.join(import.meta.dirname, "pwa-install-guide-dialog.module.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toMatch(/inset:\s*auto 0 0/);
    expect(css).toContain("width: 100%");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});
