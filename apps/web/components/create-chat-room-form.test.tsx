import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CreateChatRoomFormView,
  type CreateChatRoomFormMode,
} from "@/components/create-chat-room-form";

describe("create chat room request bottom sheet", () => {
  it("생성 요청 화면에는 제목과 상세 설명만 피그마 규격으로 표시한다", () => {
    const html = renderSheet("form");

    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-create-chat-room-sheet="form"');
    expect(html).toContain("토론방 생성 요청");
    expect(html).toContain(">제목</label>");
    expect(html).toContain('name="name"');
    expect(html).toContain('maxLength="100"');
    expect(html).toContain(">상세 설명</label>");
    expect(html).toContain('name="description"');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain(">요청하기</button>");
    expect(html).not.toContain(">주제</label>");
    expect(html).not.toContain("공개 범위");
    expect(html).not.toContain("참여 정책");
  });

  it("접수 완료 화면에는 검토 상태와 두 후속 action을 표시한다", () => {
    const html = renderSheet("received");

    expect(html).toContain('data-create-chat-room-sheet="received"');
    expect(html).toContain("토론방 생성 요청을");
    expect(html).toContain("접수했습니다");
    expect(html).toContain("검토 대기");
    expect(html).toContain("검토가 끝나면 가입하신 이메일로 알려드립니다.");
    expect(html).toContain("생성이 완료되면 토론방 목록에서 확인할 수 있습니다.");
    expect(html).toContain("info.png");
    expect(html).toContain(">토론방 목록으로</button>");
    expect(html).toContain(">새 요청 작성</button>");
  });
});

function renderSheet(mode: CreateChatRoomFormMode): string {
  return renderToStaticMarkup(
    createElement(CreateChatRoomFormView, {
      canRetry: false,
      canSubmit: true,
      errorMessage: null,
      isPending: false,
      mode,
      onCancel: vi.fn(),
      onFormChange: vi.fn(),
      onRequestAgain: vi.fn(),
      onRequestSubmit: vi.fn(),
      onRetry: vi.fn(),
      validationError: null,
    }),
  );
}
