## Redux 규칙

- Redux Toolkit과 React Redux만 사용한다.
- `createStore`를 사용하지 않는다.
- Store는 `configureStore`로 생성한다.
- 상태는 기능 단위 `createSlice`로 정의한다.
- 상태 변경은 export된 action dispatch를 통해서만 수행한다.
- 컴포넌트에서 `store.getState()`와 `store.dispatch()`를 직접 호출하지 않는다.
- 컴포넌트에서는 typed `useAppDispatch`, `useAppSelector`만 사용한다.
- selector는 slice 파일 또는 별도 selectors 파일에 정의한다.
- Redux state와 action payload는 직렬화 가능해야 한다.
- WebSocket, STOMP Client, Promise, Timer, AbortController를 Store에 저장하지 않는다.
- reducer에서 네트워크 요청, 시간 조회, UUID 생성 등의 side effect를 수행하지 않는다.
- 서버 데이터의 Source of Truth를 Redux slice와 Query cache에 중복 저장하지 않는다.
- 로컬 컴포넌트 상태는 Redux로 이동하지 않는다.
- action 이름은 setter가 아니라 발생한 사건을 표현한다.