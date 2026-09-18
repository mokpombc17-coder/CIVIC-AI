# Platform shell components

Figma의 참여자 모바일 화면 규격을 코드로 옮긴 공통 레이아웃 컴포넌트다.

화면별 선택 기준과 Next.js route 연결 예시는
[`docs/architecture/platform-shell-usage.md`](../../../../docs/architecture/platform-shell-usage.md)를
참고한다.

- 기준 surface: `393 × 852`
- header: 기본 `69px` + top safe-area
- header의 Figma back icon은 기본적으로 회색 disabled 상태이며, 화면이 `backAction.href` 또는 `backAction.onClick`을 제공하면 검정색 link/button으로 활성화된다.
- bottom navigation: 기본 `64px` + bottom safe-area
- 일반 화면은 기본값인 `scroll="self"`로 공통 content 영역이 스크롤한다.
- 채팅·가상화 화면은 `scroll="child"`로 도메인 자식이 스크롤을 소유한다.
- bottom navigation은 route를 추론하지 않는다. 호출자가 anchor와 `aria-current="page"`를 제공한다.
- `PlatformNavigation`은 표준 `/home`, `/rag`, `/chat`, `/vote`, `/mypage` anchor와 Figma export icon을 조립하고, 호출자가 전달한 `currentPathname`으로 active 항목을 표시한다.
- Next.js route와 연결하는 앱 레벨 adapter는 상위 `platform-navigation-client.tsx`, 일반 route의 기본 조합은 상위 `platform-page-shell.tsx`에 둔다.
- 모바일 키보드에 따른 viewport 보정은 내부 `PlatformShellVisualViewportBoundary`가 소유한다. shell 안의 편집 가능한 요소에 포커스가 있고 visual viewport가 80px 이상 줄었을 때만 shell 높이와 상단 offset을 보정하고 bottom navigation slot을 숨긴다. 도메인 화면은 실제 shell element에 직접 접근하지 않는다.
- modal은 `overlay` slot에 전달하고 `contentInert`로 header·content·navigation surface를 함께 비활성화한다.

이 폴더는 이후 패키지로 옮길 수 있도록 도메인 코드, Next.js router, 인증 및 환경변수를 import하지 않는다. 패키지로 추출할 때는 `public/assets/platform-navigation`과 `public/assets/platform-shell`의 Figma export도 함께 옮긴다.
