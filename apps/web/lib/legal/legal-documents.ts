export type LegalDocumentId = "TERMS" | "ACCOUNT_RAG_PRIVACY";

export type LegalDocument = Readonly<{
  id: LegalDocumentId;
  slug: string;
  version: "1";
  title: string;
  effectiveDate: string;
  body: string;
  bodySha256: string;
}>;

export const LEGAL_DOCUMENTS: Readonly<Record<LegalDocumentId, LegalDocument>> = {
  TERMS: {
    id: "TERMS",
    slug: "terms",
    version: "1",
    title: "CIVIC AI 서비스 이용약관",
    effectiveDate: "2026-08-12",
    body: `제1조 목적
이 약관은 CIVIC AI가 제공하는 계정, 인증 및 검색 증강 생성(RAG) 서비스의 이용 조건과 사용자 및 운영자의 권리·의무를 정합니다.

제2조 제공 서비스
CIVIC AI는 계정 생성·인증·보안 관리, 관리자가 적법한 권한을 확인해 등록한 문서의 검색, 해당 문서에 근거한 AI 답변과 출처 열람 기능을 제공합니다. 채팅, 투표, Decision 및 Simulation은 현재 제공 범위에 포함되지 않습니다.

제3조 가입과 계정
사용자는 만 14세 이상임을 확인하고 필수 정보와 두 필수 동의를 제출한 뒤 이메일 인증을 완료해야 서비스를 이용할 수 있습니다. 사용자는 정확한 정보를 제공하고 자신의 인증정보를 안전하게 관리해야 합니다.

제4조 금지 행위
사용자는 타인의 계정을 사용하거나, 서비스·보안을 방해하거나, 권리 없는 문서를 등록하거나, 법령 또는 타인의 권리를 침해하는 방식으로 서비스를 이용해서는 안 됩니다.

제5조 계정 비활성화
사용자는 계정을 비활성화할 수 있습니다. 비활성화 즉시 모든 세션이 종료되고 RAG 질의와 원문 열람이 차단됩니다. 재활성화는 기존 비밀번호와 등록 이메일 인증을 요구합니다.

제6조 서비스 변경과 중단
보안, 장애 대응 또는 법적 의무 이행을 위해 서비스 일부를 제한하거나 중단할 수 있습니다. 중요한 변경은 서비스 화면 또는 등록 이메일 등 합리적인 방법으로 알립니다.

제7조 AI 결과
RAG 답변은 AI가 생성한 참고 정보이며 오류가 있을 수 있습니다. 사용자는 연결된 출처를 확인하고 중요한 판단에 답변만을 단독 근거로 사용하지 않아야 합니다.

제8조 문의
서비스 이용과 개인정보 권리행사 연락처는 운영 공개 전에 별도 개인정보 처리방침과 운영 문서에서 확정하여 고지합니다.`,
    bodySha256: "c6b86097a6d97104129a969f3669e49faa735382ffb2fbd06f93ca993cd2f076",
  },
  ACCOUNT_RAG_PRIVACY: {
    id: "ACCOUNT_RAG_PRIVACY",
    slug: "account-rag-privacy",
    version: "1",
    title: "개인정보 수집·이용 동의 — 계정·RAG",
    effectiveDate: "2026-08-12",
    body: `1. 처리 목적
CIVIC AI는 계정 생성·인증·보안·재활성화, 필수 비민감 선호 설문 처리, 관리자가 등록한 문서에 근거한 RAG 질문·답변과 출처 제공을 위해 개인정보를 처리합니다.

2. 수집·이용 항목
이메일, 비밀번호 해시, 내부 사용자 ID, 만 14세 이상 확인, preferred_language, rag_answer_detail, 계정·보안·동의 증빙 메타데이터, 사용자가 제출한 RAG 질문 및 실제 저장되는 처리 기록을 수집·이용합니다. 정치적 견해, 실제 투표 선택·이유, 민감한 추론 속성은 가입 정보로 수집하지 않습니다.

3. 보유·이용기간과 파기
활성 계정 정보는 서비스 이용 기간 동안 보유합니다. 계정 비활성화 후에는 재활성화 목적의 접근 제한 상태로 보관하며, 구체적인 목적별 보유기간과 백업 파기 예외는 운영 공개 전에 법률 검토를 거쳐 개인정보 처리방침에 확정합니다. 확인된 개인정보 삭제 요구는 법정 보존 대상을 제외하고 식별 가능한 원본·검색 인덱스·파생 프로필을 삭제하거나 복원 불가능하게 익명화합니다.

4. 동의 거부 권리와 영향
사용자는 이 동의를 거부할 권리가 있습니다. 다만 이 정보는 현재 CIVIC AI의 계정 및 RAG 제공에 필수이므로 거부하면 가입을 완료할 수 없고 CIVIC AI 전체 서비스를 이용할 수 없습니다.

5. 자유 입력과 외부 처리
RAG 질문에는 민감정보를 입력하지 않는 것이 안전합니다. 실제 개인정보를 외부 LLM 또는 이메일 공급자에게 처리하게 하는 기능은 승인된 계약, 처리 범위, 국외 처리위탁 공개와 기능 게이트가 모두 충족되기 전에는 활성화하지 않습니다.

6. 동의 증빙
CIVIC AI는 사용자 ID, 문서 종류, 이 고정 문서의 버전과 본문 SHA-256, 동의 시각 및 동의 경로를 보관합니다. 설문 또는 질문 원문은 동의 로그에 복제하지 않습니다.`,
    bodySha256: "e452368f1c93ba423c16904037a9080b81822974e804afef028457c2265ac78a",
  },
};

export function findLegalDocument(slug: string, version: string): LegalDocument | undefined {
  return Object.values(LEGAL_DOCUMENTS).find(
    (document) => document.slug === slug && document.version === version,
  );
}
