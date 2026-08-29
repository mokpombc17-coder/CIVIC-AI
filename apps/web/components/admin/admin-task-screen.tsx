"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthenticatedDownloadLink } from "@/components/auth/authenticated-download-link";
import { ScreenFrame } from "@/components/screens/screen-frame";
import {
  adminFieldError,
  canReadTaskResult,
  formatAdminProblem,
  readAdminProblem,
  readTask,
  readTaskDetail,
  readTaskResultSummary,
  readTaskSummaries,
  type Task,
  type AdminProblem,
  type TaskDetail,
  type TaskResultSummary,
  type TaskStatus,
  type TaskSummary,
} from "@/lib/admin/domain-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

type DraftOption = Readonly<{ id: string | null; content: string }>;
type LifecycleAction = "schedule" | "reschedule" | "open-now" | "start-now" | "deadline" | "cancel";

export function AdminTaskScreen({
  screen,
  query,
}: Readonly<{
  screen: ScreenDefinition;
  query: Readonly<Record<string, string | readonly string[] | undefined>>;
}>) {
  const taskId = firstQueryValue(query.taskId);
  const taskListAction =
    screen.id === "A-TASK-001" ? (
      <Link
        aria-label="새 과업 만들기"
        className="civic-primary-action civic-task-create-action"
        href="/admin/tasks/create"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
        <span>새 과업 만들기</span>
      </Link>
    ) : undefined;
  return (
    <ScreenFrame
      {...(screen.id === "A-TASK-001" ? {} : { backHref: "/admin/tasks" as Route })}
      headingAction={taskListAction}
      screen={screen}
    >
      <div
        className="civic-admin-workbench civic-domain-console"
        data-wireflow-layout={taskLayout(screen.id)}
      >
        {screen.id === "A-TASK-001" ? <TaskList /> : null}
        {screen.id === "A-TASK-002" ? <TaskEditor taskId={taskId} /> : null}
        {screen.id === "A-TASK-003" ? <TaskDetailView taskId={taskId} /> : null}
        {screen.id === "A-TASK-004" ? <TaskCloseConfirmation taskId={taskId} /> : null}
        {screen.id === "A-TASK-005" ? <TaskResultView taskId={taskId} /> : null}
      </div>
    </ScreenFrame>
  );
}

