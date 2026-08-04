import type { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import {
  chatMessageDeleteRequestSchema,
  chatMessageEditRequestSchema,
  chatMessageSendRequestSchema,
  chatRoomSubscriptionSyncRequestSchema,
  type ChatMessageDeleteRequest,
  type ChatMessageEditRequest,
  type ChatMessageSendRequest,
} from "./chat-stomp-contracts";
import {
  CHAT_COMMAND_RESULTS_DESTINATION,
  CHAT_ROOM_INBOX_EVENTS_DESTINATION,
  CHAT_SYSTEM_EVENTS_DESTINATION,
  getChatRoomEventsDestination,
  getChatRoomMessageDeleteDestination,
  getChatRoomMessageEditDestination,
  getChatRoomMessageSendDestination,
  getChatRoomMessagesDestination,
  getChatRoomSubscriptionSyncDestination,
} from "./chat-stomp-destinations";

export type ChatStompSubscriptionClient = Pick<Client, "publish" | "subscribe">;

type ChatStompSubscriptionCallbacks = Readonly<{
  onCommandResult?: (message: IMessage) => void;
  onRoomInboxEvent?: (message: IMessage) => void;
  onRoomEvent?: (roomId: string, message: IMessage) => void;
  onRoomMessage?: (roomId: string, message: IMessage) => void;
  onSystemEvent?: (message: IMessage) => void;
}>;

type RoomSubscriptions = Readonly<{
  roomId: string;
  messages: StompSubscription;
  roomEvents: StompSubscription;
}>;

export class ChatStompSubscriptionManager {
  private commonSubscriptions: StompSubscription[] = [];
  private isConnected = false;
  private roomId: string | null = null;
  private roomSubscriptions: RoomSubscriptions | null = null;

  constructor(
    private readonly client: ChatStompSubscriptionClient,
    private readonly callbacks: ChatStompSubscriptionCallbacks = {},
  ) {}

  get activeRoomId(): string | null {
    return this.roomId;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  connect(): void {
    this.isConnected = true;
    this.forgetSubscriptionReferences();

    try {
      this.subscribeCommonQueues();
    } catch (cause) {
      this.isConnected = false;
      this.forgetSubscriptionReferences();
      throw cause;
    }

    if (this.roomId) {
      this.subscribeRoom(this.roomId);
    }
  }

  disconnect(): void {
    this.isConnected = false;
    this.forgetSubscriptionReferences();
  }

  activateRoom(roomId: string): void {
    if (!this.isConnected) {
      this.roomId = roomId;
      return;
    }

    if (this.roomSubscriptions?.roomId === roomId) {
      this.roomId = roomId;
      return;
    }

    try {
      this.unsubscribeRoom();
      this.subscribeRoom(roomId);
      this.roomId = roomId;
    } catch (cause) {
      this.roomId = null;
      throw cause;
    }
  }

  resubscribeRoom(roomId: string): void {
    if (!this.isConnected || this.roomId !== roomId || this.roomSubscriptions?.roomId !== roomId) {
      throw new Error("활성 방의 STOMP topic 구독이 준비되지 않았습니다.");
    }

    try {
      this.unsubscribeRoom();
      this.subscribeRoom(roomId);
    } catch (cause) {
      this.roomId = null;
      throw cause;
    }
  }

  syncRoomSubscriptions(roomId: string, requestId: string): void {
    if (!this.isConnected || this.roomId !== roomId || this.roomSubscriptions?.roomId !== roomId) {
      throw new Error("활성 방의 STOMP topic 구독이 준비되지 않았습니다.");
    }

    const request = chatRoomSubscriptionSyncRequestSchema.parse({ requestId });

    this.client.publish({
      destination: getChatRoomSubscriptionSyncDestination(roomId),
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
  }

  sendRoomMessage(roomId: string, input: ChatMessageSendRequest): void {
    this.assertRoomReady(roomId);
    const request = chatMessageSendRequestSchema.parse(input);

    this.client.publish({
      destination: getChatRoomMessageSendDestination(roomId),
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
  }

  editRoomMessage(roomId: string, input: ChatMessageEditRequest): void {
    this.assertRoomReady(roomId);
    const request = chatMessageEditRequestSchema.parse(input);

    this.client.publish({
      destination: getChatRoomMessageEditDestination(roomId),
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
  }

  deleteRoomMessage(roomId: string, input: ChatMessageDeleteRequest): void {
    this.assertRoomReady(roomId);
    const request = chatMessageDeleteRequestSchema.parse(input);

    this.client.publish({
      destination: getChatRoomMessageDeleteDestination(roomId),
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
  }

  releaseRoom(roomId: string): void {
    if (this.roomId !== roomId) {
      return;
    }

    if (this.isConnected) {
      try {
        this.unsubscribeRoom();
      } finally {
        this.roomId = null;
      }
      return;
    }

    this.roomId = null;
  }

  private subscribeCommonQueues(): void {
    const subscriptions: StompSubscription[] = [];

    try {
      subscriptions.push(
        this.client.subscribe(
          CHAT_SYSTEM_EVENTS_DESTINATION,
          this.callbacks.onSystemEvent ?? ignoreStompMessage,
        ),
      );
      subscriptions.push(
        this.client.subscribe(
          CHAT_COMMAND_RESULTS_DESTINATION,
          this.callbacks.onCommandResult ?? ignoreStompMessage,
        ),
      );
      subscriptions.push(
        this.client.subscribe(
          CHAT_ROOM_INBOX_EVENTS_DESTINATION,
          this.callbacks.onRoomInboxEvent ?? ignoreStompMessage,
        ),
      );
      this.commonSubscriptions = subscriptions;
    } catch (cause) {
      subscriptions.forEach((subscription) => {
        try {
          subscription.unsubscribe();
        } catch {
          // Preserve the original subscription setup failure.
        }
      });
      throw cause;
    }
  }

  private assertRoomReady(roomId: string): void {
    if (!this.isConnected || this.roomId !== roomId || this.roomSubscriptions?.roomId !== roomId) {
      throw new Error("활성 방의 STOMP topic 구독이 준비되지 않았습니다.");
    }
  }

  private subscribeRoom(roomId: string): void {
    const messages = this.client.subscribe(getChatRoomMessagesDestination(roomId), (message) =>
      this.callbacks.onRoomMessage?.(roomId, message),
    );

    try {
      const roomEvents = this.client.subscribe(getChatRoomEventsDestination(roomId), (message) =>
        this.callbacks.onRoomEvent?.(roomId, message),
      );
      this.roomSubscriptions = {
        roomId,
        messages,
        roomEvents,
      };
    } catch (cause) {
      try {
        messages.unsubscribe();
      } catch {
        // Preserve the room-events subscription failure.
      }
      throw cause;
    }
  }

  private unsubscribeRoom(): void {
    const subscriptions = this.roomSubscriptions;

    if (!subscriptions) {
      return;
    }

    this.roomSubscriptions = null;
    let failure: unknown;

    try {
      subscriptions.messages.unsubscribe();
    } catch (cause) {
      failure = cause;
    }

    try {
      subscriptions.roomEvents.unsubscribe();
    } catch (cause) {
      failure ??= cause;
    }

    if (failure) {
      throw failure;
    }
  }

  private forgetSubscriptionReferences(): void {
    this.commonSubscriptions = [];
    this.roomSubscriptions = null;
  }
}

function ignoreStompMessage(): undefined {
  return undefined;
}
