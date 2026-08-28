# Platform Shell 사용 가이드

## 목적

`PlatformShell`은 CIVIC.AI의 모든 사용자 화면이 공유하는 mobile-first 화면 틀이다. 480px 이하의
모바일 viewport에서는 가용 너비를 모두 사용하고, 그보다 넓은 viewport에서는 최대 393px surface가
가운데 표시된다. 공통 header, content 영역, bottom navigation, safe area와 overlay 계층을 제공한다.

핵심 규칙은 다음과 같다.

> 모든 사용자 화면은 최종적으로 정확히 하나의 `PlatformShell` 안에 있어야 한다.

모든 `page.tsx`가 직접 `PlatformShell`을 렌더링해야 한다는 뜻은 아니다. 같은 구성을 공유하는
route는 `layout.tsx`에서 한 번 조립할 수 있고, 일반 화면은 앱 adapter인 `PlatformPageShell`을
사용할 수 있다. 이미 상위 layout이나 view가 shell을 제공한다면 하위 화면에서 다시 감싸지 않는다.

## 코드 경계

### 패키징 가능한 공통 영역

`apps/web/components/platform-shell/`은 다음과 같은 표현 및 layout 책임만 가진다.

- `PlatformShell`: header, content, bottom navigation, overlay 배치
- `PlatformHeader`: title, leading, actions, back control의 활성·비활성 표현
- `PlatformNavigation`: 표준 5개 도메인 anchor와 active 상태 표현
- `PlatformBottomNavigation`: bottom navigation의 시각적 배치

이 폴더에서는 Next.js router, 인증, 환경변수나 특정 도메인 코드를 import하지 않는다.

### 현재 Next.js 애플리케이션 adapter

- `apps/web/components/platform-navigation-client.tsx`: `usePathname()`을 읽어
  router-independent `PlatformNavigation`에 전달한다.
- `apps/web/components/platform-page-shell.tsx`: 일반 route가 사용할 기본 header,
  `scroll="self"` content, pathname navigation을 조립한다.

다른 저장소로 공통 코드를 옮길 때는 공통 영역과 asset을 우선 공유하고, router adapter는 각
Next.js 애플리케이션에 둔다.

## 어떤 조합을 사용할지 결정하기

| 화면 조건                                               | 권장 조합                                        |
| ------------------------------------------------------- | ------------------------------------------------ |
| 일반 목록, 홈, 설정, 404                                | `PlatformPageShell`                              |
| 여러 route가 같은 title, navigation, scroll 설정을 공유 | 가장 가까운 `layout.tsx`에서 `PlatformPageShell` |
| 채팅방, 가상화 목록, 자체 scroll viewport               | `PlatformShell scroll="child"` 직접 조립         |
| overlay, `shellRef`, `contentInert` 제어가 필요한 화면  | `PlatformShell` 직접 조립                        |
| 이미 상위에서 shell을 제공하는 하위 route               | shell을 추가하지 않고 content만 렌더링           |

## 일반 화면

```tsx
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function RagPage() {
  return (
    <PlatformPageShell title="AI">
      <RagView />
    </PlatformPageShell>
  );
}
```

기본값은 다음과 같다.

- 뒤로가기 목적지가 없으므로 회색 disabled back control을 표시한다.
- content 영역이 스크롤을 소유한다.
- 현재 pathname을 기준으로 표준 bottom navigation의 active 항목을 표시한다.

상세 화면에서 목적지가 명확하면 `backAction`을 전달한다.

```tsx
<PlatformPageShell
  backAction={{ ariaLabel: "투표 목록으로 돌아가기", href: "/vote" }}
  title="투표 상세"
>
  <VoteDetailView />
</PlatformPageShell>
```

bottom navigation을 표시하지 않을 화면은 `bottomNavigation={null}`을 전달한다.

## route layout에서 공유하기

같은 shell 설정을 공유하는 하위 route가 여러 개일 때만 가장 가까운 `layout.tsx`로 올린다.

```tsx
import type { ReactNode } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <PlatformPageShell title="계정">{children}</PlatformPageShell>;
}
```

하위 화면마다 header title, back action 또는 scroll 책임이 달라지면 완성된 shell을 layout에 두지
않는다. 각 화면에서 `PlatformPageShell`을 사용하거나 특수 화면이 `PlatformShell`을 직접 조립한다.
root layout에는 HTML, 전역 runtime과 provider만 두며 완성된 시각 shell을 고정하지 않는다.

## 스크롤 책임

### `scroll="self"`

일반 화면의 기본값이다. shell content가 스크롤을 소유하므로 자식은 문서 높이만 만들면 된다.
자식 콘텐츠가 길어져도 header와 bottom navigation은 고정된 영역에 남는다.

