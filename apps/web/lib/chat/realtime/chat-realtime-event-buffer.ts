import type { ChatMessageEvent, ChatRoomEventEnvelope } from "./chat-stomp-contracts";

export const DEFAULT_CHAT_REALTIME_EVENT_BUFFER_CAPACITY = 500;

export type ChatRealtimeBufferedEvent =
  | Readonly<{
      bufferSequence: number;
      kind: "message";
      event: ChatMessageEvent;
    }>
  | Readonly<{
      bufferSequence: number;
      kind: "room";
      event: ChatRoomEventEnvelope;
    }>;

type UnsequencedChatRealtimeEvent =
  | Readonly<{
      kind: "message";
      event: ChatMessageEvent;
    }>
  | Readonly<{
      kind: "room";
      event: ChatRoomEventEnvelope;
    }>;

export type ChatRealtimeEventBufferSnapshot = Readonly<{
  roomId: string;
  generation: number;
  events: readonly ChatRealtimeBufferedEvent[];
  throughBufferSequence: number;
  overflowed: boolean;
  invalidEventCount: number;
}>;

export type ChatRealtimeEventDelivery = ChatRealtimeEventBufferSnapshot &
  Readonly<{
    deliveryId: string;
  }>;

type ActiveBuffer = {
  roomId: string;
  generation: number;
  events: ChatRealtimeBufferedEvent[];
  nextBufferSequence: number;
  lastDroppedBufferSequence: number | null;
  invalidEventCount: number;
};

export class ChatRealtimeEventBuffer {
  private activeBuffer: ActiveBuffer | null = null;

  constructor(private readonly capacity = DEFAULT_CHAT_REALTIME_EVENT_BUFFER_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("실시간 이벤트 버퍼 크기는 1 이상의 안전한 정수여야 합니다.");
    }
  }

  begin(roomId: string, generation: number): void {
    if (this.activeBuffer?.roomId === roomId && this.activeBuffer.generation === generation) {
      return;
    }

    this.activeBuffer = {
      roomId,
      generation,
      events: [],
      nextBufferSequence: 1,
      lastDroppedBufferSequence: null,
      invalidEventCount: 0,
    };
  }

  clear(roomId?: string, generation?: number): void {
    const activeBuffer = this.activeBuffer;

    if (
      !activeBuffer ||
      (roomId !== undefined && activeBuffer.roomId !== roomId) ||
      (generation !== undefined && activeBuffer.generation !== generation)
    ) {
      return;
    }

    this.activeBuffer = null;
  }

  appendMessage(roomId: string, generation: number, event: ChatMessageEvent): boolean {
    if (event.payload.roomId !== roomId) {
      return false;
    }

    return this.append(roomId, generation, {
      kind: "message",
      event,
    });
  }

  appendRoomEvent(roomId: string, generation: number, event: ChatRoomEventEnvelope): boolean {
    if (event.payload.roomId !== roomId) {
      return false;
    }

    return this.append(roomId, generation, {
      kind: "room",
      event,
    });
  }

  recordInvalidEvent(roomId: string, generation: number): boolean {
    const activeBuffer = this.getMatchingBuffer(roomId, generation);

    if (!activeBuffer) {
      return false;
    }

    activeBuffer.invalidEventCount += 1;
    return true;
  }

  getSnapshot(): ChatRealtimeEventBufferSnapshot | null {
    const activeBuffer = this.activeBuffer;

    if (!activeBuffer) {
      return null;
    }

    return {
      roomId: activeBuffer.roomId,
      generation: activeBuffer.generation,
      events: [...activeBuffer.events],
      throughBufferSequence: activeBuffer.nextBufferSequence - 1,
      overflowed: activeBuffer.lastDroppedBufferSequence !== null,
      invalidEventCount: activeBuffer.invalidEventCount,
    };
  }

  acknowledge(
    roomId: string,
    generation: number,
    throughBufferSequence: number,
    invalidEventCount: number,
  ): boolean {
    const activeBuffer = this.getMatchingBuffer(roomId, generation);

    if (
      !activeBuffer ||
      !Number.isSafeInteger(throughBufferSequence) ||
      throughBufferSequence < 0 ||
      throughBufferSequence >= activeBuffer.nextBufferSequence ||
      !Number.isSafeInteger(invalidEventCount) ||
      invalidEventCount < 0 ||
      invalidEventCount > activeBuffer.invalidEventCount
    ) {
      return false;
    }

    activeBuffer.events = activeBuffer.events.filter(
      (event) => event.bufferSequence > throughBufferSequence,
    );
    activeBuffer.invalidEventCount -= invalidEventCount;

    if (
      activeBuffer.lastDroppedBufferSequence !== null &&
      activeBuffer.lastDroppedBufferSequence <= throughBufferSequence
    ) {
      activeBuffer.lastDroppedBufferSequence = null;
    }

    return true;
  }

  private append(roomId: string, generation: number, event: UnsequencedChatRealtimeEvent): boolean {
    const activeBuffer = this.getMatchingBuffer(roomId, generation);

    if (!activeBuffer) {
      return false;
    }

    const bufferedEvent: ChatRealtimeBufferedEvent =
      event.kind === "message"
        ? {
            bufferSequence: activeBuffer.nextBufferSequence,
            kind: event.kind,
            event: event.event,
          }
        : {
            bufferSequence: activeBuffer.nextBufferSequence,
            kind: event.kind,
            event: event.event,
          };
    activeBuffer.nextBufferSequence += 1;

    if (activeBuffer.events.length === this.capacity) {
      const droppedEvent = activeBuffer.events.shift();

      if (droppedEvent) {
        activeBuffer.lastDroppedBufferSequence = droppedEvent.bufferSequence;
      }
    }

    activeBuffer.events.push(bufferedEvent);
    return true;
  }

  private getMatchingBuffer(roomId: string, generation: number): ActiveBuffer | null {
    const activeBuffer = this.activeBuffer;

    return activeBuffer?.roomId === roomId && activeBuffer.generation === generation
      ? activeBuffer
      : null;
  }
}