function TaskList() {
  const [items, setItems] = useState<readonly TaskSummary[]>([]);
  const [filter, setFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/v1/admin/tasks", { cache: "no-store" });
      if (!response.ok) {
        setItems([]);
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const tasks = readTaskSummaries(await response.json());
      if (!tasks) {
        setItems([]);
        setMessage("서버의 과업 목록 응답 형식을 확인해야 합니다.");
        return;
      }
      setItems(tasks);
      setMessage("");
    } catch {
      setItems([]);
      setMessage("네트워크 오류로 과업 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return items.filter(
      (item) =>
        (filter === "ALL" || item.status === filter) &&
        (!normalized || item.title.toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  }, [filter, items, query]);

  return (
    <>
      <div className="civic-domain-toolbar civic-task-list-toolbar">
        <label className="civic-field">
          <span>과업 제목 검색</span>
          <input
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="과업 제목 입력…"
            type="search"
            value={query}
          />
        </label>
        <div aria-label="과업 상태" className="wf-admin-filters" role="group">
          {(["ALL", "DRAFT", "SCHEDULED", "OPEN", "CLOSED"] as const).map((status) => (
            <button
              aria-pressed={filter === status}
              key={status}
              onClick={() => setFilter(status)}
              type="button"
            >
              {status === "ALL" ? "전체" : taskStatusLabel(status)}
            </button>
          ))}
        </div>
      </div>
      <div aria-label="과업 목록 표" className="civic-table-scroll" role="region" tabIndex={0}>
        <table className="civic-admin-table">
          <thead>
            <tr>
              <th>과업 제목</th>
              <th>상태</th>
              <th>시작</th>
              <th>마감</th>
              <th>종료 유형</th>
              <th>최근 변경</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {loading ? "과업을 불러오는 중입니다." : "조건에 맞는 과업이 없습니다."}
                </td>
              </tr>
            ) : null}
            {filtered.map((item) => (
              <tr key={item.taskId}>
                <th scope="row">{item.title}</th>
                <td>
                  <TaskStatusBadge status={item.status} />
                </td>
                <td>{formatDate(item.openedAt ?? item.schedule?.opensAt ?? null)}</td>
                <td>{formatDate(item.schedule?.closesAt ?? item.closedAt)}</td>
                <td>{closureLabel(item.closureType)}</td>
                <td>{formatDate(item.updatedAt)}</td>
                <td>
                  <Link
                    className="civic-primary-action"
                    href={`/admin/tasks/detail?taskId=${encodeURIComponent(item.taskId)}` as Route}
                  >
                    과업 상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </>
  );
}

function TaskEditor({ taskId }: Readonly<{ taskId: string | null }>) {
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [questionDescription, setQuestionDescription] = useState("");
  const [options, setOptions] = useState<readonly DraftOption[]>([
    { id: null, content: "" },
    { id: null, content: "" },
  ]);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<AdminProblem | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    const timer = window.setTimeout(() => {
      void requestTaskDetail(taskId).then((detail) => {
        if (!detail) return setMessage("수정할 초안을 불러오지 못했습니다.");
        if (detail.task.status !== "DRAFT") {
          return setMessage("초안 상태의 과업만 전체 수정할 수 있습니다.");
        }
        const current = detail.task;
        setTask(current);
        setTitle(current.title);
        setDescription(current.description ?? "");
        setQuestion(current.question?.content ?? "");
        setQuestionDescription(current.question?.description ?? "");
        setOptions(
          current.question?.options.map((option) => ({
            id: option.id,
            content: option.content,
          })) ?? [
            { id: null, content: "" },
            { id: null, content: "" },
          ],
        );
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [taskId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDraft(title, question, options);
    if (validation) return setMessage(validation);
    setPending(true);
    setMessage("");
    setProblem(null);
    const body = {
      title: title.trim(),
      description: optionalText(description),
      question: {
        id: task?.question?.id ?? null,
        content: question.trim(),
        description: optionalText(questionDescription),
        options: options.map((option) => ({ id: option.id, content: option.content.trim() })),
      },
    };
    try {
      const response = await authenticatedFetch(
        task ? `/api/v1/admin/tasks/${encodeURIComponent(task.id)}` : "/api/v1/admin/tasks",
        {
          method: task ? "PUT" : "POST",
          headers: {
            "content-type": "application/json",
            ...(task ? {} : { "idempotency-key": crypto.randomUUID() }),
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const nextProblem = await readAdminProblem(response);
        setProblem(nextProblem);
        setMessage(formatAdminProblem(nextProblem));
        return;
      }
      const saved = readTask(await response.json());
      if (!saved) return setMessage("서버의 과업 저장 응답 형식을 확인해야 합니다.");
      router.push(`/admin/tasks/detail?taskId=${encodeURIComponent(saved.id)}` as Route);
    } catch {
      if (task) {
        const latest = await requestTaskDetail(task.id);
        if (latest) setTask(latest.task);
      }
      setMessage("저장 결과가 불명확하여 서버 상태를 다시 확인했습니다. 자동 재전송하지 않습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="civic-domain-form" onSubmit={submit}>
      <section className="civic-domain-form-section">
        <header>
          <span>{task ? "초안 전체 수정" : "새 초안"}</span>
          <h2>과업 기본 정보</h2>
        </header>
        <label className="civic-field">
          <span>제목</span>
          <input
            aria-describedby={adminFieldError(problem, "title") ? "task-title-error" : undefined}
            aria-invalid={Boolean(adminFieldError(problem, "title"))}
            disabled={pending}
            maxLength={200}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            value={title}
          />
          <FieldError id="task-title-error" message={adminFieldError(problem, "title")} />
        </label>
        <label className="civic-field">
          <span>관리자 설명</span>
          <textarea
            disabled={pending}
            onChange={(event) => setDescription(event.currentTarget.value)}
            rows={4}
            value={description}
          />
        </label>
        <label className="civic-field">
          <span>질문</span>
          <textarea
            aria-describedby={
              adminFieldError(problem, "question.content") ? "task-question-error" : undefined
            }
            aria-invalid={Boolean(adminFieldError(problem, "question.content"))}
            disabled={pending}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            required
            rows={4}
            value={question}
          />
          <FieldError
            id="task-question-error"
            message={adminFieldError(problem, "question.content")}
          />
        </label>
        <label className="civic-field">
          <span>질문 설명</span>
          <textarea
            disabled={pending}
            onChange={(event) => setQuestionDescription(event.currentTarget.value)}
            rows={3}
            value={questionDescription}
          />
        </label>
      </section>
      <section className="civic-domain-form-section">
        <header>
          <span>단일 선택</span>
          <h2>응답 선택지</h2>
        </header>
        <ol className="civic-option-builder">
          {options.map((option, index) => (
            <li key={option.id ?? `new-${index}`}>
              <label className="civic-field">
                <span>선택지 {index + 1}</span>
                <input
                  aria-describedby={
                    adminFieldError(
                      problem,
                      `question.options[${index}].content`,
                      `question.options.${index}.content`,
                    )
                      ? `task-option-${index}-error`
                      : undefined
                  }
                  aria-invalid={Boolean(
                    adminFieldError(
                      problem,
                      `question.options[${index}].content`,
                      `question.options.${index}.content`,
                    ),
                  )}
                  disabled={pending}
                  maxLength={255}
                  onChange={(event) => {
                    const content = event.currentTarget.value;
                    setOptions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, content } : item,
                      ),
                    );
                  }}
                  required
                  value={option.content}
                />
                <FieldError
                  id={`task-option-${index}-error`}
                  message={adminFieldError(
                    problem,
                    `question.options[${index}].content`,
                    `question.options.${index}.content`,
                  )}
                />
              </label>
              <button
                disabled={pending || options.length <= 2}
                onClick={() =>
                  setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
                type="button"
              >
                삭제
              </button>
            </li>
          ))}
        </ol>
        <button
          className="wf-button wf-button-secondary"
          disabled={pending}
          onClick={() => setOptions((current) => [...current, { id: null, content: "" }])}
          type="button"
        >
          선택지 추가
        </button>
      </section>
      <div className="civic-form-actions">
        <Link
          href={
            task
              ? (`/admin/tasks/detail?taskId=${encodeURIComponent(task.id)}` as Route)
              : "/admin/tasks"
          }
        >
          취소
        </Link>
        <button className="civic-primary-action" disabled={pending} type="submit">
          {pending ? "서버 확인 중…" : task ? "초안 전체 저장" : "초안 생성"}
        </button>
      </div>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </form>
  );
}

function TaskDetailView({ taskId }: Readonly<{ taskId: string | null }>) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [message, setMessage] = useState(taskId ? "" : "과업 목록에서 상세 대상을 선택해 주세요.");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AdminProblem | null>(null);

  const load = useCallback(async () => {
    if (!taskId) return setMessage("과업 목록에서 상세 대상을 선택해 주세요.");
    const loaded = await requestTaskDetail(taskId);
    if (!loaded) return setMessage("과업 상세를 불러오지 못했습니다.");
    setDetail(loaded);
    setMessage("");
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, taskId]);

  async function mutate(action: LifecycleAction, values: LifecycleValues) {
    if (!detail || pending) return;
    setProblem(null);
    const request = lifecycleRequest(action, detail.task, values);
    if ("error" in request) return setMessage(request.error);
    setPending(true);
    try {
      const response = await authenticatedFetch(request.path, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      if (!response.ok) {
        const problem = await readAdminProblem(response);
        setProblem(problem);
        if (response.status === 409) await load();
        setMessage(formatAdminProblem(problem));
        return;
      }
      const task = readTask(await response.json());
      if (!task) return setMessage("서버의 과업 변경 응답 형식을 확인해야 합니다.");
      const latest = await requestTaskDetail(task.id);
      setDetail(latest ?? { task, lifecycleHistory: detail.lifecycleHistory });
      setProblem(null);
      setMessage("과업의 최신 상태를 반영했습니다.");
    } catch {
      await load();
      setMessage("처리 결과가 불명확하여 상세·이력을 다시 조회했습니다. 자동 재전송하지 않습니다.");
    } finally {
      setPending(false);
    }
  }

  if (!detail) return <StatusMessage>{message || "과업 상세를 불러오는 중입니다."}</StatusMessage>;
  const task = detail.task;
  return (
    <section className="civic-domain-detail">
      <TaskSummaryGrid task={task} />
      <div className="civic-task-detail-grid">
        <div className="civic-task-detail-content">
          {task.question ? (
            <section className="civic-domain-description">
              <h2>{task.question.content}</h2>
              {task.question.description ? <p>{task.question.description}</p> : null}
              <ol className="civic-task-options-readonly">
                {[...task.question.options]
                  .sort((left, right) => left.displayOrder - right.displayOrder)
                  .map((option) => (
                    <li key={option.id}>{option.content}</li>
                  ))}
              </ol>
            </section>
          ) : (
            <div className="civic-boundary-note">
              <strong>질문 미작성</strong>
              <p>질문과 두 개 이상의 선택지를 저장해야 발행할 수 있습니다.</p>
            </div>
          )}
          <div className="civic-detail-actions">
            {task.status === "DRAFT" ? (
              <Link href={`/admin/tasks/create?taskId=${encodeURIComponent(task.id)}` as Route}>
                초안 수정
              </Link>
            ) : null}
            {task.status === "OPEN" ? (
              <Link
                className="civic-danger-action"
                href={`/admin/tasks/close?taskId=${encodeURIComponent(task.id)}` as Route}
              >
                조기 종료
              </Link>
            ) : null}
            {canReadTaskResult(task) ? (
              <Link href={`/admin/tasks/results?taskId=${encodeURIComponent(task.id)}` as Route}>
                정량 결과 보기
              </Link>
            ) : null}
          </div>
        </div>
        <aside aria-label="과업 운영" className="civic-task-detail-operations">
          <LifecyclePanel
            key={task.status}
            onSubmit={mutate}
            pending={pending}
            problem={problem}
            task={task}
          />
          <LifecycleHistory events={detail.lifecycleHistory} />
        </aside>
      </div>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

type LifecycleValues = Readonly<{ closesAt: string; opensAt: string; reason: string }>;

function LifecyclePanel({
  task,
  pending,
  onSubmit,
  problem,
}: Readonly<{
  task: Task;
  pending: boolean;
  problem: AdminProblem | null;
  onSubmit: (action: LifecycleAction, values: LifecycleValues) => void;
}>) {
  const actions = lifecycleActions(task.status);
  const [action, setAction] = useState<LifecycleAction>(actions[0] ?? "cancel");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [reason, setReason] = useState("");
  if (actions.length === 0) return null;
  const needsOpensAt = action === "schedule" || action === "reschedule";
  const needsClosesAt = needsOpensAt || action === "open-now" || action === "deadline";
  return (
    <form
      className="civic-domain-action-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(action, { opensAt, closesAt, reason });
      }}
    >
      <h2>상태 변경</h2>
      <label className="civic-field">
        <span>동작</span>
        <select
          disabled={pending}
          onChange={(event) => setAction(event.currentTarget.value as LifecycleAction)}
          value={action}
        >
          {actions.map((item) => (
            <option key={item} value={item}>
              {lifecycleActionLabel(item)}
            </option>
          ))}
        </select>
      </label>
      {needsOpensAt ? (
        <label className="civic-field">
          <span>시작 시각</span>
          <input
            aria-describedby={
              adminFieldError(problem, "opensAt") ? "task-opens-at-error" : undefined
            }
            aria-invalid={Boolean(adminFieldError(problem, "opensAt"))}
            disabled={pending}
            onChange={(event) => setOpensAt(event.currentTarget.value)}
            required
            type="datetime-local"
            value={opensAt}
          />
          <FieldError id="task-opens-at-error" message={adminFieldError(problem, "opensAt")} />
        </label>
      ) : null}
      {needsClosesAt ? (
        <label className="civic-field">
          <span>마감 시각</span>
          <input
            aria-describedby={
              adminFieldError(problem, "closesAt") ? "task-closes-at-error" : undefined
            }
            aria-invalid={Boolean(adminFieldError(problem, "closesAt"))}
            disabled={pending}
            onChange={(event) => setClosesAt(event.currentTarget.value)}
            required
            type="datetime-local"
            value={closesAt}
          />
          <FieldError id="task-closes-at-error" message={adminFieldError(problem, "closesAt")} />
        </label>
      ) : null}
      <label className="civic-field">
        <span>운영 사유</span>
        <textarea
          aria-describedby={adminFieldError(problem, "reason") ? "task-reason-error" : undefined}
          aria-invalid={Boolean(adminFieldError(problem, "reason"))}
          disabled={pending}
          onChange={(event) => setReason(event.currentTarget.value)}
          rows={2}
          value={reason}
        />
        <FieldError id="task-reason-error" message={adminFieldError(problem, "reason")} />
      </label>
      <button
        className={action === "cancel" ? "civic-danger-action" : "civic-primary-action"}
        disabled={pending}
        type="submit"
      >
        {pending ? "최신 상태 확인 중…" : lifecycleActionLabel(action)}
      </button>
    </form>
  );
}

function TaskCloseConfirmation({ taskId }: Readonly<{ taskId: string | null }>) {
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(
    taskId ? "" : "과업 목록에서 조기 종료할 대상을 선택해 주세요.",
  );
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<AdminProblem | null>(null);

  useEffect(() => {
    if (!taskId) return;
    const timer = window.setTimeout(() => {
      void requestTaskDetail(taskId).then((detail) => {
        if (!detail) return setMessage("과업 상세를 불러오지 못했습니다.");
        setTask(detail.task);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [taskId]);

  async function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || pending) return;
    if (task.status !== "OPEN") return setMessage("진행 중인 과업만 조기 종료할 수 있습니다.");
    setPending(true);
    setProblem(null);
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/tasks/${encodeURIComponent(task.id)}/close`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: optionalText(reason) }),
        },
      );
      if (!response.ok) {
        const nextProblem = await readAdminProblem(response);
        setProblem(nextProblem);
        setMessage(formatAdminProblem(nextProblem));
        const latest = await requestTaskDetail(task.id);
        if (latest) setTask(latest.task);
        return;
      }
      const closed = readTask(await response.json());
      if (!closed) return setMessage("서버의 조기 종료 응답 형식을 확인해야 합니다.");
      router.push(`/admin/tasks/detail?taskId=${encodeURIComponent(closed.id)}` as Route);
    } catch {
      const latest = await requestTaskDetail(task.id);
      if (latest) setTask(latest.task);
      setMessage("종료 결과가 불명확하여 최신 상태를 다시 확인했습니다. 자동 재전송하지 않습니다.");
    } finally {
      setPending(false);
    }
  }

  if (!task) return <StatusMessage>{message || "과업 상태를 확인하는 중입니다."}</StatusMessage>;
  return (
    <form className="civic-domain-action-panel civic-domain-danger-panel" onSubmit={close}>
      <header>
        <span>되돌릴 수 없는 작업</span>
        <h2>{task.title}</h2>
      </header>
      <dl className="civic-domain-impact-list">
        <div>
          <dt>현재 상태</dt>
          <dd>{taskStatusLabel(task.status)}</dd>
        </div>
        <div>
          <dt>신규 제출</dt>
          <dd>확정 즉시 차단</dd>
        </div>
        <div>
          <dt>기존 제출</dt>
          <dd>유지 후 결과 집계</dd>
        </div>
        <div>
          <dt>종료 유형</dt>
          <dd>조기 종료</dd>
        </div>
      </dl>
      <label className="civic-field">
        <span>운영 사유</span>
        <textarea
          aria-describedby={
            adminFieldError(problem, "reason") ? "task-close-reason-error" : undefined
          }
          aria-invalid={Boolean(adminFieldError(problem, "reason"))}
          disabled={pending}
          onChange={(event) => setReason(event.currentTarget.value)}
          rows={4}
          value={reason}
        />
        <FieldError id="task-close-reason-error" message={adminFieldError(problem, "reason")} />
      </label>
      <div className="civic-form-actions">
        <Link href={`/admin/tasks/detail?taskId=${encodeURIComponent(task.id)}` as Route}>
          취소
        </Link>
        <button
          className="civic-danger-action"
          disabled={pending || task.status !== "OPEN"}
          type="submit"
        >
          {pending ? "최신 상태 확인 중…" : "조기 종료 확정"}
        </button>
      </div>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </form>
  );
}

function TaskResultView({ taskId }: Readonly<{ taskId: string | null }>) {
  const [task, setTask] = useState<Task | null>(null);
  const [summary, setSummary] = useState<TaskResultSummary | null>(null);
  const [message, setMessage] = useState(taskId ? "" : "과업 상세에서 결과 대상을 선택해 주세요.");

  useEffect(() => {
    if (!taskId) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const detail = await requestTaskDetail(taskId);
        if (!detail) return setMessage("과업 상세를 불러오지 못했습니다.");
        setTask(detail.task);
        if (!canReadTaskResult(detail.task)) {
          return setMessage("정상 마감 또는 조기 종료된 과업만 결과를 조회할 수 있습니다.");
        }
        try {
          const response = await authenticatedFetch(
            `/api/v1/admin/tasks/${encodeURIComponent(taskId)}/result-summary`,
            { cache: "no-store" },
          );
          if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
          const result = readTaskResultSummary(await response.json());
          if (!result) return setMessage("서버의 정량 결과 응답 형식을 확인해야 합니다.");
          setSummary(result);
          setMessage("");
        } catch {
          setMessage("네트워크 오류로 정량 결과를 불러오지 못했습니다.");
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [taskId]);

  if (!task || !summary)
    return <StatusMessage>{message || "확정된 결과를 불러오는 중입니다."}</StatusMessage>;
  return (
    <section className="civic-domain-result">
      <header>
        <span>실제 참여자 응답</span>
        <h2>{task.title}</h2>
        <strong>전체 {summary.responseCount.toLocaleString("ko-KR")}건</strong>
      </header>
      <ol className="civic-result-bars">
        {summary.options.map((option) => {
          const percent =
            summary.responseCount === 0 ? 0 : (option.count / summary.responseCount) * 100;
          return (
            <li key={option.key}>
              <div>
                <strong>{option.content}</strong>
                <span>
                  {option.count.toLocaleString("ko-KR")}건 · {percent.toFixed(1)}%
                </span>
              </div>
              <progress max={100} value={percent}>
                {percent.toFixed(1)}%
              </progress>
            </li>
          );
        })}
      </ol>
      <div className="civic-form-actions">
        <Link href={`/admin/tasks/detail?taskId=${encodeURIComponent(task.id)}` as Route}>
          과업 상세
        </Link>
        <AuthenticatedDownloadLink
          className="civic-primary-action"
          href={`/api/v1/admin/tasks/${encodeURIComponent(task.id)}/result-view`}
        >
          상세 결과 JSONL 다운로드
        </AuthenticatedDownloadLink>
      </div>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function TaskSummaryGrid({ task }: Readonly<{ task: Task }>) {
  return (
    <div aria-label="과업 요약" className="civic-user-summary-grid" role="group">
      <Detail label="과업" value={task.title} />
      <Detail label="현재 상태" value={taskStatusLabel(task.status)} />
      <Detail label="시작" value={formatDate(task.openedAt ?? task.schedule?.opensAt ?? null)} />
      <Detail label="마감" value={formatDate(task.schedule?.closesAt ?? task.closedAt)} />
      <Detail label="종료 유형" value={closureLabel(task.closureType)} />
      <Detail label="최근 변경" value={formatDate(task.updatedAt)} />
    </div>
  );
}

function LifecycleHistory({ events }: Readonly<{ events: TaskDetail["lifecycleHistory"] }>) {
  return (
    <section className="civic-domain-history">
      <h2>운영 이력</h2>
      {events.length === 0 ? <p>아직 기록된 상태 변경이 없습니다.</p> : null}
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <div>
              <strong>{lifecycleEventLabel(event.eventType)}</strong>
              <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
            </div>
            <p>
              {statusTransition(event.previousStatus, event.newStatus)}
              {event.reason ? ` · ${event.reason}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function lifecycleRequest(
  action: LifecycleAction,
  task: Task,
  values: LifecycleValues,
):
  | Readonly<{ body: Record<string, string | null>; method: "POST" | "PUT"; path: string }>
  | Readonly<{ error: string }> {
  const base = `/api/v1/admin/tasks/${encodeURIComponent(task.id)}`;
  const reason = optionalText(values.reason);
  if (action === "schedule" || action === "reschedule") {
    const opensAt = toUtc(values.opensAt);
    const closesAt = toUtc(values.closesAt);
    if (!opensAt || !closesAt) return { error: "시작과 마감 시각을 입력해 주세요." };
    if (new Date(closesAt) <= new Date(opensAt))
      return { error: "마감 시각은 시작 시각보다 뒤여야 합니다." };
    return {
      path: `${base}/schedule`,
      method: action === "schedule" ? "POST" : "PUT",
      body: { opensAt, closesAt, reason },
    };
  }
  if (action === "open-now" || action === "deadline") {
    const closesAt = toUtc(values.closesAt);
    if (!closesAt || new Date(closesAt) <= new Date())
      return { error: "마감 시각은 현재보다 미래여야 합니다." };
    return {
      path: `${base}/${action}`,
      method: action === "deadline" ? "PUT" : "POST",
      body: { closesAt, reason },
    };
  }
  return { path: `${base}/${action}`, method: "POST", body: { reason } };
}

function lifecycleActions(status: TaskStatus): readonly LifecycleAction[] {
  if (status === "DRAFT") return ["schedule", "open-now", "cancel"];
  if (status === "SCHEDULED") return ["reschedule", "start-now", "cancel"];
  if (status === "OPEN") return ["deadline", "cancel"];
  return [];
}

async function requestTaskDetail(taskId: string): Promise<TaskDetail | null> {
  try {
    const response = await authenticatedFetch(`/api/v1/admin/tasks/${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    });
    return response.ok ? readTaskDetail(await response.json()) : null;
  } catch {
    return null;
  }
}

function validateDraft(
  title: string,
  question: string,
  options: readonly DraftOption[],
): string | null {
  if (!title.trim()) return "과업 제목을 입력해 주세요.";
  if (!question.trim()) return "질문을 입력해 주세요.";
  if (options.length < 2) return "선택지를 두 개 이상 입력해 주세요.";
  const normalized = options.map((option) => option.content.trim().replace(/\s+/gu, " "));
  if (normalized.some((option) => !option)) return "모든 선택지 내용을 입력해 주세요.";
  if (new Set(normalized).size !== normalized.length)
    return "같은 내용의 선택지는 중복해서 사용할 수 없습니다.";
  return null;
}

function firstQueryValue(value: string | readonly string[] | undefined): string | null {
  return typeof value === "string" ? value : (value?.[0] ?? null);
}

function toUtc(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function optionalText(value: string): string | null {
  return value.trim() || null;
}

function taskStatusLabel(status: TaskStatus): string {
  return { DRAFT: "작성 중", SCHEDULED: "예약", OPEN: "진행 중", CLOSED: "종료" }[status];
}

function TaskStatusBadge({ status }: Readonly<{ status: TaskStatus }>) {
  return (
    <span className={`civic-domain-status is-${status.toLowerCase()}`}>
      {taskStatusLabel(status)}
    </span>
  );
}

function closureLabel(value: Task["closureType"]): string {
  if (!value) return "—";
  return {
    EARLY_CLOSED: "조기 종료",
    DEADLINE_REACHED: "마감 도달",
    CANCELLED: "취소",
    MISSED_SCHEDULE: "예약 미실행",
  }[value];
}

function lifecycleActionLabel(action: LifecycleAction): string {
  return {
    schedule: "예약 발행",
    reschedule: "예약 변경",
    "open-now": "즉시 발행",
    "start-now": "지금 시작",
    deadline: "마감 변경",
    cancel: "과업 취소",
  }[action];
}

function lifecycleEventLabel(event: string): string {
  return (
    {
      SCHEDULED: "예약 발행",
      RESCHEDULED: "예약·마감 변경",
      OPENED: "과업 시작",
      CLOSED: "과업 종료",
      CANCELLED: "과업 취소",
    }[event] ?? "상태 변경"
  );
}

function statusTransition(previous: TaskStatus | null, next: TaskStatus | null): string {
  if (!previous && next) return taskStatusLabel(next);
  if (previous && next) return `${taskStatusLabel(previous)} → ${taskStatusLabel(next)}`;
  return "상태 기록";
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusMessage({ children }: Readonly<{ children: string }>) {
  return (
    <p aria-live="polite" className="civic-form-message" role="status">
      {children}
    </p>
  );
}

function FieldError({ id, message }: Readonly<{ id: string; message: string | null }>) {
  return message ? (
    <small className="civic-field-error" id={id}>
      {message}
    </small>
  ) : null;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(date);
}

function taskLayout(id: string): string {
  return (
    {
      "A-TASK-001": "task-list",
      "A-TASK-002": "task-editor",
      "A-TASK-003": "task-detail",
      "A-TASK-004": "task-close",
      "A-TASK-005": "task-results",
    }[id] ?? "task-admin"
  );
}
