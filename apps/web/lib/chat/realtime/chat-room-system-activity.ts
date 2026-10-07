import type { RoomParticipationListItem } from "../chat-room-contracts";
import type {
  ChatRealtimeBufferedEvent,
  ChatRealtimeEventDelivery,
} from "./chat-realtime-event-buffer";
import type { ChatRoomEventEnvelope, ChatRoomEventMemberState } from "./chat-stomp-contracts";

export type ChatRoomSystemActivityKind = "joined" | "left" | "banned" | "room-closed";

type ChatRoomSystemActivityBase = Readonly<{
  afterMessageSequence: number;
  emittedAt: string;
  eventKey: string;
  receivedOrder: number;
}>;

type ChatRoomParticipantSystemActivity = ChatRoomSystemActivityBase &
  Readonly<{
    kind: Exclude<ChatRoomSystemActivityKind, "room-closed">;
    participationId: string;
    membershipId: string;
    userLabel: string | null;
  }>;

type ChatRoomClosedSystemActivity = ChatRoomSystemActivityBase &
  Readonly<{
    kind: "room-closed";
    roomId: string;
  }>;

export type ChatRoomSystemActivity =
  ChatRoomParticipantSystemActivity | ChatRoomClosedSystemActivity;

export type ChatRoomSystemActivityJournal = Readonly<{
  activities: readonly ChatRoomSystemActivity[];
  roomId: string;
}>;

type MergeChatRoomSystemActivitiesInput = Readonly<{
  delivery: ChatRealtimeEventDelivery;
  initialLatestMessageSequence: number;
  journal: ChatRoomSystemActivityJournal | undefined;
  messageVisibleAfterSequence: number;
  participantDisplayNames?: ReadonlyMap<string, string>;
  selfMembershipId: string | null;
}>;

export function createEmptyChatRoomSystemActivityJournal(
  roomId: string,
): ChatRoomSystemActivityJournal {
  return Object.freeze({ activities: Object.freeze([]), roomId });
}

export function mergeChatRoomSystemActivities({
  delivery,
  initialLatestMessageSequence,
  journal,
  messageVisibleAfterSequence,
  participantDisplayNames = new Map(),
  selfMembershipId,
}: MergeChatRoomSystemActivitiesInput): ChatRoomSystemActivityJournal | undefined {
  if (journal && journal.roomId !== delivery.roomId) {
    throw new Error(
      `다른 방(${journal.roomId})의 시스템 활동을 ${delivery.roomId}에 병합할 수 없습니다.`,
    );
  }

  let latestMessageSequence = initialLatestMessageSequence;
  let receivedOrder = Math.max(
    0,
    ...(journal?.activities.map(({ receivedOrder }) => receivedOrder) ?? []),
  );
  const activities = [...(journal?.activities ?? [])];
  const seenEventKeys = new Set(activities.map((activity) => activity.eventKey));

  for (const bufferedEvent of delivery.events) {
    if (
      bufferedEvent.kind === "message" &&
      bufferedEvent.event.eventType === "CHAT_MESSAGE_CREATED"
    ) {
      const roomSequence = bufferedEvent.event.payload.roomSequence;

      if (roomSequence > messageVisibleAfterSequence) {
        latestMessageSequence = Math.max(latestMessageSequence, roomSequence);
      }
      continue;
    }

    if (bufferedEvent.kind !== "room") {
      continue;
    }

    const activityState = getSystemActivityState(bufferedEvent);

    if (
      !activityState ||
      (activityState.type === "participant" &&
        activityState.member.membershipId === selfMembershipId)
    ) {
      continue;
    }

    const eventKey =
      activityState.type === "room"
        ? createRoomClosedActivityKey(delivery.roomId)
        : createParticipationActivityKey(
            activityState.member.participationId,
            activityState.kind === "joined" ? "entered" : "ended",
          );

    if (seenEventKeys.has(eventKey)) {
      continue;
    }

    receivedOrder += 1;
    seenEventKeys.add(eventKey);
    if (activityState.type === "room") {
      activities.push(
        Object.freeze({
          afterMessageSequence: latestMessageSequence,
          emittedAt: bufferedEvent.event.emittedAt,
          eventKey,
          kind: "room-closed" as const,
          receivedOrder,
          roomId: delivery.roomId,
        }),
      );
      continue;
    }

    activities.push(
      Object.freeze({
        afterMessageSequence: latestMessageSequence,
        emittedAt: bufferedEvent.event.emittedAt,
        eventKey,
        kind: activityState.kind,
        membershipId: activityState.member.membershipId,
        participationId: activityState.member.participationId,
        receivedOrder,
        userLabel:
          activityState.member.userLabel ??
          participantDisplayNames.get(activityState.member.membershipId) ??
          null,
      }),
    );
  }

  if (activities.length === (journal?.activities.length ?? 0)) {
    return journal;
  }

  return Object.freeze({
    activities: Object.freeze(activities),
    roomId: delivery.roomId,
  });
}

