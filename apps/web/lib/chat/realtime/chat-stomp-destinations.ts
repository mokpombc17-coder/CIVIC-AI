export const CHAT_SYSTEM_EVENTS_DESTINATION = "/user/queue/system-events";
export const CHAT_COMMAND_RESULTS_DESTINATION = "/user/queue/command-results";

export function getChatRoomMessagesDestination(roomId: string): string {
  return `/topic/rooms/${roomId}/messages`;
}

export function getChatRoomEventsDestination(roomId: string): string {
  return `/topic/rooms/${roomId}/room-events`;
}

export function getChatRoomMessageSendDestination(roomId: string): string {
  return `/app/rooms/${roomId}/messages`;
}

export function getChatRoomSubscriptionSyncDestination(roomId: string): string {
  return `/app/rooms/${roomId}/subscriptions/sync`;
}
