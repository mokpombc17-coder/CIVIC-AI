import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");

const placeholderModules = [
  "components/screens/coming-soon-screen.tsx",
  "app/(participant)/[feature]/[[...screen]]/page.tsx",
  "app/(admin)/admin/[feature]/[[...screen]]/page.tsx",
];

const forbiddenFragments = [
  "@/lib/chat/",
  "@/components/chat-",
  "@stomp/stompjs",
  "WebSocket",
  "EventSource",
  "XMLHttpRequest",
  "fetch(",
  "<form",
  "<button",
];

describe("deferred placeholder static boundary", () => {
  it("placeholder module과 route는 feature client·transport·mutation UI를 import하지 않는다", async () => {
    for (const relativePath of placeholderModules) {
      const source = await readFile(path.join(webRoot, relativePath), "utf8");
      for (const forbidden of forbiddenFragments) {
        expect(source, `${relativePath}: ${forbidden}`).not.toContain(forbidden);
      }
      expect(source).not.toContain('"use client"');
    }
  });

  it("canonical Chat route가 기존 realtime provider를 mount하지 않는다", async () => {
    await expect(readFile(path.join(webRoot, "app/chat/layout.tsx"), "utf8")).rejects.toMatchObject(
      {
        code: "ENOENT",
      },
    );
    await expect(readFile(path.join(webRoot, "app/chat/page.tsx"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(path.join(webRoot, "app/chat/[roomId]/page.tsx"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("인증 공용 화면의 관리자 shell은 실제 세션 역할을 전달한다", async () => {
    const source = await readFile(
      path.join(webRoot, "app/(participant)/[feature]/[[...screen]]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("permissions={session.permissions}");
    expect(source).toContain("role={session.role}");
    expect(source).toContain("const session = await requireParticipantSession(pathname);");
    expect(source).not.toContain("loadShellSession");
  });
});
