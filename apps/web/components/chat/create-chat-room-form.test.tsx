import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CreateChatRoomFormView,
  type CreateChatRoomFormMode,
} from "@/components/chat/create-chat-room-form";

describe("create chat room request bottom sheet", () => {
  it("생성 요청 화면에는 제목과 상세 설명만 피그마 규격으로 표시한다", () => {
    const html = renderSheet("form");

    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-create-chat-room-sheet="form"');
    expect(html).toContain('data-create-chat-room-view="request"');
    expect(html).toContain("h-[540px]");
    expect(html).not.toContain("h-[524px]");
    expect(html).not.toContain("max-h-[680px]");
    expect(html).toContain("토론방 생성");
    expect(html).toContain('aria-label="토론방 생성 화면"');
    expect(html).toContain(">요청</button>");
    expect(html).toContain(">내역</button>");
    expect(html).toContain(">제목</label>");
    expect(html).toContain('name="name"');
    expect(html).toContain('maxLength="100"');
    expect(html).toContain('id="create-room-name-help">1~100자</span>');
    expect(html).toContain(">상세 설명</label>");
    expect(html).toContain('name="description"');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('id="create-room-description-help">1~500자</span>');
    expect(html).toContain(">요청하기</button>");
    expect(html).not.toContain(">주제</label>");
    expect(html).not.toContain("공개 범위");
    expect(html).not.toContain("참여 정책");
  });

  it("접수 완료 화면에는 알림 안내 없이 요청 내역 전환 action을 표시한다", () => {
    const html = renderSheet("received");

    expect(html).toContain('data-create-chat-room-sheet="received"');
    expect(html).toContain("검토 대기");
    expect(html).toContain("요청 내역에서 처리 상태를 확인할 수 있습니다.");
    expect(html).not.toContain("이메일로 알려드립니다");
    expect(html).not.toContain("실시간 알림");
    expect(html).toContain("info.png");
    expect(html).toContain('data-chat-form-feedback="success"');
    expect(html).toContain('role="status"');
    expect(html).toContain(">요청 내역 보기</button>");
    expect(html).toContain(">새 요청 작성</button>");
  });

  it("목록 버튼을 선택하면 요청 폼 대신 같은 bottom sheet에서 요청 내역을 표시한다", () => {
    const html = renderSheet("form", { activeView: "history" });

    expect(html).toContain('data-create-chat-room-view="history"');
    expect(html).toContain('data-create-chat-room-panel="request" hidden=""');
    expect(html).toContain('aria-label="토론방 생성 내역"');
    expect(html).toContain('data-create-chat-room-list-surface="true"');
    expect(html).toContain("min-h-[368px]");
    expect(html).toContain("h-[540px]");
    expect(html).toContain("아직 요청 내역이 없어요.");
    expect(html).not.toContain(">요청 내역</h3>");
    expect(html).not.toContain("<hr");
  });

  it("validation과 재시도 가능한 요청 오류를 동일한 주의 피드백으로 표시한다", () => {
    const validationHtml = renderSheet("form", {
      validationError: "제목을 입력해 주세요.",
    });
    const requestErrorHtml = renderSheet("form", {
      canRetry: true,
      errorMessage: "요청 결과를 확인하지 못했습니다.",
    });

    expect(validationHtml).toContain('data-chat-form-feedback="validation-error"');
    expect(validationHtml).toContain('role="alert"');
    expect(validationHtml).toContain("bg-[#fff7e8]");
    expect(requestErrorHtml).toContain('data-chat-form-feedback="request-error"');
    expect(requestErrorHtml).toContain("같은 요청으로 다시 시도");
    expect(requestErrorHtml).not.toContain("bg-red-50");
    expect(requestErrorHtml.indexOf('data-chat-form-feedback="request-error"')).toBeLessThan(
      requestErrorHtml.indexOf('name="name"'),
    );
  });
});

function renderSheet(
  mode: CreateChatRoomFormMode,
  overrides: Partial<Parameters<typeof CreateChatRoomFormView>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(CreateChatRoomFormView, {
      activeView: "request",
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
      onViewChange: vi.fn(),
      requestList: {
        errorMessage: null,
        hasNextPage: false,
        isError: false,
        isFetchingNextPage: false,
        isPending: false,
        loadMore: vi.fn(),
        requests: [],
        retry: vi.fn(),
      },
      validationError: null,
      ...overrides,
    }),
  );
}
