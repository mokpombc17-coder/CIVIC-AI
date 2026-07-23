import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Architecture",
};

const rows = [
  ["Server Component", "초기 조회와 서버 화면 생성", "Spring Boot query API"],
  ["Client Component", "상태·이벤트·WebSocket", "브라우저 또는 WebView"],
  ["Server Action", "UI에 결합된 command workflow", "form, revalidate, redirect"],
  ["Route Handler", "명시적인 HTTP 계약", "useQuery/useMutation, callback"],
  ["Expo shell", "앱 생명주기와 기기 기능", "WebView, deep link, share"],
];

export default function ArchitecturePage() {
  return (
    <div className="page-stack">
      <section className="hero hero-compact">
        <p className="eyebrow">Route segment navigation</p>
        <h1>이 페이지로 이동해도 헤더의 layout state는 유지된다.</h1>
        <p>
          Next.js의 <code>Link</code>는 전체 document를 새로고침하지 않고 변경된 route segment를
          병합한다.
        </p>
      </section>

      <section className="panel table-wrapper">
        <table>
          <thead>
            <tr>
              <th>경계</th>
              <th>책임</th>
              <th>대표 연결</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([boundary, responsibility, connection]) => (
              <tr key={boundary}>
                <th scope="row">{boundary}</th>
                <td>{responsibility}</td>
                <td>{connection}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
