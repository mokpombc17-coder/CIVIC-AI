import type { ChatMessageAppendSource } from "@/components/chat/chat-message-viewport-state";

export type ChatMessageViewportPhase = "waiting" | "positioning" | "settled";

export type ChatMessageViewportPin = "pinned" | "detached";

export type ChatMessageViewportJob =
  | Readonly<{
      byLatestIntent: boolean;
      id: number;
      kind: "initial";
    }>
  | Readonly<{
      id: number;
      kind: "latest" | "anchor" | "resize";
    }>;

export type ChatMessageViewportPendingFollow = "if-pinned" | "always";

export type ChatMessageViewportPositionState = Readonly<{
  intent: "latest" | null;
  job: ChatMessageViewportJob | null;
  nextJobId: number;
  pendingFollow: ChatMessageViewportPendingFollow | null;
  phase: ChatMessageViewportPhase;
  pin: ChatMessageViewportPin;
}>;

export type ChatMessageViewportPositionEvent =
  | Readonly<{
      type: "viewport-changed";
      continuityChanged: boolean;
    }>
  | Readonly<{
      type: "target-resolved";
      hasItems: boolean;
      hasTarget: boolean;
      isAtEnd: boolean;
    }>
  | Readonly<{
      type: "job-settled";
      isAtEnd: boolean;
      jobId: number;
    }>
  | Readonly<{
      type: "user-scrolled";
      isAtEnd: boolean;
    }>
  | Readonly<{
      type: "scroll-observed";
      isAtEnd: boolean;
    }>
  | Readonly<{
      type: "messages-appended";
      hasMessages: boolean;
      hasSystemActivity: boolean;
      source: ChatMessageAppendSource;
    }>
  | Readonly<{
      type: "latest-requested";
      navigatesContext: boolean;
    }>
  | Readonly<{
      type: "newer-page-appended";
    }>
  | Readonly<{
      type: "older-anchor-rendered";
    }>
  | Readonly<{
      type: "viewport-resized";
    }>;

export function createChatMessageViewportPositionState(): ChatMessageViewportPositionState {
  return {
    intent: null,
    job: null,
    nextJobId: 1,
    pendingFollow: null,
    phase: "waiting",
    pin: "detached",
  };
}

