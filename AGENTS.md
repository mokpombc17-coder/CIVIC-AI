## Repository rules

- 패키지 설치와 workspace 명령은 pnpm을 사용한다.
- 웹 제품 UI의 라우팅과 화면 구성은 Next.js가 소유한다.
- Expo 애플리케이션은 WebView와 모바일 운영체제 기능을 연결하는 얇은 네이티브 셸로 유지한다.
- 일반 HTTP 및 WebSocket 통신은 WebView 내부의 웹 애플리케이션에서 처리한다.
- 웹과 네이티브가 공유하는 bridge message contract는 `packages/bridge`에 정의한다.
- bridge contract를 변경할 때는 웹 송신 코드, 모바일 수신 코드 및 bridge 테스트를 함께 확인한다.
- 작업 완료 전 `pnpm check`를 실행한다.

## CodeGraph usage

구조 파악, 호출 흐름 추적, 변경 영향도 분석 또는 관련 테스트 탐색이 필요한 작업에서는 CodeGraph를 우선 사용한다.

1. MCP의 `codegraph_explore`가 사용 가능하면 관련 symbol, 호출 경로 및 blast radius를 먼저 확인한다.
2. MCP를 사용할 수 없지만 로컬 CLI가 사용 가능하면 `pnpm codegraph explore "<작업 설명>"`을 사용한다.
3. CodeGraph가 반환한 source는 현재 디스크에서 읽은 코드로 간주하며, 동일한 범위를 불필요하게 다시 읽지 않는다.
4. 출력이 잘렸거나 편집에 필요한 문맥이 누락된 경우에만 해당 파일의 추가 범위를 읽는다.
5. CodeGraph 결과에 없는 관계를 존재한다고 가정하지 않는다.
6. CodeGraph가 초기화되지 않았거나 사용할 수 없으면 일반적인 repository search로 작업을 계속한다.