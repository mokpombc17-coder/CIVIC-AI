"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
} from "@/components/platform-shell";
import { votePublishingTask } from "@/lib/vote/vote-publishing-fixtures";
import styles from "./vote.module.css";

type VoteStep = 1 | 2 | 3 | 4;
type ReasonChoice = "reason-1" | "reason-2" | "direct" | null;

export function VoteTaskScreen({ taskId }: { taskId: string }) {
  const [step, setStep] = useState<VoteStep>(1);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [reasonChoice, setReasonChoice] = useState<ReasonChoice>(null);
  const [directReason, setDirectReason] = useState("");
  const [showDirectError, setShowDirectError] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const selectedOption = votePublishingTask.options.find(({ id }) => id === selectedOptionId);
  const selectedReason = votePublishingTask.reasons.find(({ id }) => id === reasonChoice);
  const trimmedDirectReason = directReason.trim();
  const reasonReady = Boolean(selectedReason || (reasonChoice === "direct" && trimmedDirectReason));
  const confirmationReason =
    selectedReason?.content ?? trimmedDirectReason ?? votePublishingTask.confirmationReason;

  const backAction = useMemo<PlatformHeaderBackAction>(() => {
    if (step === 1) return { href: "/vote", ariaLabel: "투표 목록으로" };
    if (step === 2) return { onClick: () => setStep(1), ariaLabel: "과업 확인으로" };
    if (step === 3) return { onClick: () => setStep(2), ariaLabel: "응답 작성으로" };
    return { href: "/vote", ariaLabel: "투표 목록으로" };
  }, [step]);

  function chooseOption(optionId: string) {
    setSelectedOptionId((currentOptionId) => (currentOptionId === optionId ? null : optionId));
    setReasonChoice(null);
    setDirectReason("");
    setShowDirectError(false);
  }

  function moveToConfirmation() {
    if (reasonChoice === "direct" && !trimmedDirectReason) {
      setShowDirectError(true);
      return;
    }
    if (reasonReady) setStep(3);
  }

  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      contentInert={cancelOpen}
      header={
        <PlatformHeader
          backAction={backAction}
          className={styles.voteHeader!}
          title="투표 참여하기"
        />
      }
      overlay={cancelOpen ? <CancelSheet onClose={() => setCancelOpen(false)} /> : null}
    >
      <div className={`${styles.surface} ${styles.flowSurface}`} data-task-id={taskId}>
        <VoteProgress step={step} />
        {step === 1 ? <TaskOverview onContinue={() => setStep(2)} /> : null}
        {step === 2 ? (
          <ResponseComposer
            directReason={directReason}
            onCancel={() => setCancelOpen(true)}
            onChooseOption={chooseOption}
            onChooseReason={(choice) => {
              setReasonChoice((currentChoice) => (currentChoice === choice ? null : choice));
              setShowDirectError(false);
            }}
            onDirectReasonChange={(value) => {
              setDirectReason(value);
              if (value.trim()) setShowDirectError(false);
            }}
            onSubmit={moveToConfirmation}
            reasonChoice={reasonChoice}
            reasonReady={reasonReady}
            selectedOptionId={selectedOptionId}
            showDirectError={showDirectError}
          />
        ) : null}
        {step === 3 ? (
          <ResponseConfirmation
            option={selectedOption?.content ?? "단계적으로 시행"}
            onSubmit={() => setStep(4)}
            reason={confirmationReason || votePublishingTask.confirmationReason}
          />
        ) : null}
        {step === 4 ? <VoteCompleted /> : null}
      </div>
    </PlatformShell>
  );
}

function VoteProgress({ step }: { step: VoteStep }) {
  const labels: Record<VoteStep, string> = {
    1: "과업 확인",
    2: "응답 작성",
    3: "응답 확인",
    4: "참여 완료",
  };
  return (
    <div className={styles.progressBlock}>
      <p className={styles.progressLabel}>
        <span>{step}/4</span>
        <strong>{labels[step]}</strong>
      </p>
      <div aria-label={`진행 단계 ${step}/4`} className={styles.progressBars}>
        {[1, 2, 3, 4].map((segment) => {
          const state = segment < step ? "done" : segment === step ? "current" : "upcoming";
          return (
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={styles.progressBar}
              data-state={state}
              key={segment}
            />
          );
        })}
      </div>
    </div>
  );
}