export function createParticipationSystemActivities(
  roomId: string,
  participations: readonly RoomParticipationListItem[],
  selfMembershipId: string | null,
  participantDisplayNames: ReadonlyMap<string, string> = new Map(),
): readonly ChatRoomSystemActivity[] {
  const activities: ChatRoomSystemActivity[] = [];

  participations.forEach((participation, index) => {
    if (participation.membershipId === selfMembershipId) {
      return;
    }

    activities.push(
      Object.freeze({
        afterMessageSequence: participation.enteredAfterMessageSequence,
        emittedAt: participation.joinedAt,
        eventKey: createParticipationActivityKey(participation.participationId, "entered"),
        kind: "joined" as const,
        membershipId: participation.membershipId,
        participationId: participation.participationId,
        receivedOrder: index * 2,
        userLabel:
          participantDisplayNames.get(participation.membershipId) ?? participation.displayName,
      }),
    );

    if (
      participation.status !== "ENDED" ||
      participation.endedAfterMessageSequence === null ||
      participation.endedAt === null ||
      participation.endReason === null ||
      participation.endReason === "ROOM_CLOSED"
    ) {
      return;
    }

    activities.push(
      Object.freeze({
        afterMessageSequence: participation.endedAfterMessageSequence,
        emittedAt: participation.endedAt,
        eventKey: createParticipationActivityKey(participation.participationId, "ended"),
        kind: participation.endReason === "BANNED" ? ("banned" as const) : ("left" as const),
        membershipId: participation.membershipId,
        participationId: participation.participationId,
        receivedOrder: index * 2 + 1,
        userLabel:
          participantDisplayNames.get(participation.membershipId) ?? participation.displayName,
      }),
    );
  });

  const roomClosedParticipation = participations.find(
    (participation) =>
      participation.status === "ENDED" &&
      participation.endReason === "ROOM_CLOSED" &&
      participation.endedAfterMessageSequence !== null &&
      participation.endedAt !== null,
  );

  if (
    roomClosedParticipation &&
    roomClosedParticipation.endedAfterMessageSequence !== null &&
    roomClosedParticipation.endedAt !== null
  ) {
    activities.push(
      Object.freeze({
        afterMessageSequence: roomClosedParticipation.endedAfterMessageSequence,
        emittedAt: roomClosedParticipation.endedAt,
        eventKey: createRoomClosedActivityKey(roomId),
        kind: "room-closed" as const,
        receivedOrder: participations.length * 2,
        roomId,
      }),
    );
  }

  return Object.freeze(activities);
}

export function combineChatRoomSystemActivities(
  restoredActivities: readonly ChatRoomSystemActivity[],
  realtimeActivities: readonly ChatRoomSystemActivity[],
): readonly ChatRoomSystemActivity[] {
  const activitiesByEventKey = new Map(
    realtimeActivities.map((activity) => [activity.eventKey, activity]),
  );

  for (const activity of restoredActivities) {
    activitiesByEventKey.set(activity.eventKey, activity);
  }

  return Object.freeze(
    [...activitiesByEventKey.values()].sort(
      (left, right) =>
        left.afterMessageSequence - right.afterMessageSequence ||
        Date.parse(left.emittedAt) - Date.parse(right.emittedAt) ||
        left.receivedOrder - right.receivedOrder ||
        left.eventKey.localeCompare(right.eventKey),
    ),
  );
}

export function createChatRoomSystemActivityMessage(
  activity: ChatRoomSystemActivity,
  participantDisplayNames: ReadonlyMap<string, string> = new Map(),
): string {
  if (activity.kind === "room-closed") {
    return "토론방이 종료되었습니다.";
  }

  const userLabel =
    activity.userLabel ?? participantDisplayNames.get(activity.membershipId) ?? "참여자";

  switch (activity.kind) {
    case "joined":
      return `${userLabel}님이 입장했습니다.`;
    case "left":
      return `${userLabel}님이 퇴장했습니다.`;
    case "banned":
      return `${userLabel}님을 내보냈습니다.`;
  }
}

export function createChatRoomEventKey(event: ChatRoomEventEnvelope): string {
  if (event.eventId) {
    return event.eventId;
  }

  return `fallback:${JSON.stringify([
    event.eventType,
    event.payload.roomId,
    event.payload.roomVersion,
    getRoomEventMemberStates(event).map((member) => [
      member.membershipId,
      member.participationId,
      member.membershipVersion,
    ]),
  ])}`;
}

function getSystemActivityState(
  bufferedEvent: Extract<ChatRealtimeBufferedEvent, { kind: "room" }>,
):
  | Readonly<{
      type: "participant";
      kind: Exclude<ChatRoomSystemActivityKind, "room-closed">;
      member: ChatRoomEventMemberState;
    }>
  | Readonly<{ type: "room"; kind: "room-closed" }>
  | null {
  switch (bufferedEvent.event.eventType) {
    case "ROOM_CLOSED":
      return { type: "room", kind: "room-closed" };
    case "ROOM_MEMBER_JOINED":
    case "ROOM_MEMBER_REJOINED":
      return { type: "participant", kind: "joined", member: bufferedEvent.event.payload.member };
    case "ROOM_MEMBER_LEFT":
      return { type: "participant", kind: "left", member: bufferedEvent.event.payload.member };
    case "ROOM_MEMBER_BANNED":
      return { type: "participant", kind: "banned", member: bufferedEvent.event.payload.member };
    default:
      return null;
  }
}

function getRoomEventMemberStates(
  event: ChatRoomEventEnvelope,
): readonly ChatRoomEventMemberState[] {
  switch (event.eventType) {
    case "ROOM_CREATED":
    case "ROOM_CLOSED":
      return [event.payload.owner];
    case "ROOM_MEMBER_JOINED":
    case "ROOM_MEMBER_REJOINED":
    case "ROOM_MEMBER_LEFT":
    case "ROOM_MEMBER_BANNED":
    case "ROOM_MEMBER_UNBANNED":
      return [event.payload.member];
    case "ROOM_OWNERSHIP_TRANSFERRED":
      return [event.payload.previousOwner, event.payload.newOwner];
    case "ROOM_SETTINGS_UPDATED":
      return [];
  }
}

function createParticipationActivityKey(
  participationId: string,
  phase: "entered" | "ended",
): string {
  return `participation:${participationId}:${phase}`;
}

function createRoomClosedActivityKey(roomId: string): string {
  return `room:${roomId}:closed`;
}
