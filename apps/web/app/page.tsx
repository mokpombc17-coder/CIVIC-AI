export default function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero">
        <p className="eyebrow">One web application, two containers</p>
        <h1>Next.js가 화면과 BFF를 소유하고, Expo는 얇은 네이티브 셸을 담당한다.</h1>
        <p>
          브라우저와 WebView는 같은 URL, 같은 HttpOnly 세션, 같은 Server/Client Component를
          사용한다. 네이티브 코드는 운영체제 경계에서만 개입한다.
        </p>
      </section>
    </div>
  );
}