function TaskOverview({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={styles.flowBody}>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>과업</h2>
        <dl className={styles.infoCard}>
          <InfoRow label="배경" value={votePublishingTask.background} />
          <InfoRow label="질의" value={votePublishingTask.question} />
          <InfoRow label="마감" value={votePublishingTask.deadline} />
        </dl>
      </section>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>응답 선택지</h2>
        <div className={styles.overviewOptions}>
          {votePublishingTask.options.map((option) => (
            <div className={styles.overviewOption} key={option.id}>
              <span>{option.label}</span>
              <strong>{option.content}</strong>
            </div>
          ))}
        </div>
      </section>
      <button
        className={`${styles.compactPrimaryButton} ${styles.overviewContinueButton}`}
        onClick={onContinue}
        type="button"
      >
        참여하기
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type ComposerProps = Readonly<{
  directReason: string;
  onCancel: () => void;
  onChooseOption: (optionId: string) => void;
  onChooseReason: (choice: ReasonChoice) => void;
  onDirectReasonChange: (value: string) => void;
  onSubmit: () => void;
  reasonChoice: ReasonChoice;
  reasonReady: boolean;
  selectedOptionId: string | null;
  showDirectError: boolean;
}>;

function ResponseComposer(props: ComposerProps) {
  const hasSelectedOption = Boolean(props.selectedOptionId);

  return (
    <div className={styles.flowBody}>
      <div className={styles.responseComposerSections}>
        <section className={styles.flowSection}>
          <h2 className={styles.sectionTitle}>응답 선택지</h2>
          <div className={styles.choiceGrid}>
            {votePublishingTask.options.map((option) => (
              <button
                aria-pressed={props.selectedOptionId === option.id}
                className={styles.choiceCard}
                key={option.id}
                onClick={() => props.onChooseOption(option.id)}
                type="button"
              >
                <span>{option.label}</span>
                <strong>{option.content}</strong>
              </button>
            ))}
          </div>
        </section>
        <div
          aria-hidden={!hasSelectedOption}
          className={styles.reasonTitleDisclosure}
          data-visible={hasSelectedOption}
          inert={!hasSelectedOption}
        >
          <div className={styles.reasonTitleDisclosureInner}>
            <h2 className={styles.sectionTitle}>응답 이유</h2>
          </div>
        </div>
        <div
          aria-hidden={!hasSelectedOption}
          className={styles.reasonAccordion}
          data-open={hasSelectedOption}
          data-phase={hasSelectedOption ? "open" : "closed"}
          inert={!hasSelectedOption}
        >
          <div className={styles.reasonAccordionInner}>
            <div className={styles.reasonList}>
              {votePublishingTask.reasons.map((reason) => (
                <button
                  aria-pressed={props.reasonChoice === reason.id}
                  className={styles.reasonCard}
                  key={reason.id}
                  onClick={() => props.onChooseReason(reason.id as ReasonChoice)}
                  type="button"
                >
                  <span>{reason.label}</span>
                  <strong>{reason.content}</strong>
                </button>
              ))}
              <div
                className={styles.directReasonCard}
                data-selected={props.reasonChoice === "direct"}
              >
                <button
                  aria-pressed={props.reasonChoice === "direct"}
                  className={styles.directReasonSelect}
                  onClick={() => props.onChooseReason("direct")}
                  type="button"
                >
                  <span>직접 입력</span>
                  <strong>나의 생각을 직접 작성합니다.</strong>
                </button>
                <div
                  aria-hidden={props.reasonChoice !== "direct"}
                  className={styles.directInputDisclosure}
                  data-open={props.reasonChoice === "direct"}
                  inert={props.reasonChoice !== "direct"}
                >
                  <div className={styles.directInputDisclosureInner}>
                    <div className={styles.directInputWrap}>
                      <textarea
                        aria-invalid={props.showDirectError}
                        className={styles.directTextarea}
                        maxLength={votePublishingTask.reasonMaxLength}
                        onChange={(event) => props.onDirectReasonChange(event.target.value)}
                        placeholder="응답 이유를 입력하세요…"
                        value={props.directReason}
                      />
                      <div className={styles.directFieldMeta}>
                        <span className={styles.directFieldHint}>1~1,000자</span>
                        {props.showDirectError ? (
                          <span className={styles.fieldError}>응답 이유를 입력해 주세요.</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.fullActions}>
        <button
          className={styles.fullPrimaryButton}
          disabled={!props.reasonChoice}
          onClick={props.onSubmit}
          type="button"
        >
          제출하기
        </button>
        <button className={styles.fullSecondaryButton} onClick={props.onCancel} type="button">
          참여 취소하기
        </button>
      </div>
    </div>
  );
}

function ResponseConfirmation({
  option,
  onSubmit,
  reason,
}: {
  option: string;
  onSubmit: () => void;
  reason: string;
}) {
  return (
    <div className={styles.flowBody}>
      <section className={styles.confirmCard}>
        <span>응답 선택지</span>
        <strong>{option}</strong>
      </section>
      <section className={styles.confirmCard}>
        <span>응답 이유</span>
        <strong>{reason}</strong>
      </section>
      <p className={styles.confirmNotice}>
        제출한 응답은 수정할 수 없습니다. 내용을 다시 한번 확인해 주세요.
      </p>
      <button className={styles.compactPrimaryButton} onClick={onSubmit} type="button">
        제출하기
      </button>
    </div>
  );
}

function VoteCompleted() {
  return (
    <div className={styles.flowBody}>
      <div className={styles.successPanel}>
        <span aria-hidden="true" className={styles.successIcon} />
        <strong>투표 참여가 완료되었습니다.</strong>
      </div>
      <dl className={styles.infoCard}>
        <InfoRow label="배경" value={votePublishingTask.background} />
        <InfoRow label="질의" value={votePublishingTask.question} />
      </dl>
      <Link className={styles.compactPrimaryButton} href="/vote">
        과업 목록으로
      </Link>
    </div>
  );
}

function CancelSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.cancelOverlay}>
      <button
        aria-label="취소 창 닫기"
        className={styles.cancelBackdrop}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="vote-cancel-title"
        aria-modal="true"
        className={styles.cancelSheet}
        role="dialog"
      >
        <div className={styles.cancelSheetHeader}>
          <h2 id="vote-cancel-title">투표를 종료할까요?</h2>
          <button
            aria-label="닫기"
            className={styles.cancelClose}
            onClick={onClose}
            type="button"
          />
        </div>
        <p>저장하지 않고 나가면 현재 작성 내용이 사라집니다.</p>
        <div className={styles.cancelActions}>
          <Link className={styles.fullSecondaryButton} href="/vote">
            저장하지 않고 나가기
          </Link>
          <button className={styles.fullPrimaryButton} onClick={onClose} type="button">
            이어서 투표하기
          </button>
        </div>
      </section>
    </div>
  );
}
