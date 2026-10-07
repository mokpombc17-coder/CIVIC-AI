import type { RoomMembershipListItem } from "../chat-room-contracts";
import type {
  ChatRealtimeBufferedEvent,
  ChatRealtimeEventDelivery,
} from "./chat-realtime-event-buffer";
import type { ChatRoomEventEnvelope, ChatRoomEventMemberState } from "./chat-stomp-contracts";

export type ChatRoomSystemActivityKind = "joined" | "left" | "banned";

export type ChatRoomSystemActivity = Readonly<{
  afterMessageSequence: number;
  emittedAt: string;
  eventKey: string;
  kind: ChatRoomSystemActivityKind;
  membershipId: string;
  receivedOrder: number;
  userLabel: string | null;
}>;

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
  let receivedOrder = journal?.activities.at(-1)?.receivedOrder ?? 0;
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

    if (!activityState || activityState.member.membershipId === selfMembershipId) {
      continue;
    }

    const eventKey = createChatRoomEventKey(bufferedEvent.event);

    if (seenEventKeys.has(eventKey)) {
      continue;
    }

    receivedOrder += 1;
    seenEventKeys.add(eventKey);
    activities.push(
      Object.freeze({
        afterMessageSequence: latestMessageSequence,
        emittedAt: bufferedEvent.event.emittedAt,
        eventKey,
        kind: activityState.kind,
        membershipId: activityState.member.membershipId,
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

export function createMembershipEntrySystemActivities(
  memberships: readonly RoomMembershipListItem[],
  selfMembershipId: string | null,
): readonly ChatRoomSystemActivity[] {
  return Object.freeze(
    memberships.flatMap((membership, index) => {
      if (
        membership.membershipId === selfMembershipId ||
        membership.enteredAfterMessageSequence === undefined
      ) {
        return [];
      }

      return [
        Object.freeze({
          afterMessageSequence: membership.enteredAfterMessageSequence,
          emittedAt: membership.joinedAt,
          eventKey: `membership-entry:${membership.membershipId}:${membership.enteredAfterMessageSequence}`,
          kind: "joined" as const,
          membershipId: membership.membershipId,
          receivedOrder: index,
          userLabel: membership.userLabel ?? membership.displayName,
        }),
      ];
    }),
  );
}

export function combineChatRoomSystemActivities(
  restoredActivities: readonly ChatRoomSystemActivity[],
  realtimeActivities: readonly ChatRoomSystemActivity[],
): readonly ChatRoomSystemActivity[] {
  const realtimePlacementKeys = new Set(realtimeActivities.map(createActivityPlacementKey));
  const realtimeActivitiesByEventKey = new Map(
    realtimeActivities.map((activity) => [activity.eventKey, activity]),
  );
  const activities = [
    ...restoredActivities.filter(
      (activity) => !realtimePlacementKeys.has(createActivityPlacementKey(activity)),
    ),
    ...realtimeActivitiesByEventKey.values(),
  ];

  return Object.freeze(
    activities.sort(
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
      member.membershipVersion,
    ]),
  ])}`;
}

function getSystemActivityState(
  bufferedEvent: Extract<ChatRealtimeBufferedEvent, { kind: "room" }>,
): Readonly<{
  kind: ChatRoomSystemActivityKind;
  member: ChatRoomEventMemberState;
}> | null {
  switch (bufferedEvent.event.eventType) {
    case "ROOM_MEMBER_JOINED":
    case "ROOM_MEMBER_REJOINED":
      return { kind: "joined", member: bufferedEvent.event.payload.member };
    case "ROOM_MEMBER_LEFT":
      return { kind: "left", member: bufferedEvent.event.payload.member };
    case "ROOM_MEMBER_BANNED":
      return { kind: "banned", member: bufferedEvent.event.payload.member };
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

function createActivityPlacementKey(activity: ChatRoomSystemActivity): string {
  return `${activity.kind}:${activity.membershipId}:${activity.afterMessageSequence}`;
}