export function reduceChatMessageViewportPosition(
  state: ChatMessageViewportPositionState,
  event: ChatMessageViewportPositionEvent,
): ChatMessageViewportPositionState {
  switch (event.type) {
    case "viewport-changed": {
      // 같은 timeline이면 목록이 그대로라 보던 위치를 유지함
      // 단 "최신 대화로 이동"을 눌러 돌아온 경우에는 최신 메시지로 이동함
      if (!event.continuityChanged && state.phase === "settled") {
        const preserved = { ...state, job: null, pendingFollow: null };
        return state.intent === "latest" ? startJob(preserved, { kind: "latest" }) : preserved;
      }

      return {
        ...state,
        job: null,
        pendingFollow: null,
        phase: "waiting",
        pin: "detached",
      };
    }

    case "target-resolved": {
      if (state.phase !== "waiting") {
        return state;
      }

      if (state.intent === "latest" && event.hasItems) {
        return startJob(
          { ...state, phase: "positioning" },
          { byLatestIntent: true, kind: "initial" },
        );
      }

      if (event.hasTarget) {
        return startJob(
          { ...state, phase: "positioning" },
          { byLatestIntent: false, kind: "initial" },
        );
      }

      return settle(state, event.isAtEnd);
    }

    case "job-settled": {
      if (state.job === null || state.job.id !== event.jobId) {
        return state;
      }

      const settledJob = state.job;
      const clearsIntent =
        settledJob.kind === "latest" ||
        (settledJob.kind === "initial" && settledJob.byLatestIntent);
      const settled = settle(
        {
          ...state,
          intent: clearsIntent ? null : state.intent,
          pendingFollow: null,
        },
        event.isAtEnd,
      );

      if (
        state.pendingFollow === "always" ||
        (state.pendingFollow === "if-pinned" && settled.pin === "pinned")
      ) {
        return startJob({ ...settled, pin: "pinned" }, { kind: "latest" });
      }

      return settled;
    }

    case "user-scrolled": {
      if (state.phase === "waiting") {
        return state;
      }

      // 사용자가 직접 스크롤하면 진행 중인 자동 이동을 멈추고 사용자가 둔 위치에 머묾
      // 자동 이동이 끝난 뒤 최신 메시지로 가려던 예약도 취소함
      const cancelsIntent =
        state.job?.kind === "latest" || (state.job?.kind === "initial" && state.job.byLatestIntent);
      return settle(
        {
          ...state,
          intent: cancelsIntent ? null : state.intent,
          pendingFollow: null,
        },
        event.isAtEnd,
      );
    }

    case "scroll-observed": {
      // 자동 이동 중의 scroll은 코드가 움직인 것이고 위치를 잡기 전의 scroll은 목록이 바뀌며 브라우저가 보정한 것이라 하단 여부 판단에 쓰지 않음
      if (state.phase !== "settled" || state.job !== null) {
        return state;
      }

      return withPin(state, event.isAtEnd ? "pinned" : "detached");
    }

    case "messages-appended": {
      if (!event.hasMessages && !event.hasSystemActivity) {
        return state;
      }

      const isCurrentUser = event.hasMessages && event.source === "current-user";

      if (state.phase === "waiting") {
        return state;
      }

      if (state.phase === "settled" && state.job === null) {
        const followsLatest = isCurrentUser || state.pin === "pinned";

        return followsLatest ? startJob({ ...state, pin: "pinned" }, { kind: "latest" }) : state;
      }

      if (state.job?.kind === "latest" && (isCurrentUser || state.pin === "pinned")) {
        return startJob({ ...state, pin: "pinned" }, { kind: "latest" });
      }

      // 다른 자동 이동 중에 온 메시지는 바로 하단으로 가지 않고 이동이 끝난 뒤로 예약함
      // 이동이 하단에서 끝나면 최신 메시지로 이동하고 내 메시지는 위치와 관계없이 이동함
      const pendingFollow =
        isCurrentUser || state.pendingFollow === "always" ? "always" : "if-pinned";

      return state.pendingFollow === pendingFollow ? state : { ...state, pendingFollow };
    }

    case "latest-requested": {
      const intended = { ...state, intent: "latest" as const };

      if (event.navigatesContext || state.phase === "waiting") {
        return intended;
      }

      if (state.phase === "positioning") {
        return startJob(intended, { byLatestIntent: true, kind: "initial" });
      }

      return startJob({ ...intended, pendingFollow: null, pin: "pinned" }, { kind: "latest" });
    }

    case "newer-page-appended": {
      if (state.phase !== "settled") {
        return state;
      }

      // 화면이 목록 맨 아래에 붙어 있으면 아래에 메시지가 붙을 때마다 화면이 자동으로 따라 내려감
      // 스크롤로 불러온 기존 메시지가 붙을 때는 따라 내려가면 안 되므로 목록 맨 아래에 붙어 있는 상태를 해제함
      // 진행 중이던 맨 아래 맞춤 이동도 멈춤. 계속하면 내려간 끝에서 또 불러오기가 일어나 끝없이 반복됨
      const job = state.job?.kind === "latest" || state.job?.kind === "resize" ? null : state.job;
      return job === state.job && state.pin === "detached"
        ? state
        : { ...state, job, pin: "detached" };
    }

    case "older-anchor-rendered": {
      // 이미 최신 메시지로 이동 중이면 과거 이력을 읽던 위치로 되돌리지 않음
      if (state.phase !== "settled" || state.job?.kind === "latest") {
        return state;
      }

      return startJob(state, { kind: "anchor" });
    }

    case "viewport-resized": {
      if (state.phase === "waiting") {
        return state;
      }

      switch (state.job?.kind) {
        case "initial":
          // 진입 위치로 이동하는 중에 화면 크기가 바뀌어도 이동을 다시 시작하지 않음
          // 이동이 하단에서 끝나면 그때 하단에 다시 맞춤
          return state.pendingFollow === null ? { ...state, pendingFollow: "if-pinned" } : state;
        case "latest":
          return startJob(state, { kind: "latest" });
        case "resize":
          return startJob(state, { kind: "resize" });
        case "anchor":
          return state;
        case undefined:
          return state.pin === "pinned" ? startJob(state, { kind: "resize" }) : state;
      }
    }
  }
}

export function shouldCountUnseenChatMessages(
  state: ChatMessageViewportPositionState,
  event: Extract<ChatMessageViewportPositionEvent, { type: "messages-appended" }>,
): boolean {
  if (!event.hasMessages || event.source === "current-user" || state.phase === "waiting") {
    return false;
  }

  // 다른 사용자 메시지 중 바로 하단으로 따라가지 않는 메시지만 새 메시지 개수에 셈
  const next = reduceChatMessageViewportPosition(state, event);
  return !(next.job?.kind === "latest" && next.job.id !== state.job?.id);
}

type ChatMessageViewportJobRequest =
  | Readonly<{
      byLatestIntent: boolean;
      kind: "initial";
    }>
  | Readonly<{
      kind: "latest" | "anchor" | "resize";
    }>;

function startJob(
  state: ChatMessageViewportPositionState,
  request: ChatMessageViewportJobRequest,
): ChatMessageViewportPositionState {
  return {
    ...state,
    job: { ...request, id: state.nextJobId },
    nextJobId: state.nextJobId + 1,
  };
}

function settle(
  state: ChatMessageViewportPositionState,
  isAtEnd: boolean,
): ChatMessageViewportPositionState {
  return {
    ...state,
    job: null,
    phase: "settled",
    pin: isAtEnd ? "pinned" : "detached",
  };
}

function withPin(
  state: ChatMessageViewportPositionState,
  pin: ChatMessageViewportPin,
): ChatMessageViewportPositionState {
  return state.pin === pin ? state : { ...state, pin };
}
