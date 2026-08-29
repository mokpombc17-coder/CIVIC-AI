import type { ReactNode } from "react";
import type { Route } from "next";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { WireflowScreenHeading } from "@/components/wireflow/wireflow-screen-heading";

export function ScreenFrame({
  screen,
  children,
  backHref,
  platformHeading = "HIDDEN",
  title,
}: Readonly<{
  screen: ScreenDefinition;
  children: ReactNode;
  backHref?: Route;
  platformHeading?: "HIDDEN" | "SECONDARY";
  title?: string;
}>) {
  const signupStep = getSignupStep(screen.id);
  const heading = screenFrameHeading(screen);
  const resolvedBackHref = backHref ?? heading.backHref;
  return (
    <section
      aria-labelledby="civic-screen-title"
      className={`civic-functional-screen${screen.audience === "PUBLIC" ? " civic-public-screen" : ""}`}
      data-wireflow-screen={screen.id}
    >
      <WireflowScreenHeading
        {...heading}
        {...(resolvedBackHref ? { backHref: resolvedBackHref } : {})}
        secondary={platformHeading === "SECONDARY"}
        title={title ?? heading.title}
      />
      {signupStep ? <SignupStepIndicator current={signupStep} /> : null}
      {children}
    </section>
  );
}

export function screenFrameHeading(
  screen: ScreenDefinition,
): Readonly<{ backHref?: Route; subtitle?: string; title: string }> {
  const auth = authHeadings[screen.id];
  const participant = participantHeadings[screen.id];
  const admin = adminHeadings[screen.id];
  return auth ?? participant ?? admin ?? { title: screen.canonical_title };
}

const authHeadings: Readonly<
  Record<string, Readonly<{ backHref?: Route; subtitle?: string; title: string }>>
> = Object.freeze({
  "AUTH-001": { title: "로그인" },
  "AUTH-002": { backHref: "/login" as Route, title: "회원가입" },
  "AUTH-003": { title: "회원가입" },
  "AUTH-004": { title: "회원가입" },
  "AUTH-005": { backHref: "/signup/pending" as Route, title: "이메일 인증" },
  "AUTH-006": {
    backHref: "/signup/account" as Route,
    subtitle: "등록 이메일로 코드를 보냈습니다.",
    title: "이메일 인증",
  },
  "AUTH-007": { backHref: "/login" as Route, title: "비밀번호 재설정" },
  "AUTH-008": { title: "비밀번호 재설정" },
  "AUTH-009": { backHref: "/login" as Route, title: "계정 재활성화" },
  "AUTH-010": { backHref: "/login" as Route, title: "계정 재활성화" },
});

const participantHeadings: Readonly<Record<string, Readonly<{ backHref?: Route; title: string }>>> =
  Object.freeze({
    "U-HOME-001": { title: "홈" },
    "U-ACCOUNT-001": { title: "개인정보·설문 응답" },
    "U-ACCOUNT-002": { title: "개인정보·설문 응답" },
    "U-ACCOUNT-003": { backHref: "/account" as Route, title: "보안 설정" },
    "U-ACCOUNT-004": { title: "개인정보·설문 응답" },
    "U-RAG-001": { title: "AI" },
    "U-RAG-002": { title: "AI" },
    "U-RAG-003": { title: "AI" },
    "COMMON-002": { subtitle: "다른 요청으로 상태가 변경되었습니다.", title: "과업 상태" },
    "COMMON-003": { title: "처리 결과 확인" },
    "COMMON-004": { title: "서비스 일시 오류" },
  });

const adminHeadings: Readonly<Record<string, Readonly<{ backHref?: Route; title: string }>>> =
  Object.freeze({
    "A-HOME-001": { title: "관리 업무" },
    "A-USER-002": { backHref: "/admin/users" as Route, title: "사용자·관리자 상세" },
    "A-USER-004": { title: "관리자 전환·권한 편집" },
    "A-USER-005": { backHref: "/admin/users/detail" as Route, title: "권한 변경 이력" },
    "A-RAG-001": { title: "문서 관리" },
    "A-RAG-002": { title: "문서 관리" },
    "A-RAG-003": { title: "문서 관리" },
    "A-RAG-004": { title: "선택 폴더에 문서 업로드" },
    "A-RAG-005": { title: "문서 준비 상태" },
    "A-RAG-006": { title: "문서 관리" },
    "A-CHAT-004": { title: "채팅방 생성 요청" },
    "A-CHAT-005": { backHref: "/admin/chat/requests" as Route, title: "생성 요청 상세" },
    "A-CHAT-006": { backHref: "/admin/chat/requests" as Route, title: "생성 요청 승인·반려" },
    "A-CHAT-007": { title: "채팅방 카테고리 관리" },
    "A-TASK-001": { title: "과업 목록" },
    "A-TASK-002": { backHref: "/admin/tasks" as Route, title: "과업 생성" },
    "A-TASK-003": { backHref: "/admin/tasks" as Route, title: "과업 상세" },
    "A-TASK-004": { backHref: "/admin/tasks" as Route, title: "조기 마감 확인" },
    "A-TASK-005": { backHref: "/admin/tasks" as Route, title: "실제 투표 결과" },
  });

function SignupStepIndicator({ current }: Readonly<{ current: number }>) {
  const steps = ["계정 정보", "개인정보·설문", "필수 동의·확인"];
  return (
    <nav aria-label="회원가입 단계" className="civic-step-indicator">
      <p>
        <strong>{current}/3</strong>
        <span>{steps[current - 1]}</span>
      </p>
      <ol>
        {steps.map((label, index) => {
          const step = index + 1;
          return (
            <li
              aria-current={step === current ? "step" : undefined}
              className={step < current ? "is-done" : step === current ? "is-current" : ""}
              key={label}
            >
              <b className="sr-only">{label}</b>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function getSignupStep(id: string): number | null {
  if (id === "AUTH-002") return 1;
  if (id === "AUTH-003") return 2;
  if (id === "AUTH-004") return 3;
  return null;
}
