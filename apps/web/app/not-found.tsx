import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel">
      <p className="eyebrow">404</p>
      <h1>경로를 찾을 수 없습니다.</h1>
      <Link className="primary-button link-button" href="/">
        홈으로 이동
      </Link>
    </section>
  );
}
