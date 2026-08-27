import type { SimulationResult } from "@/lib/admin/simulation-contracts";

export function PublicSimulationEvidence({
  engine,
}: Readonly<{ engine: SimulationResult["engine"] }>) {
  return (
    <section className="civic-domain-form-section">
      <header>
        <span>자료 수집 요약</span>
        <h3>외부 참고 자료</h3>
      </header>
      <dl className="civic-domain-impact-list">
        <div>
          <dt>Naver 수집 문서</dt>
          <dd>{engine.externalInformation.collectedDocumentCount}건</dd>
        </div>
        <div>
          <dt>뉴스 / 블로그</dt>
          <dd>
            {engine.externalInformation.documentCountsByNaverEndpoint.news} /{" "}
            {engine.externalInformation.documentCountsByNaverEndpoint.blog}
          </dd>
        </div>
        <div>
          <dt>카페 / 웹문서</dt>
          <dd>
            {engine.externalInformation.documentCountsByNaverEndpoint.cafearticle} /{" "}
            {engine.externalInformation.documentCountsByNaverEndpoint.webkr}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function AnonymousPanelAttributes({
  respondent,
}: Readonly<{ respondent: SimulationResult["respondents"][number] }>) {
  return (
    <>
      <div>
        <dt>성별</dt>
        <dd>{respondent.demographics.gender ?? "미분류"}</dd>
      </div>
      <div>
        <dt>연령대</dt>
        <dd>{respondent.demographics.ageGroup ?? "미분류"}</dd>
      </div>
      <div>
        <dt>지역</dt>
        <dd>{respondent.demographics.region ?? "미분류"}</dd>
      </div>
      <div>
        <dt>정치 성향</dt>
        <dd>{respondent.demographics.politicalIdeology ?? "미분류"}</dd>
      </div>
    </>
  );
}
