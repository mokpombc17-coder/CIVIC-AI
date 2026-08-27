"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { formatVoteDateTime } from "@/lib/vote/vote-format";
import {
  clearPendingTaskSubmission,
  createPendingTaskSubmission,
  readPendingTaskSubmission,
  savePendingTaskSubmission,
} from "@/lib/vote/vote-idempotent-submission";
import {
  useOpenTaskQuery,
  useSubmitTaskMutation,
  useTaskPredictionCoordinator,
  useTaskSubmissionQuery,
} from "@/lib/vote/vote-queries";
import {
  sortPredictedReasons,
  sortTaskOptions,
  type SubmitTaskRequest,
} from "@/lib/vote/vote-task-contracts";
import { getVoteTaskApiMode } from "@/lib/vote/vote-task-mock-api";
import styles from "./vote.module.css";

type VoteStep = 1 | 2 | 3 | 4;
type ReasonMode = "ai" | "direct" | null;

export function VoteTaskScreen({ taskId }: { taskId: string }) {
  const router = useRouter();
  const detailQuery = useOpenTaskQuery(taskId);
  const { predictionQuery, ensureMutation } = useTaskPredictionCoordinator(taskId);
  const submitMutation = useSubmitTaskMutation(taskId);
  const [step, setStep] = useState<VoteStep>(1);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [reasonMode, setReasonMode] = useState<ReasonMode>(null);
  const [predictedReasonId, setPredictedReasonId] = useState<string | null>(null);
  const [directReason, setDirectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const recoveredRef = useRef(false);
  const prediction = predictionQuery.data;
  const remoteSubmitted =
    detailQuery.data?.submission.submitted === true || prediction?.state === "ALREADY_SUBMITTED";
  const visibleStep: VoteStep = remoteSubmitted ? 4 : step;
  const submitted = visibleStep === 4;
  const submissionQuery = useTaskSubmissionQuery(taskId, submitted);

  useEffect(() => {
    if (recoveredRef.current || !detailQuery.data) return;
    recoveredRef.current = true;
    const pending = readPendingTaskSubmission(taskId);
    if (!pending) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedOptionId(pending.command.selectedOptionId);
      if (pending.command.reasonSource === "AI_ACCEPTED") {
        setReasonMode("ai");
        setPredictedReasonId(pending.command.acceptedPredictedReasonId);
      } else {
        setReasonMode("direct");
        setDirectReason(pending.command.reason);
      }
      setStep(3);
    });
    return () => {
      cancelled = true;
    };
  }, [detailQuery.data, taskId]);

  const task = detailQuery.data?.task;
  const options = useMemo(() => sortTaskOptions(task?.question.options ?? []), [task]);
  const predictedReasons = useMemo(
    () =>
      sortPredictedReasons(
        (prediction?.predictedReasons ?? []).filter(
          (reason) => reason.optionId === selectedOptionId,
        ),
      ),
    [prediction?.predictedReasons, selectedOptionId],
  );
  const selectedOption = options.find((option) => option.id === selectedOptionId);
  const selectedPredictedReason = predictedReasons.find(
    (reason) => reason.id === predictedReasonId,
  );
  const validDirectReason = directReason.trim().length >= 1 && directReason.trim().length <= 500;
  const responseReady =
    selectedOptionId !== null &&
    ((reasonMode === "ai" && selectedPredictedReason !== undefined) ||
      (reasonMode === "direct" && validDirectReason));

  const backAction =
    visibleStep === 1
      ? { href: "/vote", ariaLabel: "투표 목록으로" }
      : visibleStep === 4
        ? { href: "/vote", ariaLabel: "투표 목록으로" }
        : {
            onClick: () => {
              if (visibleStep === 3) setStep(2);
              else setCancelOpen(true);
            },
            ariaLabel: visibleStep === 3 ? "응답 수정하기" : "투표 종료하기",
          };

  return (
    <PlatformPageShell
      backAction={backAction}
      bottomNavigation={null}
      title={
        visibleStep === 1
          ? "1/4 과업 확인"
          : visibleStep === 2
            ? "2/4 응답하기"
            : visibleStep === 3
              ? "3/4 응답 확인"
              : "4/4 참여 완료"
      }
    >
      <div className={styles.surface}>
        {detailQuery.isPending ? (
          <VoteStateNotice>투표 내용을 불러오고 있어요.</VoteStateNotice>
        ) : null}
        {detailQuery.isError ? (
          <VoteStateNotice error retry={() => detailQuery.refetch()}>
            투표 내용을 불러오지 못했어요.
          </VoteStateNotice>
        ) : null}
        {task ? (
          <div className={styles.flow}>
            {getVoteTaskApiMode() === "mock" ? (
              <span className={styles.mockBadge}>Persona-ready Task API Mock</span>
            ) : null}
            {visibleStep === 1 ? (
              <>
                <section className={styles.section}>
                  <p className={styles.eyebrow}>시민 참여 과업</p>
                  <h2 className={styles.heading}>{task.title}</h2>
                  {task.description ? <p className={styles.body}>{task.description}</p> : null}
                </section>
                <hr className={styles.divider} />
                <section className={styles.section}>
                  <p className={styles.eyebrow}>질문</p>
                  <h3 className={styles.heading}>{task.question.content}</h3>
                  {task.question.description ? (
                    <p className={styles.body}>{task.question.description}</p>
                  ) : null}
                  <ul className={styles.options}>
                    {options.map((option) => (
                      <li className={styles.optionLabel} key={option.id}>
                        <span className={styles.optionText}>{option.content}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <dl className={styles.meta}>
                  <div className={styles.metaRow}>
                    <dt>마감</dt>
                    <dd>{formatVoteDateTime(detailQuery.data!.closesAt)}</dd>
                  </div>
                </dl>
                {prediction?.state === "PERSONA_NOT_READY" ? (
                  <div className={styles.warning}>
                    맞춤 예상 답변을 준비하고 있어요. 과업은 먼저 확인할 수 있고, 응답 화면에서 준비
                    상태를 계속 확인합니다.
                  </div>
                ) : null}
                <div className={styles.actions}>
                  <button className={styles.primaryButton} onClick={() => setStep(2)} type="button">
                    참여하기
                  </button>
                </div>
              </>
            ) : null}

            {visibleStep === 2 ? (
              <>
                <section className={styles.section}>
                  <p className={styles.eyebrow}>질문</p>
                  <h2 className={styles.heading}>{task.question.content}</h2>
                  <ul className={styles.options}>
                    {options.map((option) => (
                      <li key={option.id}>
                        <label className={styles.optionLabel}>
                          <input
                            checked={selectedOptionId === option.id}
                            name="vote-option"
                            onChange={() => {
                              setSelectedOptionId(option.id);
                              setPredictedReasonId(null);
                              if (reasonMode === "ai") setReasonMode(null);
                            }}
                            type="radio"
                          />
                          <span className={styles.optionText}>{option.content}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>

                {selectedOptionId ? (
                  <section className={styles.section} aria-labelledby="reason-heading">
                    <h3 className={styles.heading} id="reason-heading">
                      선택한 이유를 알려주세요
                    </h3>
                    {predictionQuery.isPending ||
                    prediction?.waiting ||
                    ensureMutation.isPending ? (
                      <div className={styles.notice}>
                        AI 예상 답변을 준비하고 있어요. 직접 작성이 허용되면 기다리지 않고 응답할 수
                        있어요.
                      </div>
                    ) : null}
                    {prediction?.state === "PERSONA_NOT_READY" ? (
                      <div className={styles.warning}>
                        Persona가 아직 준비되지 않아 예상 답변과 제출을 사용할 수 없어요. 이
                        화면에서 자동으로 준비 상태를 확인합니다.
                      </div>
                    ) : null}
                    {prediction?.aiAcceptanceAllowed && predictedReasons.length > 0 ? (
                      <div className={styles.reasonGroup}>
                        {predictedReasons.map((reason) => (
                          <label className={styles.reasonLabel} key={reason.id}>
                            <input
                              checked={reasonMode === "ai" && predictedReasonId === reason.id}
                              name="vote-reason"
                              onChange={() => {
                                setReasonMode("ai");
                                setPredictedReasonId(reason.id);
                              }}
                              type="radio"
                            />
                            <span>
                              <p className={styles.reasonSource}>AI 예상 답변</p>
                              <p className={styles.reasonText}>{reason.reason}</p>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {prediction?.directAnswerAllowed ? (
                      <div className={styles.reasonGroup}>
                        <label className={styles.reasonLabel}>
                          <input
                            checked={reasonMode === "direct"}
                            name="vote-reason"
                            onChange={() => setReasonMode("direct")}
                            type="radio"
                          />
                          <span>
                            <p className={styles.reasonSource}>직접 작성</p>
                            <p className={styles.reasonText}>내 생각을 직접 적을게요.</p>
                          </span>
                        </label>
                        {reasonMode === "direct" ? (
                          <>
                            <textarea
                              aria-invalid={!validDirectReason && directReason.length > 0}
                              aria-label="선택 이유"
                              className={styles.textarea}
                              maxLength={500}
                              onChange={(event) => setDirectReason(event.target.value)}
                              placeholder="선택한 이유를 1~500자로 작성해 주세요"
                              value={directReason}
                            />
                            <p className={styles.counter}>{directReason.length}/500</p>
                            {!validDirectReason && directReason.length > 0 ? (
                              <p className={styles.fieldError}>이유를 1~500자로 작성해 주세요.</p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {predictionQuery.isError || ensureMutation.isError ? (
                      <div className={`${styles.notice} ${styles.error}`} role="alert">
                        예상 답변 상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    disabled={!responseReady}
                    onClick={() => setStep(3)}
                    type="button"
                  >
                    응답 확인하기
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setCancelOpen(true)}
                    type="button"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : null}

            {visibleStep === 3 && selectedOption ? (
              <>
                <section className={styles.section}>
                  <button className={styles.textButton} onClick={() => setStep(2)} type="button">
                    ← 응답 수정하기
                  </button>
                  <h2 className={styles.heading}>이대로 제출할까요?</h2>
                  <div className={styles.summary}>
                    <div>
                      <p className={styles.summaryLabel}>선택한 답변</p>
                      <p className={styles.summaryValue}>{selectedOption.content}</p>
                    </div>
                    <div>
                      <p className={styles.summaryLabel}>선택한 이유</p>
                      <p className={styles.summaryValue}>
                        {reasonMode === "ai"
                          ? selectedPredictedReason?.reason
                          : directReason.trim()}
                      </p>
                    </div>
                  </div>
                  <div className={styles.warning}>
                    제출한 응답은 수정할 수 없어요. 내용을 한 번 더 확인해 주세요.
                  </div>
                  {!prediction?.submissionAllowed ? (
                    <div className={styles.warning}>
                      아직 제출할 수 없는 상태예요. Persona 또는 prediction 상태가 갱신될 때까지
                      기다려 주세요.
                    </div>
                  ) : null}
                  {submitError ? (
                    <div className={`${styles.notice} ${styles.error}`} role="alert">
                      {submitError}
                    </div>
                  ) : null}
                </section>
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    disabled={!prediction?.submissionAllowed || submitMutation.isPending}
                    onClick={() => submitResponse()}
                    type="button"
                  >
                    {submitMutation.isPending ? "제출하는 중…" : "제출하기"}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    disabled={submitMutation.isPending}
                    onClick={() => setCancelOpen(true)}
                    type="button"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : null}

            {visibleStep === 4 ? (
              <>
                <section className={styles.success}>
                  <span aria-hidden="true" className={styles.successIcon}>
                    ✓
                  </span>
                  <h2 className={styles.heading}>투표 참여를 완료했어요</h2>
                  <p className={styles.body}>소중한 의견이 안전하게 제출되었습니다.</p>
                </section>
                <div className={styles.summary}>
                  <div>
                    <p className={styles.summaryLabel}>과업</p>
                    <p className={styles.summaryValue}>
                      {submissionQuery.data?.taskTitle ?? task.title}
                    </p>
                  </div>
                  {submissionQuery.data ? (
                    <div>
                      <p className={styles.summaryLabel}>내 응답</p>
                      <p className={styles.summaryValue}>
                        {
                          submissionQuery.data.question.options.find(
                            (option) => option.id === submissionQuery.data?.selectedOptionId,
                          )?.content
                        }
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className={styles.summaryLabel}>제출 일시</p>
                    <p className={styles.summaryValue}>
                      {submissionQuery.data?.submittedAt
                        ? formatVoteDateTime(submissionQuery.data.submittedAt)
                        : "제출 완료"}
                    </p>
                  </div>
                </div>
                <button
                  className={styles.primaryButton}
                  onClick={() => router.push("/vote")}
                  type="button"
                >
                  과업 목록으로
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {cancelOpen ? (
          <div className={styles.sheetBackdrop}>
            <section
              aria-modal="true"
              className={styles.sheet}
              role="dialog"
              aria-labelledby="vote-cancel-title"
            >
              <h2 id="vote-cancel-title">투표를 종료할까요?</h2>
              <p>아직 제출하지 않은 응답은 저장되지 않아요.</p>
              <button
                className={styles.primaryButton}
                onClick={() => router.push("/vote")}
                type="button"
              >
                종료하기
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => setCancelOpen(false)}
                type="button"
              >
                계속 참여하기
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </PlatformPageShell>
  );

  function submitResponse() {
    if (
      !task ||
      !selectedOptionId ||
      !prediction?.personaGenerationId ||
      !prediction.personaVersionId
    )
      return;
    let command: SubmitTaskRequest;
    if (reasonMode === "ai" && prediction.predictionId && predictedReasonId) {
      command = {
        personaGenerationId: prediction.personaGenerationId,
        personaVersionId: prediction.personaVersionId,
        predictionId: prediction.predictionId,
        questionId: task.question.id,
        selectedOptionId,
        reasonSource: "AI_ACCEPTED",
        acceptedPredictedReasonId: predictedReasonId,
        reason: null,
      };
    } else if (reasonMode === "direct" && validDirectReason) {
      command = {
        personaGenerationId: prediction.personaGenerationId,
        personaVersionId: prediction.personaVersionId,
        predictionId: prediction.predictionId,
        questionId: task.question.id,
        selectedOptionId,
        reasonSource: "USER_WRITTEN",
        acceptedPredictedReasonId: null,
        reason: directReason.trim(),
      };
    } else return;

    const previous = readPendingTaskSubmission(taskId);
    const pending =
      previous && JSON.stringify(previous.command) === JSON.stringify(command)
        ? previous
        : createPendingTaskSubmission(taskId, command);
    savePendingTaskSubmission(pending);
    setSubmitError(null);
    submitMutation.mutate(
      { command: pending.command, idempotencyKey: pending.idempotencyKey },
      {
        onSuccess: () => {
          clearPendingTaskSubmission(taskId);
          setStep(4);
        },
        onError: (error) => {
          if (error instanceof VoteApiError && error.code === "TASK_ALREADY_SUBMITTED") {
            clearPendingTaskSubmission(taskId);
            setStep(4);
            return;
          }
          setSubmitError(getSubmitErrorMessage(error));
        },
      },
    );
  }
}

function VoteStateNotice({
  children,
  error = false,
  retry,
}: {
  children: string;
  error?: boolean;
  retry?: () => void;
}) {
  return (
    <div
      className={`${styles.flow} ${error ? styles.error : ""}`}
      role={error ? "alert" : undefined}
    >
      <div className={styles.notice}>
        <p>{children}</p>
        {retry ? (
          <button className={styles.secondaryButton} onClick={retry} type="button">
            다시 시도
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.code === "TASK_CURRENT_PERSONA_NOT_READY")
      return "Persona가 아직 준비되지 않았어요. 상태를 다시 확인해 주세요.";
    if (error.code === "TASK_CLOSED") return "투표가 마감되어 제출할 수 없어요.";
    if (error.status === 422) return "선택한 답변과 이유를 다시 확인해 주세요.";
    if (
      error.code === "TASK_SUBMISSION_PERSONA_MISMATCH" ||
      error.code === "TASK_SUBMISSION_PREDICTION_UNAVAILABLE"
    )
      return "응답 준비 상태가 변경됐어요. 이전 화면에서 다시 확인해 주세요.";
  }
  return "제출 결과를 확인하지 못했어요. 같은 응답으로 다시 시도할 수 있습니다.";
}
