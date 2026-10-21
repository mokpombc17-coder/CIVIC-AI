import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRoomParticipantProfile } from "./chat-room-participant-profile";

describe("ChatRoomParticipantProfile", () => {
  it("이미지가 없으면 익명 기본 아바타와 Backend 표시 이름을 렌더링한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomParticipantProfile
        displayName="참여자 2"
        imageUrl={null}
        isSelf={false}
        role="MEMBER"
      />,
    );

    expect(markup).toContain('data-avatar-fallback="anonymous"');
    expect(markup).toContain("참여자 2 기본 프로필 이미지");
    expect(markup).toContain("참여자 2");
    expect(markup).not.toContain("<img");
  });

  it("본인과 방장 표시는 Backend 이름을 대체하지 않고 badge로 추가한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomParticipantProfile displayName="참여자 1" imageUrl={null} isSelf role="OWNER" />,
    );

    expect(markup).toContain("참여자 1");
    expect(markup).toContain(">나<");
    expect(markup).toContain(">방장<");
  });

  it("프로필 이미지 URL이 있으면 장식 이미지로 렌더링한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomParticipantProfile
        displayName="참여자 3"
        imageUrl="https://example.com/participant-3.png"
        isSelf={false}
        role="MEMBER"
      />,
    );

    expect(markup).toContain('<img alt=""');
    expect(markup).toContain('src="https://example.com/participant-3.png"');
    expect(markup).not.toContain('data-avatar-fallback="anonymous"');
  });

  it("보조 metadata를 이름 아래에 렌더링한다", () => {
    const markup = renderToStaticMarkup(
      <ChatRoomParticipantProfile
        displayName="참여자 2"
        imageUrl={null}
        isSelf={false}
        metadata={<span>참여 중 · version 1</span>}
        role="MEMBER"
      />,
    );

    expect(markup).toContain("참여 중 · version 1");
  });

  it("긴 표시 이름은 참여자 행의 폭을 늘리지 않고 한 줄로 줄인다", () => {
    const displayName = "매우긴참여자이름이계속이어져도시트너비를넘기지않는사용자";
    const markup = renderToStaticMarkup(
      <ChatRoomParticipantProfile
        displayName={displayName}
        imageUrl={null}
        isSelf={false}
        role="MEMBER"
      />,
    );

    expect(markup).toContain("max-w-full flex-1");
    expect(markup).toContain("min-w-0 flex-1 truncate");
    expect(markup).toContain(`title="${displayName}"`);
  });
});
