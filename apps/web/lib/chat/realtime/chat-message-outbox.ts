import { chatMessageSendRequestSchema } from "./chat-stomp-contracts";
import { getChatMessageCommandFailurePresentation } from "./chat-message-command-presentation";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import type {
  ChatMessageCommandEvent,
  ChatRealtimeTransport,
  ChatRoomMessageSendCommand,
} from "./chat-realtime-transport";

export type ChatOutgoingMessageStatus =
  "queued" | "sending" | "retry-waiting" | "accepted" | "failed" | "cancelled";

export type ChatOutgoingMessage = Readonly<{
  attempt: number;
  clientMessageId: string;
  content: string;
  enqueuedAt: number;
  generation: number;
  message: string | null;
  retryAt: number | null;
  roomId: string;
  status: ChatOutgoingMessageStatus;
}>;

type EnqueueChatOutgoingMessageInput = Readonly<{
  clientMessageId: string;
  content: string;
  generation: number;
  roomId: string;
}>;

type ChatMessageOutboxOptions = Readonly<{
  now?: () => number;
}>;

export class ChatMessageOutbox {
  private attachmentCount = 0;
  private readonly listeners = new Set<() => void>();
  private readonly messages = new Map<string, ChatOutgoingMessage>();
  private readonly now: () => number;
  private snapshot: readonly ChatOutgoingMessage[] = Object.freeze([]);
  private transportSubscriptions: (() => void)[] = [];

  constructor(
    private readonly transport: Pick<
      ChatRealtimeTransport,
      "observeMessageCommandEvent" | "observeMessageDeliveryLifecycle" | "sendRoomMessage"
    >,
    { now = Date.now }: ChatMessageOutboxOptions = {},
  ) {
    this.now = now;
  }

  attach(): () => void {
    this.attachmentCount += 1;

    if (this.attachmentCount === 1) {
      this.transportSubscriptions = [
        this.transport.observeMessageCommandEvent(this.handleCommandEvent),
        this.transport.observeMessageDeliveryLifecycle(this.handleDeliveryLifecycle),
      ];
    }

    let attached = true;

    return () => {
      if (!attached) {
        return;
      }

      attached = false;
      this.attachmentCount -= 1;

      if (this.attachmentCount === 0) {
        this.transportSubscriptions.forEach((unsubscribe) => unsubscribe());
        this.transportSubscriptions = [];
      }
    };
  }

  readonly getSnapshot = (): readonly ChatOutgoingMessage[] => this.snapshot;

  readonly observe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  enqueue(input: EnqueueChatOutgoingMessageInput): ChatOutgoingMessage {
    const request = chatMessageSendRequestSchema.parse({
      clientMessageId: input.clientMessageId,
      content: input.content,
    });
    const command: ChatRoomMessageSendCommand = {
      request,
      roomId: input.roomId,
    };

    if (this.messages.has(request.clientMessageId)) {
      throw new Error(`clientMessageId ${request.clientMessageId}는 이미 outbox에 있습니다.`);
    }

    const message: ChatOutgoingMessage = Object.freeze({
      attempt: 0,
      clientMessageId: request.clientMessageId,
      content: request.content,
      enqueuedAt: this.readNow(),
      generation: input.generation,
      message: null,
      retryAt: null,
      roomId: input.roomId,
      status: "queued",
    });
    this.messages.set(message.clientMessageId, message);
    this.publishSnapshot();

    try {
      this.transport.sendRoomMessage(command);
    } catch (cause) {
      this.update(message.clientMessageId, {
        message: cause instanceof Error ? cause.message : "메시지 전송 명령을 시작하지 못했습니다.",
        status: "failed",
      });
    }

    return this.messages.get(message.clientMessageId) ?? message;
  }

  acknowledgeConfirmed(roomId: string, clientMessageIds: ReadonlySet<string>): number {
    let removed = 0;

    for (const [clientMessageId, message] of this.messages) {
      if (message.roomId === roomId && clientMessageIds.has(clientMessageId)) {
        this.messages.delete(clientMessageId);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.publishSnapshot();
    }

    return removed;
  }

  private readonly handleDeliveryLifecycle = (event: ChatMessageDeliveryLifecycleEvent): void => {
    const current = this.messages.get(event.clientMessageId);

    if (!current || current.roomId !== event.roomId || current.generation !== event.generation) {
      return;
    }

    switch (event.status) {
      case "queued":
      case "sending":
      case "retry-waiting":
        this.update(event.clientMessageId, {
          attempt: event.attempt,
          message: null,
          retryAt: event.retryAt,
          status: event.status,
        });
        return;
      case "sent":
        this.update(event.clientMessageId, {
          attempt: event.attempt,
          message: null,
          retryAt: null,
          status: "accepted",
        });
        return;
      case "failed":
        this.update(event.clientMessageId, {
          attempt: event.attempt,
          message: getDeliveryFailureMessage(event.reason),
          retryAt: null,
          status: "failed",
        });
        return;
      case "cancelled":
        this.update(event.clientMessageId, {
          attempt: event.attempt,
          message: "채팅방 연결 상태가 변경되어 메시지 전송이 취소되었습니다.",
          retryAt: null,
          status: "cancelled",
        });
    }
  };

  private readonly handleCommandEvent = (event: ChatMessageCommandEvent): void => {
    const clientMessageId =
      event.kind === "result" ? event.result.clientMessageId : event.clientMessageId;
    const current = this.messages.get(clientMessageId);

    if (!current || current.roomId !== event.roomId) {
      return;
    }

    const failure = getChatMessageCommandFailurePresentation(event);

    if (!failure) {
      this.update(clientMessageId, {
        message: null,
        retryAt: null,
        status: "accepted",
      });
      return;
    }

    this.update(clientMessageId, {
      message: failure.message,
      retryAt: null,
      status: "failed",
    });
  };

  private update(
    clientMessageId: string,
    patch: Partial<Omit<ChatOutgoingMessage, "clientMessageId">>,
  ): void {
    const current = this.messages.get(clientMessageId);

    if (!current) {
      return;
    }

    this.messages.set(
      clientMessageId,
      Object.freeze({
        ...current,
        ...patch,
      }),
    );
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    this.snapshot = Object.freeze(
      [...this.messages.values()].sort(
        (left, right) =>
          left.enqueuedAt - right.enqueuedAt ||
          left.clientMessageId.localeCompare(right.clientMessageId),
      ),
    );
    this.listeners.forEach((listener) => listener());
  }

  private readNow(): number {
    const now = this.now();

    if (!Number.isSafeInteger(now) || now < 0) {
      throw new RangeError("outbox 현재 시각은 0 이상의 안전한 정수여야 합니다.");
    }

    return now;
  }
}

function getDeliveryFailureMessage(reason: string | null): string {
  switch (reason) {
    case "MAX_ATTEMPTS_REACHED":
      return "메시지 자동 재전송 횟수를 초과했습니다.";
    case "MAX_ELAPSED_TIME_REACHED":
      return "메시지 자동 재전송 제한 시간을 초과했습니다.";
    case "COMMAND_RESULT_TIMEOUT":
      return "채팅 서버의 메시지 처리 결과를 시간 안에 받지 못했습니다.";
    case "DELIVERY_CONTEXT_STALE":
      return "현재 채팅방 상태가 변경되어 메시지를 전송하지 못했습니다.";
    default:
      return "메시지를 전송하지 못했습니다.";
  }
}
