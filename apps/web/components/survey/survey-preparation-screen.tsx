import { PlatformPageShell } from "@/components/platform-page-shell";

export function SurveyPreparationScreen() {
  return (
    <PlatformPageShell bottomNavigation={null} title="설문조사">
      <div className="px-4 py-4" data-survey-screen="preparation">
        <section aria-labelledby="survey-preparation-title" className="panel">
          <p className="eyebrow">설문조사</p>
          <h2 id="survey-preparation-title">설문조사 화면을 준비하고 있습니다.</h2>
          <p>문항 조회와 응답 제출 기능이 준비되면 이 화면에서 설문조사를 진행할 수 있습니다.</p>
        </section>
      </div>
    </PlatformPageShell>
  );
}