```tsx
<PlatformPageShell title="홈">
  <div>{/* 긴 콘텐츠 */}</div>
</PlatformPageShell>
```

### `scroll="child"`

가상화, 채팅의 읽음 경계, scroll restoration처럼 도메인이 scroll element를 직접 제어해야 할 때
사용한다. 이 경우 도메인 자식이 `height`, `min-height: 0`, `overflow`와 scroll API를 책임진다.

```tsx
<PlatformShell
  header={<PlatformHeader backAction={{ href: "/chat" }} title="채팅방" />}
  scroll="child"
>
  <section className="flex h-full min-h-0 flex-col overflow-hidden">
    <MessageViewport />
    <MessageComposer />
  </section>
</PlatformShell>
```

단순히 콘텐츠가 길다는 이유로 `child`를 선택하지 않는다. 자식 도메인이 실제 scroll element와
위치 제어를 소유할 때만 사용한다.

## header 책임

`PlatformHeader`는 시각 배치와 control 표현만 책임진다. 현재 route에서 어디로 이동할지,
브라우저 history를 사용할지, 권한에 따라 action을 노출할지는 호출자가 결정한다.

- `backAction` 없음: 회색 disabled control
- `backAction={{ href }}`: 활성 anchor
- `backAction={{ onClick }}`: 활성 button
- `actions`: 오른쪽 화면별 action
- `leading`: 기본 back control 자체를 다른 표현으로 교체할 때만 사용

## bottom navigation

표준 경로는 다음과 같다.

| 항목   | 경로      |
| ------ | --------- |
| 홈     | `/home`   |
| AI     | `/rag`    |
| 토론방 | `/chat`   |
| 투표   | `/vote`   |
| 계정   | `/mypage` |

`PlatformNavigationClient`가 현재 pathname을 전달하며, 정확한 경로 또는 그 하위 경로인 항목만
`aria-current="page"`로 표시한다. 아직 구현되지 않은 경로도 정상 anchor를 유지하며 Next.js의
404 화면으로 이동한다.

## overlay와 키보드 viewport

modal이나 bottom sheet는 `overlay` slot에 전달한다. overlay가 열릴 때 `contentInert`를 함께
설정하면 header, content와 navigation surface가 모두 비활성화된다.

채팅 composer처럼 모바일 키보드에 맞춰 실제 shell 높이를 보정해야 하면 `shellRef`를 사용한다.
일반 화면은 shell이 제공하는 `100dvh`와 safe area를 그대로 사용하고 별도의 `100dvh` wrapper를
추가하지 않는다.

데스크톱에서는 반응형 desktop layout으로 넓어지지 않고 최대 393px surface가 가운데 표시되며
12px radius와 shadow로 모바일 프레임을 구분한다. shell 높이는 피그마 프레임의 852px로 제한하지
않고 항상 실제 viewport의 `100dvh`를 사용한다. 480px 이하의 모바일 viewport에서는 최대 너비
제한과 외부 app shell padding, radius, shadow를 제거해 가용 너비를 모두 사용한다. 실제 기기의 화면
모서리와 safe area는 운영체제와 기존 safe-area padding이 담당한다. shell 내부 글자나 여백에
브라우저 전체 너비 기준의 큰 `vw` 값을 사용하지 않는다.

## App Router 특수 화면

- `/`는 표준 홈 경로 `/home`으로 이동한다.
- `not-found.tsx`는 `PlatformPageShell`을 직접 사용한다.
- `loading.tsx`, `error.tsx`도 플랫폼 화면으로 전환할 때 각각 shell 적용 여부를 명시한다.
- `notFound()`를 호출하는 route가 이미 완성된 shell 안에서 오류 UI를 렌더링하는 구조인지 확인해
  shell이 중첩되지 않게 한다.

## 새 화면 체크리스트

- 화면을 감싸는 `PlatformShell`이 정확히 하나인가?
- 일반 화면이면 `PlatformPageShell`로 충분한가?
- header title과 back action 목적지가 화면 책임과 일치하는가?
- 실제 scroll 소유자가 shell이면 `self`, 도메인 자식이면 `child`인가?
- 상세 화면에서 bottom navigation을 표시할지 명시했는가?
- shell 내부에 별도의 `100dvh` 또는 중첩 `<main>`을 만들지 않았는가?
- pathname에 맞는 bottom navigation 항목이 active 상태인가?
- 404, loading, error 같은 실패·대기 화면도 같은 플랫폼 경험을 유지하는가?
- route/layout/provider 책임이 바뀌었다면 `react-component-tree.md`를 갱신했는가?
- 완료 전에 `pnpm check`를 통과했는가?
