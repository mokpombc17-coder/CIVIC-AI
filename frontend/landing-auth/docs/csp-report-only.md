# CSP 운영 정책

## 현재 적용 상태

Next.js `apps/web/proxy.ts`가 페이지 요청마다 nonce를 생성하고 차단형
`Content-Security-Policy`를 요청·응답 헤더에 설정한다. Root Layout은 동적 렌더링되어 Next.js가
동일 nonce를 framework script와 style에 적용한다. API route는 proxy matcher에서 제외하며, RAG PDF
응답은 `apps/web/next.config.ts`의 `frame-ancestors 'self'` 정책을 사용한다.

기본 정책은 다음 경계를 유지한다.

- script는 현재 origin과 요청별 nonce만 실행한다.
- inline script와 production의 `unsafe-eval`은 허용하지 않는다.
- React가 사용하는 inline style 속성만 `style-src-attr`로 허용한다.
- image, font, frame, media, worker는 현재 애플리케이션이 실제 사용하는 self·blob·data 범위만 허용한다.
- object embedding, 외부 framing, 외부 form 전송을 차단한다.
- production 응답은 insecure resource를 HTTPS로 승격한다.

개발 모드에서만 Next.js HMR을 위해 `unsafe-eval`, `ws:`, `wss:`를 추가한다. production 정책에는
포함되지 않는다.

## Edge 정책

HTTPS edge는 TLS 응답에 다음 HSTS를 항상 추가한다.

```text
Strict-Transport-Security: max-age=31536000
```

`includeSubDomains`와 `preload`는 사용하지 않는다. Next.js 3000 포트는 loopback으로만 연결하고 외부에는
HTTPS Nginx endpoint만 공개한다.

## 변경 절차

외부 분석 도구, CDN, WebSocket 또는 frame origin이 실제로 추가될 때만 해당 directive에 정확한 origin을
추가한다. wildcard scheme·host와 production `unsafe-inline` script는 사용하지 않는다. 변경 후에는
production build, 브라우저 핵심 흐름, 모바일 WebView, PDF 미리보기·다운로드를 함께 확인한다.

## 참고

- [Next.js Content Security Policy 가이드](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js headers 설정](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
