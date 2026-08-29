# Platform Shell 사용 가이드

## 목적

`PlatformShell`은 CIVIC.AI의 모든 사용자 화면이 공유하는 mobile-first 화면 틀이다. 480px 이하의
모바일 viewport에서는 가용 너비를 모두 사용하고, 그보다 넓은 viewport에서는 최대 393px surface가
가운데 표시된다. 공통 header, content 영역, bottom navigation, safe area와 overlay 계층을 제공한다.

핵심 규칙은 다음과 같다.

> 모든 사용자 화면은 최종적으로 정확히 하나의 `PlatformShell` 안에 있어야 한다.

모든 `page.tsx`가 직접 Shell을 렌더링해야 한다는 의미는 아니다. 일반 화면은
`PlatformPageShell`을 사용하고, 같은 구성을 공유하는 route는 가장 가까운 `layout.tsx`에서 한 번
조립할 수 있다.

## 코드 경계

`apps/web/components/platform-shell/`은 패키징 가능한 표현·layout 책임만 가진다.

- `PlatformShell`: header, content, bottom navigation, overlay 배치
- `PlatformHeader`: title, leading, actions, back control 표현
- `PlatformNavigation`: 표준 5개 플랫폼 anchor와 active 상태
- `PlatformBottomNavigation`: navigation 항목의 시각적 배치

이 폴더에서는 Next.js router, 인증, 환경변수 또는 특정 도메인 코드를 import하지 않는다.

Next.js adapter는 폴더 밖에 둔다.

- `platform-navigation-client.tsx`: `usePathname()`을 `PlatformNavigation`에 전달한다.
- `platform-page-shell.tsx`: 일반 route용 header, self scroll과 navigation을 조립한다.

## 일반 화면

```tsx
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function DomainPage() {
  return <PlatformPageShell title="화면 제목">{/* 도메인 콘텐츠 */}</PlatformPageShell>;
}
```

상세 화면에서 목적지가 명확하면 `backAction`을 전달한다.

```tsx
<PlatformPageShell
  backAction={{ ariaLabel: "목록으로 돌아가기", href: "/domain" }}
  title="상세 화면"
>
  <DomainDetailView />
</PlatformPageShell>
```

bottom navigation을 표시하지 않을 화면은 `bottomNavigation={null}`을 전달한다.

## 스크롤 책임

### `scroll="self"`

일반 화면의 기본값이다. Shell content가 스크롤을 소유하므로 자식은 문서 높이만 만든다. 콘텐츠가
길어져도 header와 bottom navigation은 고정된 영역에 남는다.

### `scroll="child"`

가상화, scroll restoration처럼 도메인이 scroll element와 위치 제어를 직접 소유할 때 사용한다.
자식은 `height`, `min-height: 0`, `overflow`와 scroll API를 책임진다.

```tsx
<PlatformShell
  header={<PlatformHeader backAction={{ href: "/domain" }} title="가상화 화면" />}
  scroll="child"
>
  <VirtualizedDomainView />
</PlatformShell>
```

단순히 콘텐츠가 길다는 이유로 `child`를 선택하지 않는다.

## Header와 navigation

`PlatformHeader`는 이동 정책을 추론하지 않는다.

- `backAction` 없음: 회색 disabled control
- `backAction={{ href }}`: 활성 anchor
- `backAction={{ onClick }}`: 활성 button
- `actions`: 오른쪽 화면별 action
- `leading`: 기본 back control을 다른 표현으로 교체

표준 navigation 경로는 다음과 같다.

| 항목   | 경로      |
| ------ | --------- |
| 홈     | `/home`   |
| AI     | `/rag`    |
| 토론방 | `/chat`   |
| 투표   | `/vote`   |
| 계정   | `/mypage` |

현재 pathname과 정확히 일치하거나 그 하위 경로인 항목만 `aria-current="page"`로 표시한다.
이관 전 실제 UI의 `/votes/**`, `/account/**` 주소는 각각 표준 `/vote`, `/mypage` 메뉴의 호환
별칭으로 취급한다. 표준 주소와 호환 주소는 같은 화면을 조회한다.

## Overlay와 viewport

modal이나 bottom sheet는 `overlay` slot에 전달한다. overlay가 열릴 때 `contentInert`를 함께
설정하면 header, content와 navigation surface가 모두 비활성화된다. 실제 Shell 높이를 도메인이
보정해야 할 때는 `shellRef`를 사용한다.

데스크톱에서는 반응형 desktop layout으로 넓어지지 않고 최대 393px surface가 가운데 표시되며
12px radius와 shadow로 모바일 프레임을 구분한다. shell 높이는 피그마 프레임의 852px로 제한하지
않고 항상 실제 viewport의 `100dvh`를 사용한다. 480px 이하의 모바일 viewport에서는 최대 너비
제한과 외부 app shell padding, radius, shadow를 제거해 가용 너비를 모두 사용한다. 실제 기기의 화면
모서리와 safe area는 운영체제와 기존 safe-area padding이 담당한다. shell 바깥 배경은 전역
`globals.css`의 `html`, `body`가 소유하며 Platform Shell stage는 투명하게 유지한다. shell 내부
글자나 여백에 브라우저 전체 너비 기준의 큰 `vw` 값을 사용하지 않는다.

## App Router 특수 화면

- `/`는 `/home`으로 이동한다.
- `not-found.tsx`, `loading.tsx`, `error.tsx`도 `PlatformPageShell`을 사용한다.
- 이미 상위 layout이 완성된 Shell을 제공하면 하위 화면에서 중첩하지 않는다.

## 새 화면 체크리스트

- 화면을 감싸는 `PlatformShell`이 정확히 하나인가?
- 일반 화면이면 `PlatformPageShell`로 충분한가?
- 실제 scroll 소유자에 맞춰 `self | child`를 선택했는가?
- header title과 back action 목적지가 화면 책임과 일치하는가?
- pathname에 맞는 navigation 항목이 active 상태인가?
- route/layout 책임이 바뀌었다면 `react-component-tree.md`를 갱신했는가?
- 완료 전에 `pnpm check`를 통과했는가?
