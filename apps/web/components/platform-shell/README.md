# Platform shell components

Figma의 참여자 모바일 화면 규격을 코드로 옮긴 공통 레이아웃 컴포넌트다.

- 기준 surface: `393 × 852`
- header: 기본 `69px` + top safe-area
- bottom navigation: 기본 `64px` + bottom safe-area
- 일반 화면은 기본값인 `scroll="self"`로 공통 content 영역이 스크롤한다.
- 채팅·가상화 화면은 `scroll="child"`로 도메인 자식이 스크롤을 소유한다.
- bottom navigation은 route를 추론하지 않는다. 호출자가 anchor와 `aria-current="page"`를 제공한다.

이 폴더는 이후 패키지로 옮길 수 있도록 도메인 코드, Next.js router, 인증 및 환경변수를 import하지 않는다.
