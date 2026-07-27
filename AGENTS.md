## CodeGraph usage

구조 파악, 호출 흐름 추적, 변경 영향도 분석, 관련 테스트 탐색이 필요한 작업에서는 광범위한 파일 검색 전에 CodeGraph를 사용한다.

1. `codegraph_explore`로 관련 symbol과 호출 경로를 찾는다.
2. 대상 symbol의 caller, callee, implementation, 관련 테스트를 확인한다.
3. CodeGraph 결과는 열람 범위를 선정하는 근거로 사용한다.
4. 코드를 변경하기 전에는 반환된 현재 소스와 실제 파일 내용을 확인한다.
5. CodeGraph 결과에 없는 관계를 존재한다고 가정하지 않는다.